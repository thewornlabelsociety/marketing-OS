import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { ObjectiveRow } from '../../types';
import type {
  ConversionEvent,
  MeasurementWindow,
  ObjectiveEvaluation,
  PerformanceClassification,
  PerformanceEvaluationRecord,
  PerformanceMetrics,
  PerformanceObservation,
} from '../../types/performance';
import {
  MINIMUM_IMPRESSIONS_FOR_CLASSIFICATION,
  getPrimaryKpiValue,
  parseSuccessCriteriaTarget,
} from './metricsUtils';
import { performanceAggregationService } from './PerformanceAggregationService';

export class ObjectiveEvaluationService {
  evaluate(input: {
    campaignId: string;
    workspaceId: string;
    objective: ObjectiveRow;
    observations: PerformanceObservation[];
    conversions: ConversionEvent[];
    measurementWindow: MeasurementWindow;
  }): ObjectiveEvaluation {
    const { objective, observations, conversions, measurementWindow } = input;
    const metrics = performanceAggregationService.aggregateCampaignMetrics(observations);
    const conv = performanceAggregationService.aggregateConversions(conversions);

    const primaryKpi = objective.primary_kpi;
    const primaryKpiValue = getPrimaryKpiValue(metrics, primaryKpi, conv);

    const impressions = metrics.impressions ?? metrics.views ?? metrics.reach ?? 0;
    const hasConversionEvidence = conv.purchases > 0 || conv.qualifiedLeads > 0 || (metrics.leads ?? 0) > 0;

    if (!objective.primary_kpi || !objective.objective_type) {
      return this.buildEvaluation(input, primaryKpi, primaryKpiValue, metrics, conv, 'INSUFFICIENT_DATA', 'LOW', [
        'Objective configuration incomplete',
      ], measurementWindow);
    }

    if (impressions < MINIMUM_IMPRESSIONS_FOR_CLASSIFICATION && !hasConversionEvidence) {
      return this.buildEvaluation(input, primaryKpi, primaryKpiValue, metrics, conv, 'INSUFFICIENT_DATA', 'LOW', [
        `Only ${impressions} impressions recorded. More evidence needed before classification.`,
      ], measurementWindow);
    }

    const target = parseSuccessCriteriaTarget(objective.success_criteria, primaryKpi);
    const objectiveType = objective.objective_type;

    let classification: PerformanceClassification = 'AVERAGE';
    const reasons: string[] = [];
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

    if (objectiveType === 'SALES') {
      const purchases = conv.purchases;
      if (target != null) {
        if (purchases >= target * 1.5) classification = 'EXCEPTIONAL';
        else if (purchases >= target * 1.1) classification = 'HIGH_PERFORMING';
        else if (purchases >= target) classification = 'ABOVE_AVERAGE';
        else if (purchases >= target * 0.7) classification = 'AVERAGE';
        else if (purchases >= target * 0.4) classification = 'BELOW_AVERAGE';
        else classification = 'LOW_PERFORMING';
        reasons.push(
          purchases >= target
            ? `${purchases} purchases met or exceeded target of ${target}`
            : `${purchases} purchases below target of ${target}`
        );
      } else if (purchases === 0 && (metrics.views ?? 0) > 1000) {
        classification = 'LOW_PERFORMING';
        reasons.push('High reach but zero purchases for Sales objective');
        confidence = 'HIGH';
      } else if (purchases > 0) {
        classification = 'ABOVE_AVERAGE';
        reasons.push(`${purchases} attributed purchases recorded`);
      } else {
        classification = 'LOW_PERFORMING';
        reasons.push('No purchases recorded for Sales objective');
      }
    } else if (objectiveType === 'AWARENESS') {
      const reach = metrics.reach ?? metrics.impressions ?? metrics.views ?? 0;
      if (target != null) {
        if (reach >= target * 1.5) classification = 'EXCEPTIONAL';
        else if (reach >= target * 1.1) classification = 'HIGH_PERFORMING';
        else if (reach >= target) classification = 'ABOVE_AVERAGE';
        else if (reach >= target * 0.7) classification = 'AVERAGE';
        else classification = 'BELOW_AVERAGE';
        reasons.push(`${reach} reach vs target ${target}`);
      } else if (reach >= 50000) {
        classification = 'HIGH_PERFORMING';
        reasons.push(`Strong reach of ${reach} for awareness objective`);
      } else if (reach >= 10000) {
        classification = 'ABOVE_AVERAGE';
        reasons.push(`Moderate reach of ${reach}`);
      } else {
        classification = 'AVERAGE';
        reasons.push(`Reach of ${reach} recorded`);
      }
      if (conv.purchases === 0) {
        reasons.push('Few or no direct purchases — acceptable for awareness objective');
      }
    } else if (objectiveType === 'LEAD_GENERATION') {
      const leads = conv.qualifiedLeads || (metrics.qualifiedLeads ?? 0) || (metrics.leads ?? 0);
      if (target != null) {
        if (leads >= target * 1.5) classification = 'EXCEPTIONAL';
        else if (leads >= target * 1.1) classification = 'HIGH_PERFORMING';
        else if (leads >= target) classification = 'ABOVE_AVERAGE';
        else if (leads >= target * 0.7) classification = 'AVERAGE';
        else classification = 'LOW_PERFORMING';
        reasons.push(`${leads} qualified leads vs target ${target}`);
      } else if (leads > 0) {
        classification = 'ABOVE_AVERAGE';
        reasons.push(`${leads} leads recorded`);
      }
    } else {
      if (primaryKpiValue != null && target != null) {
        if (primaryKpiValue >= target * 1.2) classification = 'HIGH_PERFORMING';
        else if (primaryKpiValue >= target) classification = 'ABOVE_AVERAGE';
        else if (primaryKpiValue >= target * 0.7) classification = 'AVERAGE';
        else classification = 'BELOW_AVERAGE';
        reasons.push(`${primaryKpi}: ${primaryKpiValue} vs target ${target}`);
      } else if (primaryKpiValue != null) {
        classification = 'AVERAGE';
        reasons.push(`${primaryKpi}: ${primaryKpiValue}`);
        confidence = 'LOW';
      } else {
        classification = 'INSUFFICIENT_DATA';
        reasons.push('Insufficient primary KPI data');
        confidence = 'LOW';
      }
    }

    const baseline = performanceAggregationService.getWorkspaceBaseline(input.workspaceId, primaryKpi);
    if (baseline != null && primaryKpiValue != null) {
      if (primaryKpiValue >= baseline * 1.3) reasons.push(`Primary KPI exceeds workspace baseline (${baseline.toFixed(1)})`);
      else if (primaryKpiValue < baseline * 0.7) reasons.push(`Primary KPI below workspace baseline (${baseline.toFixed(1)})`);
    }

    return this.buildEvaluation(input, primaryKpi, primaryKpiValue, metrics, conv, classification, confidence, reasons, measurementWindow);
  }

