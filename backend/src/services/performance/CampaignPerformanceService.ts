import { db } from '../../db/database';
import { PerformanceProviderRegistry } from '../../integrations/adapters/PerformanceProviderRegistry';
import type { CampaignRow, ObjectiveRow } from '../../types';
import type {
  CampaignPerformanceSummary,
  MeasurementWindow,
  PerformanceClassification,
} from '../../types/performance';
import { calculateRoas, deriveRates } from './metricsUtils';
import { objectiveEvaluationService } from './ObjectiveEvaluationService';
import { performanceAggregationService } from './PerformanceAggregationService';
import { performanceIngestionService } from './PerformanceIngestionService';
import { performanceLearningService } from './PerformanceLearningService';

interface ScheduleRow {
  id: string;
  content_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  channel: string;
  destination_id: string | null;
  external_publish_id: string | null;
  provider_key?: string;
}

export class CampaignPerformanceService {
  getSummary(
    campaignId: string,
    workspaceId: string,
    measurementWindow: MeasurementWindow = '7_DAYS'
  ): CampaignPerformanceSummary | { error: string; code: string } {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const objective = db.prepare('SELECT * FROM objectives WHERE id = ?').get(campaign.objective_id) as ObjectiveRow | undefined;
    if (!objective) return { error: 'Objective not found', code: 'NOT_FOUND' };

    const observationsResult = performanceIngestionService.listObservations(campaignId, workspaceId);
    if ('error' in observationsResult) return observationsResult;

    const conversionsResult = performanceIngestionService.listConversions(campaignId, workspaceId);
    if ('error' in conversionsResult) return conversionsResult;

    const metrics = deriveRates(performanceAggregationService.aggregateCampaignMetrics(observationsResult));
    const conv = performanceAggregationService.aggregateConversions(conversionsResult);
    const contentSummaries = performanceAggregationService.contentSummaries(observationsResult, conversionsResult);
    const channelSummaries = performanceAggregationService.channelSummaries(observationsResult, conversionsResult);

    const evaluation = objectiveEvaluationService.evaluate({
      campaignId,
      workspaceId,
      objective,
      observations: observationsResult,
      conversions: conversionsResult,
      measurementWindow,
    });

    const { roas, mixedCurrency } = calculateRoas(
      conv.revenue,
      metrics.spend ?? null,
      conv.currency,
      metrics.currency
    );

    const sorted = [...contentSummaries];
    const topContent = sorted.slice(0, 3);
    const underperformingContent = sorted.slice().reverse().slice(0, 3);

    const lastObservedAt = observationsResult.length > 0
      ? observationsResult.reduce((latest, o) => (o.observedAt > latest ? o.observedAt : latest), observationsResult[0].observedAt)
      : undefined;

    const blueprintCandidate =
      (evaluation.classification === 'HIGH_PERFORMING' || evaluation.classification === 'EXCEPTIONAL') &&
      evaluation.confidence !== 'LOW';

    return {
      campaignId,
      campaignName: campaign.name,
      objective: {
        id: objective.id,
        name: objective.name,
        type: objective.objective_type,
        primaryKpi: objective.primary_kpi,
      },
      classification: evaluation.classification,
      confidence: evaluation.confidence,
      primaryKpi: evaluation.primaryKpi,
      primaryKpiValue: evaluation.primaryKpiValue,
      metrics,
      conversions: conv,
      spend: metrics.spend ?? null,
      roas,
      mixedCurrency,
      topContent,
      underperformingContent,
      channelPerformance: channelSummaries,
      evaluationReasons: evaluation.reasons,
      lastObservedAt,
      measurementWindow,
      blueprintCandidate,
    };
  }

  evaluate(
    campaignId: string,
    workspaceId: string,
    measurementWindow: MeasurementWindow = '7_DAYS'
  ): ReturnType<typeof objectiveEvaluationService.evaluate> | { error: string; code: string } {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const objective = db.prepare('SELECT * FROM objectives WHERE id = ?').get(campaign.objective_id) as ObjectiveRow | undefined;
    if (!objective) return { error: 'Objective not found', code: 'NOT_FOUND' };

    const observationsResult = performanceIngestionService.listObservations(campaignId, workspaceId);
    if ('error' in observationsResult) return observationsResult;
    const conversionsResult = performanceIngestionService.listConversions(campaignId, workspaceId);
    if ('error' in conversionsResult) return conversionsResult;

    const evaluation = objectiveEvaluationService.evaluate({
      campaignId,
      workspaceId,
      objective,
      observations: observationsResult,
      conversions: conversionsResult,
      measurementWindow,
    });

    objectiveEvaluationService.persistEvaluation(workspaceId, evaluation);
    performanceLearningService.extractFromCampaign(campaignId, workspaceId, evaluation.classification);

    return evaluation;
  }

