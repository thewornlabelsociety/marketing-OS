import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { CampaignRow } from '../../types';
import type { MeasurementWindow } from '../../types/performance';
import type {
  Experiment,
  ExperimentAnalysis,
  ExperimentDistribution,
  ExperimentMode,
  ExperimentOutcome,
  ExperimentQualityResult,
  ExperimentStatus,
  ExperimentVariableType,
  MinimumEvidencePolicy,
  StructuredHypothesis,
  ExperimentVariant,
} from '../../types/experiment';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { learningService } from '../performance/LearningService';
import { experimentAnalysisService } from './ExperimentAnalysisService';
import { experimentQualityGate } from './ExperimentQualityGate';

interface ExperimentRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  hypothesis: string;
  hypothesis_structured: string | null;
  experiment_type: string;
  objective_id: string;
  primary_kpi: string;
  experiment_kpi: string | null;
  experiment_kpi_rationale: string | null;
  guardrail_metrics: string;
  variable_type: string;
  control_description: string;
  variant_description: string;
  status: string;
  mode: string;
  minimum_evidence_policy: string;
  minimum_meaningful_lift: number | null;
  outcome: string | null;
  winner_variant_id: string | null;
  confidence: string | null;
  cancellation_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VariantRow {
  id: string;
  workspace_id: string;
  experiment_id: string;
  label: string;
  role: string;
  content_key: string;
  creative_artifact_id: string;
  creative_version: number;
  schedule_id: string | null;
  channel: string;
  destination_id: string | null;
  description: string | null;
  created_at: string;
}

function mapVariant(row: VariantRow): ExperimentVariant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    experimentId: row.experiment_id,
    label: row.label,
    role: row.role as ExperimentVariant['role'],
    contentKey: row.content_key,
    creativeArtifactId: row.creative_artifact_id,
    creativeVersion: row.creative_version,
    scheduleId: row.schedule_id ?? undefined,
    channel: row.channel,
    destinationId: row.destination_id ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

function formatHypothesis(structured?: StructuredHypothesis): string {
  if (!structured) return '';
  return `If ${structured.ifChange}, then ${structured.thenEffect}, because ${structured.becauseRationale}, measured by ${structured.measuredBy}.`;
}

export class ExperimentService {
  list(campaignId: string, workspaceId: string): Experiment[] | { error: string; code: string } {
    const campaign = this.getCampaign(campaignId, workspaceId);
    if ('error' in campaign) return campaign;

    const rows = db.prepare(`
      SELECT * FROM experiments WHERE campaign_id = ? AND workspace_id = ? ORDER BY created_at DESC
    `).all(campaignId, workspaceId) as ExperimentRow[];
    return rows.map((row) => this.loadExperiment(row));
  }

