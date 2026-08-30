import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { ConversionEvent, MeasurementWindow, PerformanceObservation } from '../../types/performance';
import type {
  EvidenceCompleteness,
  EvidenceConfidence,
  Experiment,
  ExperimentAnalysis,
  ExperimentOutcome,
  ExperimentVariant,
  MinimumEvidencePolicy,
  VariantAnalysisResult,
} from '../../types/experiment';
import { performanceIngestionService } from '../performance/PerformanceIngestionService';
import { performanceAggregationService } from '../performance/PerformanceAggregationService';
import { deriveRates, getPrimaryKpiValue, pickLatestCumulativeMetrics } from '../performance/metricsUtils';

export class ExperimentAnalysisService {
  analyze(
    experiment: Experiment,
    workspaceId: string,
    measurementWindow: MeasurementWindow,
  ): ExperimentAnalysis | { error: string; code: string } {
    if (experiment.variants.length < 2) {
      return { error: 'Experiment requires two variants', code: 'INSUFFICIENT_VARIANTS' };
    }

    const campaign = db.prepare(`
      SELECT c.*, o.objective_type, o.primary_kpi as objective_primary_kpi
      FROM campaigns c JOIN objectives o ON o.id = c.objective_id WHERE c.id = ?
    `).get(experiment.campaignId) as Record<string, unknown> | undefined;
    if (!campaign || campaign.workspace_id !== workspaceId) {
      return { error: 'Campaign not found', code: 'NOT_FOUND' };
    }

    const kpi = experiment.experimentKpi ?? experiment.primaryKpi;
    const campaignObjectiveKpi = experiment.primaryKpi;
    const policy = experiment.minimumEvidencePolicy;

    const obsResult = performanceIngestionService.listObservations(experiment.campaignId, workspaceId);
    const convResult = performanceIngestionService.listConversions(experiment.campaignId, workspaceId);
    if ('error' in obsResult || 'error' in convResult) {
      return { error: 'Failed to load performance evidence', code: 'PERFORMANCE_ERROR' };
    }

    const variantResults: VariantAnalysisResult[] = experiment.variants.map((variant) =>
      this.buildVariantResult(variant, obsResult, convResult, measurementWindow, kpi)
    );

    const analysis = this.determineOutcome({
      experiment,
      variantResults,
      measurementWindow,
      kpi,
      campaignObjectiveKpi,
      policy,
    });

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO experiment_analyses
        (id, workspace_id, experiment_id, measurement_window, analyzed_at, primary_kpi,
         variant_results, winner_variant_id, outcome, confidence, reasons, evidence_completeness,
         warnings, campaign_objective_impact, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      experiment.id,
      measurementWindow,
      now,
      kpi,
      JSON.stringify(variantResults),
      analysis.winnerVariantId ?? null,
      analysis.outcome,
      analysis.confidence,
      JSON.stringify(analysis.reasons),
      analysis.evidenceCompleteness,
      JSON.stringify(analysis.warnings),
      analysis.campaignObjectiveImpact ?? null,
      now,
    );

    return this.getAnalysis(id, workspaceId)!;
  }

  listAnalyses(experimentId: string, workspaceId: string): ExperimentAnalysis[] {
    const rows = db.prepare(`
      SELECT * FROM experiment_analyses WHERE experiment_id = ? AND workspace_id = ? ORDER BY analyzed_at ASC
    `).all(experimentId, workspaceId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapAnalysis(row));
  }

  getAnalysis(id: string, workspaceId: string): ExperimentAnalysis | null {
    const row = db.prepare('SELECT * FROM experiment_analyses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row || row.workspace_id !== workspaceId) return null;
    return this.mapAnalysis(row);
  }

  private mapAnalysis(row: Record<string, unknown>): ExperimentAnalysis {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      experimentId: row.experiment_id as string,
      measurementWindow: row.measurement_window as MeasurementWindow,
      analyzedAt: row.analyzed_at as string,
      primaryKpi: row.primary_kpi as string,
      variantResults: JSON.parse(row.variant_results as string) as VariantAnalysisResult[],
      winnerVariantId: row.winner_variant_id as string | undefined,
      outcome: row.outcome as ExperimentOutcome,
      confidence: row.confidence as EvidenceConfidence,
      reasons: JSON.parse(row.reasons as string) as string[],
      evidenceCompleteness: row.evidence_completeness as EvidenceCompleteness,
      warnings: JSON.parse(row.warnings as string) as string[],
      campaignObjectiveImpact: row.campaign_objective_impact as string | undefined,
      createdAt: row.created_at as string,
    };
  }