  private buildEvaluation(
    input: { campaignId: string; workspaceId: string; objective: ObjectiveRow },
    primaryKpi: string,
    primaryKpiValue: number | null,
    metrics: PerformanceMetrics,
    conv: ReturnType<typeof performanceAggregationService.aggregateConversions>,
    classification: PerformanceClassification,
    confidence: 'HIGH' | 'MEDIUM' | 'LOW',
    reasons: string[],
    measurementWindow: MeasurementWindow
  ): ObjectiveEvaluation {
    return {
      campaignId: input.campaignId,
      objectiveId: input.objective.id,
      objectiveType: input.objective.objective_type,
      primaryKpi,
      primaryKpiValue,
      supportingResults: JSON.parse(input.objective.supporting_kpis || '[]').map((kpi: string) => ({
        kpi,
        value: getPrimaryKpiValue(metrics, kpi, conv),
      })),
      conversionResult: {
        purchases: conv.purchases,
        revenue: conv.revenue,
        currency: conv.currency,
      },
      successCriteria: input.objective.success_criteria,
      classification,
      confidence,
      reasons,
      evaluatedAt: new Date().toISOString(),
      measurementWindow,
    };
  }

  persistEvaluation(
    workspaceId: string,
    evaluation: ObjectiveEvaluation
  ): PerformanceEvaluationRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO performance_evaluations
        (id, workspace_id, campaign_id, objective_id, objective_type, measurement_window,
         classification, confidence, primary_kpi, primary_kpi_value, score, reasons, evaluated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      evaluation.campaignId,
      evaluation.objectiveId,
      evaluation.objectiveType,
      evaluation.measurementWindow,
      evaluation.classification,
      evaluation.confidence,
      evaluation.primaryKpi,
      evaluation.primaryKpiValue ?? null,
      evaluation.score ?? null,
      JSON.stringify(evaluation.reasons),
      evaluation.evaluatedAt,
      now
    );
    return { ...evaluation, id, workspaceId };
  }

  getLatestEvaluation(campaignId: string, measurementWindow?: MeasurementWindow): PerformanceEvaluationRecord | null {
    const row = measurementWindow
      ? db.prepare(`
          SELECT * FROM performance_evaluations
          WHERE campaign_id = ? AND measurement_window = ?
          ORDER BY evaluated_at DESC LIMIT 1
        `).get(campaignId, measurementWindow)
      : db.prepare(`
          SELECT * FROM performance_evaluations
          WHERE campaign_id = ?
          ORDER BY evaluated_at DESC LIMIT 1
        `).get(campaignId);

    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      campaignId: r.campaign_id as string,
      objectiveId: r.objective_id as string,
      objectiveType: r.objective_type as string,
      measurementWindow: r.measurement_window as MeasurementWindow,
      classification: r.classification as PerformanceClassification,
      confidence: r.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
      primaryKpi: r.primary_kpi as string,
      primaryKpiValue: r.primary_kpi_value as number | null,
      score: r.score as number | null,
      supportingResults: [],
      reasons: JSON.parse(r.reasons as string) as string[],
      evaluatedAt: r.evaluated_at as string,
    };
  }

  listEvaluations(campaignId: string): PerformanceEvaluationRecord[] {
    const rows = db.prepare(
      'SELECT * FROM performance_evaluations WHERE campaign_id = ? ORDER BY evaluated_at ASC'
    ).all(campaignId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      campaignId: r.campaign_id as string,
      objectiveId: r.objective_id as string,
      objectiveType: r.objective_type as string,
      measurementWindow: r.measurement_window as MeasurementWindow,
      classification: r.classification as PerformanceClassification,
      confidence: r.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
      primaryKpi: r.primary_kpi as string,
      primaryKpiValue: r.primary_kpi_value as number | null,
      score: r.score as number | null,
      supportingResults: [],
      reasons: JSON.parse(r.reasons as string) as string[],
      evaluatedAt: r.evaluated_at as string,
    }));
  }
}

export const objectiveEvaluationService = new ObjectiveEvaluationService();