  get(experimentId: string, campaignId: string, workspaceId: string): Experiment | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId) as ExperimentRow | undefined;
    if (!row) return { error: 'Experiment not found', code: 'NOT_FOUND' };
    if (row.workspace_id !== workspaceId || row.campaign_id !== campaignId) {
      return { error: 'Workspace mismatch', code: 'FORBIDDEN' };
    }
    return this.loadExperiment(row);
  }

  create(
    campaignId: string,
    workspaceId: string,
    input: {
      name: string;
      hypothesis?: string;
      hypothesisStructured?: StructuredHypothesis;
      variableType: ExperimentVariableType;
      controlDescription: string;
      variantDescription: string;
      mode?: ExperimentMode;
      experimentKpi?: string;
      experimentKpiRationale?: string;
      guardrailMetrics?: string[];
      minimumEvidencePolicy?: MinimumEvidencePolicy;
      minimumMeaningfulLift?: number;
      description?: string;
    },
  ): Experiment | { error: string; code: string } {
    const campaign = this.getCampaign(campaignId, workspaceId);
    if ('error' in campaign) return campaign;

    const objective = db.prepare('SELECT * FROM objectives WHERE id = ?').get(campaign.objective_id) as {
      id: string; primary_kpi: string;
    } | undefined;
    if (!objective) return { error: 'Objective not found', code: 'OBJECTIVE_NOT_FOUND' };

    const id = randomUUID();
    const now = new Date().toISOString();
    const hypothesis = input.hypothesis?.trim() || formatHypothesis(input.hypothesisStructured);
    if (!hypothesis) return { error: 'Hypothesis is required', code: 'VALIDATION_FAILED' };

    db.prepare(`
      INSERT INTO experiments
        (id, workspace_id, campaign_id, name, description, hypothesis, hypothesis_structured,
         experiment_type, objective_id, primary_kpi, experiment_kpi, experiment_kpi_rationale,
         guardrail_metrics, variable_type, control_description, variant_description, status, mode,
         minimum_evidence_policy, minimum_meaningful_lift, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'AB', ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      campaignId,
      input.name,
      input.description ?? null,
      hypothesis,
      input.hypothesisStructured ? JSON.stringify(input.hypothesisStructured) : null,
      objective.id,
      objective.primary_kpi,
      input.experimentKpi ?? null,
      input.experimentKpiRationale ?? null,
      JSON.stringify(input.guardrailMetrics ?? []),
      input.variableType,
      input.controlDescription,
      input.variantDescription,
      input.mode ?? 'OBSERVATIONAL_COMPARISON',
      JSON.stringify(input.minimumEvidencePolicy ?? { minimumImpressionsPerVariant: 100 }),
      input.minimumMeaningfulLift ?? null,
      now,
      now,
    );

    return this.get(id, campaignId, workspaceId) as Experiment;
  }

  update(
    experimentId: string,
    campaignId: string,
    workspaceId: string,
    patch: Partial<{
      name: string;
      description: string;
      hypothesis: string;
      hypothesisStructured: StructuredHypothesis;
      controlDescription: string;
      variantDescription: string;
      mode: ExperimentMode;
      experimentKpi: string;
      experimentKpiRationale: string;
      guardrailMetrics: string[];
      minimumEvidencePolicy: MinimumEvidencePolicy;
      minimumMeaningfulLift: number;
      status: ExperimentStatus;
    }>,
  ): Experiment | { error: string; code: string } {
    const current = this.get(experimentId, campaignId, workspaceId);
    if ('error' in current) return current;
    if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
      return { error: 'Cannot edit completed or cancelled experiment', code: 'INVALID_STATE' };
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE experiments SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        hypothesis = COALESCE(?, hypothesis),
        hypothesis_structured = COALESCE(?, hypothesis_structured),
        control_description = COALESCE(?, control_description),
        variant_description = COALESCE(?, variant_description),
        mode = COALESCE(?, mode),
        experiment_kpi = COALESCE(?, experiment_kpi),
        experiment_kpi_rationale = COALESCE(?, experiment_kpi_rationale),
        guardrail_metrics = COALESCE(?, guardrail_metrics),
        minimum_evidence_policy = COALESCE(?, minimum_evidence_policy),
        minimum_meaningful_lift = COALESCE(?, minimum_meaningful_lift),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.name ?? null,
      patch.description ?? null,
      patch.hypothesis ?? null,
      patch.hypothesisStructured ? JSON.stringify(patch.hypothesisStructured) : null,
      patch.controlDescription ?? null,
      patch.variantDescription ?? null,
      patch.mode ?? null,
      patch.experimentKpi ?? null,
      patch.experimentKpiRationale ?? null,
      patch.guardrailMetrics ? JSON.stringify(patch.guardrailMetrics) : null,
      patch.minimumEvidencePolicy ? JSON.stringify(patch.minimumEvidencePolicy) : null,
      patch.minimumMeaningfulLift ?? null,
      patch.status ?? null,
      now,
      experimentId,
    );

    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  addVariant(
    experimentId: string,
    campaignId: string,
    workspaceId: string,
    input: {
      label: string;
      role: 'CONTROL' | 'VARIANT';
      contentKey: string;
      creativeArtifactId: string;
      creativeVersion: number;
      channel: string;
      scheduleId?: string;
      destinationId?: string;
      description?: string;
    },
  ): Experiment | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    if (['RUNNING', 'COMPLETED', 'CANCELLED'].includes(exp.status)) {
      return { error: 'Cannot modify variants after experiment has started', code: 'INVALID_STATE' };
    }

    const artifact = creativeGeneratorService.getById(input.creativeArtifactId, campaignId);
    if (!artifact) return { error: 'Creative artifact not found', code: 'NOT_FOUND' };
    if (artifact.version !== input.creativeVersion) {
      return { error: 'Creative version mismatch', code: 'VERSION_MISMATCH' };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO experiment_variants
        (id, workspace_id, experiment_id, label, role, content_key, creative_artifact_id, creative_version,
         schedule_id, channel, destination_id, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, workspaceId, experimentId, input.label, input.role, input.contentKey,
      input.creativeArtifactId, input.creativeVersion, input.scheduleId ?? null,
      input.channel, input.destinationId ?? null, input.description ?? null, now,
    );

    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  validate(experimentId: string, campaignId: string, workspaceId: string): ExperimentQualityResult | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;

    const approvalErrors: string[] = [];
    for (const v of exp.variants) {
      const artifact = creativeGeneratorService.getById(v.creativeArtifactId, campaignId);
      if (!artifact || artifact.version !== v.creativeVersion) {
        approvalErrors.push(`Variant ${v.label} creative artifact not found.`);
        continue;
      }
      if (artifact.status !== 'APPROVED') {
        approvalErrors.push(`Variant ${v.label} creative is not approved.`);
      }
    }

    const gate = experimentQualityGate.validate({
      variableType: exp.variableType,
      mode: exp.mode,
      controlDescription: exp.controlDescription,
      variantDescription: exp.variantDescription,
      variants: exp.variants.map((v) => ({
        label: v.label,
        role: v.role,
        contentKey: v.contentKey,
        channel: v.channel,
        description: v.description,
      })),
    });

    if (approvalErrors.length > 0) {
      gate.findings.push(...approvalErrors.map((message) => ({
        code: 'CREATIVE_NOT_APPROVED',
        message,
        severity: 'ERROR' as const,
      })));
      gate.valid = false;
    }

    if (exp.variants.length < 2) {
      gate.findings.push({ code: 'INSUFFICIENT_VARIANTS', message: 'Control and variant required.', severity: 'ERROR' });
      gate.valid = false;
    }

    return gate;
  }

  start(experimentId: string, campaignId: string, workspaceId: string): Experiment | { error: string; code: string } {
    const validation = this.validate(experimentId, campaignId, workspaceId);
    if ('error' in validation) return validation;
    if (!validation.valid) {
      return { error: validation.findings.filter((f) => f.severity === 'ERROR').map((f) => f.message).join('; '), code: 'QUALITY_GATE_FAILED' };
    }

    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;

    const now = new Date().toISOString();

    for (const variant of exp.variants) {
      const artifact = creativeGeneratorService.getById(variant.creativeArtifactId, campaignId);
      if (!artifact || artifact.status !== 'APPROVED' || artifact.version !== variant.creativeVersion) {
        return { error: `Variant ${variant.label} is not eligible to run`, code: 'CREATIVE_NOT_APPROVED' };
      }

      if (variant.scheduleId) {
        db.prepare(`
          INSERT INTO experiment_distributions
            (id, workspace_id, experiment_id, variant_id, schedule_id, started_at, channel, mode, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), workspaceId, experimentId, variant.id, variant.scheduleId, now, variant.channel, exp.mode, now);
      }
    }

    db.prepare(`
      UPDATE experiments SET status = 'RUNNING', started_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, experimentId);

    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  pause(experimentId: string, campaignId: string, workspaceId: string): Experiment | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    if (exp.status !== 'RUNNING') return { error: 'Only running experiments can be paused', code: 'INVALID_STATE' };
    const now = new Date().toISOString();
    db.prepare(`UPDATE experiments SET status = 'PAUSED', updated_at = ? WHERE id = ?`).run(now, experimentId);
    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  cancel(experimentId: string, campaignId: string, workspaceId: string, reason?: string): Experiment | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    if (['COMPLETED', 'CANCELLED'].includes(exp.status)) {
      return { error: 'Experiment already finished', code: 'INVALID_STATE' };
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE experiments SET status = 'CANCELLED', outcome = 'CANCELLED', cancellation_reason = ?, ended_at = ?, updated_at = ? WHERE id = ?
    `).run(reason ?? null, now, now, experimentId);
    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  analyze(
    experimentId: string,
    campaignId: string,
    workspaceId: string,
    measurementWindow: MeasurementWindow = '7_DAYS',
  ): ExperimentAnalysis | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    return experimentAnalysisService.analyze(exp, workspaceId, measurementWindow);
  }

  listAnalyses(experimentId: string, campaignId: string, workspaceId: string): ExperimentAnalysis[] | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    return experimentAnalysisService.listAnalyses(experimentId, workspaceId);
  }

  complete(
    experimentId: string,
    campaignId: string,
    workspaceId: string,
    measurementWindow: MeasurementWindow = '7_DAYS',
  ): Experiment | { error: string; code: string } {
    const exp = this.get(experimentId, campaignId, workspaceId);
    if ('error' in exp) return exp;
    if (!['RUNNING', 'PAUSED'].includes(exp.status)) {
      return { error: 'Experiment must be running or paused to complete', code: 'INVALID_STATE' };
    }

    const analysis = experimentAnalysisService.analyze(exp, workspaceId, measurementWindow);
    if ('error' in analysis) return analysis;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE experiments
      SET status = 'COMPLETED', outcome = ?, winner_variant_id = ?, confidence = ?, ended_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      analysis.outcome,
      analysis.winnerVariantId ?? null,
      analysis.confidence,
      now,
      now,
      experimentId,
    );

    this.recordLearningEvidence(exp, analysis, workspaceId);

    return this.get(experimentId, campaignId, workspaceId) as Experiment;
  }

  private recordLearningEvidence(exp: Experiment, analysis: ExperimentAnalysis, workspaceId: string): void {
    if (analysis.outcome === 'INSUFFICIENT_DATA' || analysis.outcome === 'INCONCLUSIVE' || analysis.outcome === 'CANCELLED') {
      return;
    }

    const winner = analysis.variantResults.find((v) => v.variantId === analysis.winnerVariantId);
    const statement = winner
      ? `Experiment "${exp.name}": ${winner.label} performed better on ${analysis.primaryKpi} (${analysis.outcome.replace(/_/g, ' ').toLowerCase()}).`
      : `Experiment "${exp.name}": ${analysis.outcome.replace(/_/g, ' ').toLowerCase()} on ${analysis.primaryKpi}.`;

    learningService.recordExperimentCandidate({
      workspaceId,
      category: exp.variableType,
      statement,
      relevanceTags: [exp.variableType, analysis.primaryKpi],
      evidence: [
        { sourceType: 'experiment', sourceId: exp.id },
        { sourceType: 'experiment_analysis', sourceId: analysis.id },
        ...(winner ? [{ sourceType: 'experiment_variant', sourceId: winner.variantId }] : []),
        { sourceType: 'campaign', sourceId: exp.campaignId },
      ],
    });
  }

  private getCampaign(campaignId: string, workspaceId: string): CampaignRow | { error: string; code: string } {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };
    return campaign;
  }

  private loadExperiment(row: ExperimentRow): Experiment {
    const variants = (db.prepare('SELECT * FROM experiment_variants WHERE experiment_id = ? ORDER BY label ASC').all(row.id) as VariantRow[]).map(mapVariant);
    const distributions = (db.prepare('SELECT * FROM experiment_distributions WHERE experiment_id = ?').all(row.id) as Array<Record<string, unknown>>).map((d) => ({
      id: d.id as string,
      workspaceId: d.workspace_id as string,
      experimentId: d.experiment_id as string,
      variantId: d.variant_id as string,
      scheduleId: d.schedule_id as string | undefined,
      startedAt: d.started_at as string | undefined,
      endedAt: d.ended_at as string | undefined,
      channel: d.channel as string,
      destinationId: d.destination_id as string | undefined,
      estimatedAudience: d.estimated_audience as number | null | undefined,
      actualAudience: d.actual_audience as number | null | undefined,
      allocationPercentage: d.allocation_percentage as number | null | undefined,
      mode: d.mode as Experiment['mode'],
      createdAt: d.created_at as string,
    })) as ExperimentDistribution[];

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      name: row.name,
      description: row.description ?? undefined,
      hypothesis: row.hypothesis,
      hypothesisStructured: row.hypothesis_structured ? JSON.parse(row.hypothesis_structured) : undefined,
      experimentType: 'AB',
      objectiveId: row.objective_id,
      primaryKpi: row.primary_kpi,
      experimentKpi: row.experiment_kpi ?? undefined,
      experimentKpiRationale: row.experiment_kpi_rationale ?? undefined,
      guardrailMetrics: JSON.parse(row.guardrail_metrics || '[]'),
      variableType: row.variable_type as Experiment['variableType'],
      controlDescription: row.control_description,
      variantDescription: row.variant_description,
      status: row.status as ExperimentStatus,
      mode: row.mode as Experiment['mode'],
      minimumEvidencePolicy: JSON.parse(row.minimum_evidence_policy || '{}'),
      minimumMeaningfulLift: row.minimum_meaningful_lift ?? undefined,
      outcome: row.outcome as ExperimentOutcome | undefined,
      winnerVariantId: row.winner_variant_id ?? undefined,
      confidence: row.confidence as Experiment['confidence'],
      cancellationReason: row.cancellation_reason ?? undefined,
      startedAt: row.started_at ?? undefined,
      endedAt: row.ended_at ?? undefined,
      variants,
      distributions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const experimentService = new ExperimentService();