  private buildVariantResult(
    variant: ExperimentVariant,
    observations: PerformanceObservation[],
    conversions: ConversionEvent[],
    measurementWindow: MeasurementWindow,
    kpi: string,
  ): VariantAnalysisResult {
    const variantObs = observations.filter((o) => this.observationMatchesVariant(o, variant));
    const windowObs = variantObs.filter((o) => o.measurementWindow === measurementWindow);

    const metrics = deriveRates(
      pickLatestCumulativeMetrics(
        variantObs.map((o) => ({ measurementWindow: o.measurementWindow, metrics: o.metrics, observedAt: o.observedAt })),
        measurementWindow,
      ),
    );

    const variantConversions = conversions.filter((c) => this.conversionMatchesVariant(c, variant));
    const deduped = this.dedupeConversions(variantConversions);
    const convAgg = performanceAggregationService.aggregateConversions(deduped);
    const hasConversionEvidence = deduped.length > 0;

    const primaryKpiValue = getPrimaryKpiValue(
      metrics,
      kpi,
      hasConversionEvidence ? convAgg : undefined,
    );
    const impressions = metrics.impressions ?? metrics.emailDelivered ?? null;
    const clicks = metrics.clicks ?? metrics.emailClicks ?? null;

    return {
      variantId: variant.id,
      label: variant.label,
      role: variant.role,
      contentKey: variant.contentKey,
      creativeArtifactId: variant.creativeArtifactId,
      creativeVersion: variant.creativeVersion,
      scheduleId: variant.scheduleId,
      channel: variant.channel,
      measurementWindow: windowObs.length > 0 ? measurementWindow : variantObs[0]?.measurementWindow,
      metrics: {
        ...metrics,
        purchases: convAgg.purchases,
        qualifiedLeads: convAgg.qualifiedLeads,
        revenue: convAgg.revenue,
      } as Record<string, number | null>,
      primaryKpiValue,
      conversions: convAgg.purchases + convAgg.qualifiedLeads,
      revenue: convAgg.revenue,
      currency: metrics.currency ?? null,
      impressions,
      clicks,
    };
  }

  private observationMatchesVariant(obs: PerformanceObservation, variant: ExperimentVariant): boolean {
    if (variant.scheduleId && obs.scheduleId === variant.scheduleId) return true;
    return (
      obs.contentKey === variant.contentKey &&
      obs.sourceCreativeArtifactId === variant.creativeArtifactId &&
      obs.sourceCreativeVersion === variant.creativeVersion
    );
  }

  private conversionMatchesVariant(conv: ConversionEvent, variant: ExperimentVariant): boolean {
    const attr = conv.attribution;
    if (variant.scheduleId) {
      return attr.scheduleId === variant.scheduleId;
    }
    if (attr.contentKey && attr.contentKey === variant.contentKey) {
      if (attr.confidence === 'LOW' || attr.confidence === 'UNKNOWN') return false;
      return true;
    }
    if (attr.campaignId && !attr.contentKey && !attr.scheduleId) return false;
    return false;
  }

  private dedupeConversions(conversions: ConversionEvent[]): ConversionEvent[] {
    const seen = new Set<string>();
    const result: ConversionEvent[] = [];
    for (const c of conversions) {
      const key = c.externalConversionId ?? c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(c);
    }
    return result;
  }