  async refreshFromProvider(
    campaignId: string,
    workspaceId: string,
    providerKey?: string
  ): Promise<{ ingested: number } | { error: string; code: string }> {
    const campaign = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campaignId) as { workspace_id: string } | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const schedules = db.prepare(`
      SELECT sci.*, pd.provider_key
      FROM scheduled_content_items sci
      LEFT JOIN publishing_destinations pd ON pd.id = sci.destination_id
      WHERE sci.campaign_id = ? AND sci.status = 'PUBLISHED'
    `).all(campaignId) as ScheduleRow[];

    if (schedules.length === 0) return { ingested: 0 };

    const key = providerKey ?? schedules[0].provider_key ?? 'mock';
    const provider = PerformanceProviderRegistry.get(key);
    if (!provider) return { error: 'Performance provider unavailable', code: 'PERFORMANCE_PROVIDER_UNAVAILABLE' };

    const result = await provider.fetchPerformance({ workspaceId, campaignId });
    let ingested = 0;

    for (const item of result.items) {
      let mediaAssetId: string | undefined;
      if (item.scheduleId) {
        const sched = db.prepare('SELECT media_assets FROM scheduled_content_items WHERE id = ?').get(item.scheduleId) as { media_assets: string } | undefined;
        if (sched) {
          const assets = JSON.parse(sched.media_assets) as Array<{ id: string }>;
          mediaAssetId = assets[0]?.id;
        }
      }
      const created = performanceIngestionService.createObservation({
        workspaceId,
        campaignId,
        scheduleId: item.scheduleId,
        contentKey: item.contentKey,
        sourceCreativeArtifactId: item.sourceCreativeArtifactId,
        sourceCreativeVersion: item.sourceCreativeVersion,
        channel: item.channel,
        providerKey: result.providerKey,
        destinationId: item.destinationId,
        externalPublishId: item.externalPublishId,
        mediaAssetId,
        observedAt: item.observedAt,
        measurementWindow: item.measurementWindow,
        metrics: item.metrics as Record<string, unknown>,
        source: 'PROVIDER',
        rawMetadata: item.rawMetadata,
      });
      if (created.observation) ingested += 1;
    }

    return { ingested };
  }

  getWorkspaceSummary(workspaceId: string): {
    campaignsMeasured: number;
    attributedConversions: number;
    attributedRevenue: number;
    spend: number | null;
    roas: number | null;
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      objectiveType: string;
      classification: PerformanceClassification;
      primaryKpi: string;
      primaryKpiValue?: number | null;
      revenue?: number;
      status: string;
    }>;
  } {
    const campaigns = db.prepare(
      'SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspaceId) as CampaignRow[];

    let attributedConversions = 0;
    let attributedRevenue = 0;
    let spend: number | null = null;
    let campaignsMeasured = 0;
    const summaryCampaigns: Array<{
      campaignId: string;
      campaignName: string;
      objectiveType: string;
      classification: PerformanceClassification;
      primaryKpi: string;
      primaryKpiValue?: number | null;
      revenue?: number;
      status: string;
    }> = [];

    for (const campaign of campaigns) {
      const obs = performanceIngestionService.listObservations(campaign.id, workspaceId);
      if ('error' in obs || obs.length === 0) continue;
      campaignsMeasured += 1;

      const summary = this.getSummary(campaign.id, workspaceId);
      if ('error' in summary) continue;

      attributedConversions += summary.conversions.purchases + summary.conversions.qualifiedLeads;
      attributedRevenue += summary.conversions.revenue;
      if (summary.spend != null) spend = (spend ?? 0) + summary.spend;

      summaryCampaigns.push({
        campaignId: campaign.id,
        campaignName: summary.campaignName,
        objectiveType: summary.objective.type,
        classification: summary.classification,
        primaryKpi: summary.primaryKpi,
        primaryKpiValue: summary.primaryKpiValue,
        revenue: summary.conversions.revenue,
        status: campaign.status,
      });
    }

    const { roas } = calculateRoas(attributedRevenue, spend, null, null);

    return {
      campaignsMeasured,
      attributedConversions,
      attributedRevenue,
      spend,
      roas,
      campaigns: summaryCampaigns,
    };
  }
}

export const campaignPerformanceService = new CampaignPerformanceService();