  private determineOutcome(input: {
    experiment: Experiment;
    variantResults: VariantAnalysisResult[];
    measurementWindow: MeasurementWindow;
    kpi: string;
    campaignObjectiveKpi: string;
    policy: MinimumEvidencePolicy;
  }): {
    outcome: ExperimentOutcome;
    winnerVariantId?: string;
    confidence: EvidenceConfidence;
    reasons: string[];
    warnings: string[];
    evidenceCompleteness: EvidenceCompleteness;
    campaignObjectiveImpact?: string;
  } {
    const { variantResults, policy, experiment, kpi, campaignObjectiveKpi } = input;
    const reasons: string[] = [];
    const warnings: string[] = [...(experiment.mode === 'OBSERVATIONAL_COMPARISON'
      ? ['Observational comparison — not a randomized audience split.']
      : [])];

    const windows = variantResults.map((v) => v.measurementWindow).filter(Boolean);
    const uniqueWindows = new Set(windows);
    if (uniqueWindows.size > 1 || (windows.length > 0 && !windows.every((w) => w === input.measurementWindow))) {
      reasons.push('Measurement window mismatch between variants.');
      return {
        outcome: 'INCONCLUSIVE',
        confidence: 'LOW',
        reasons,
        warnings,
        evidenceCompleteness: 'PARTIAL',
        campaignObjectiveImpact: experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi ? 'UNKNOWN' : undefined,
      };
    }

    for (const v of variantResults) {
      const impressions = v.impressions ?? 0;
      const minImp = policy.minimumImpressionsPerVariant ?? 100;
      if (impressions < minImp) {
        reasons.push(`Variant ${v.label} below minimum impressions (${impressions} < ${minImp}).`);
      }
    }

    const tinySample = variantResults.every((v) => (v.impressions ?? 0) < (policy.minimumImpressionsPerVariant ?? 100));
    if (tinySample) {
      return {
        outcome: 'INSUFFICIENT_DATA',
        confidence: 'LOW',
        reasons: [...reasons, 'Sample size below minimum evidence threshold.'],
        warnings,
        evidenceCompleteness: 'INSUFFICIENT',
        campaignObjectiveImpact: experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi ? 'UNKNOWN' : undefined,
      };
    }

    const [a, b] = variantResults;
    const aVal = a.primaryKpiValue;
    const bVal = b.primaryKpiValue;

    if (aVal === null && bVal === null) {
      return {
        outcome: 'INSUFFICIENT_DATA',
        confidence: 'LOW',
        reasons: [...reasons, 'No comparable KPI evidence for either variant.'],
        warnings,
        evidenceCompleteness: 'INSUFFICIENT',
      };
    }
    if (aVal === null || bVal === null) {
      reasons.push('One variant has unknown KPI value — not equivalent to zero.');
      return {
        outcome: 'INCONCLUSIVE',
        confidence: 'LOW',
        reasons,
        warnings,
        evidenceCompleteness: 'PARTIAL',
        campaignObjectiveImpact: experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi ? 'UNKNOWN' : undefined,
      };
    }

    if (aVal === bVal) {
      return {
        outcome: 'NO_MEANINGFUL_DIFFERENCE',
        confidence: 'MEDIUM',
        reasons: [...reasons, `Both variants recorded the same ${kpi} value (${aVal}).`],
        warnings,
        evidenceCompleteness: 'COMPLETE',
        campaignObjectiveImpact: experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi ? 'UNKNOWN' : undefined,
      };
    }

    if (this.hasMixedCurrency(variantResults)) {
      warnings.push('Mixed currency detected — cost/ROAS comparison not directly comparable.');
      if (kpi.toLowerCase().includes('roas') || kpi.toLowerCase().includes('cpa') || kpi.toLowerCase().includes('cpl')) {
        return {
          outcome: 'INCONCLUSIVE',
          confidence: 'LOW',
          reasons: [...reasons, 'Mixed currency prevents direct cost comparison.'],
          warnings,
          evidenceCompleteness: 'PARTIAL',
        };
      }
    }

    const liftThreshold = experiment.minimumMeaningfulLift ?? 0;
    const diff = bVal - aVal;
    const base = aVal === 0 ? (bVal === 0 ? 1 : bVal) : Math.abs(aVal);
    const liftPct = (diff / base) * 100;

    if (Math.abs(liftPct) < liftThreshold) {
      return {
        outcome: 'NO_MEANINGFUL_DIFFERENCE',
        confidence: 'MEDIUM',
        reasons: [...reasons, `Difference ${liftPct.toFixed(2)}% below meaningful lift threshold ${liftThreshold}%.`],
        warnings,
        evidenceCompleteness: 'COMPLETE',
        campaignObjectiveImpact: experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi ? 'UNKNOWN' : undefined,
      };
    }

    const winner = bVal > aVal ? b : a;
    const loser = bVal > aVal ? a : b;
    const outcome: ExperimentOutcome = winner.label === 'A' ? 'VARIANT_A_WINS' : winner.label === 'B' ? 'VARIANT_B_WINS' : 'VARIANT_WINNER';

    const confidence: EvidenceConfidence =
      variantResults.every((v) => (v.impressions ?? 0) >= 1000) ? 'HIGH' :
      variantResults.every((v) => (v.impressions ?? 0) >= 500) ? 'MEDIUM' : 'LOW';

    reasons.push(`${winner.label} outperformed ${loser.label} on ${kpi} (${winner.primaryKpiValue} vs ${loser.primaryKpiValue}).`);

    return {
      outcome,
      winnerVariantId: winner.variantId,
      confidence,
      reasons,
      warnings,
      evidenceCompleteness: 'COMPLETE',
      campaignObjectiveImpact:
        experiment.experimentKpi && experiment.experimentKpi !== campaignObjectiveKpi
          ? 'Campaign objective impact not established from upstream KPI alone.'
          : undefined,
    };
  }

  private hasMixedCurrency(variantResults: VariantAnalysisResult[]): boolean {
    const currencies = new Set(variantResults.map((v) => v.currency).filter(Boolean));
    return currencies.size > 1;
  }
}

export const experimentAnalysisService = new ExperimentAnalysisService();
