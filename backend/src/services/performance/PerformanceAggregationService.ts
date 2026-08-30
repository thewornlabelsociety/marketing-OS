import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type {
  ChannelPerformanceSummary,
  ContentPerformanceSummary,
  ConversionEvent,
  PerformanceMetrics,
  PerformanceObservation,
} from '../../types/performance';
import { aggregateLatestObservations, deriveRates, mergeMetrics } from './metricsUtils';

export class PerformanceAggregationService {
  aggregateCampaignMetrics(observations: PerformanceObservation[]): PerformanceMetrics {
    const latest = aggregateLatestObservations(
      observations.map((o) => ({
        scheduleId: o.scheduleId,
        contentKey: o.contentKey,
        sourceCreativeArtifactId: o.sourceCreativeArtifactId,
        sourceCreativeVersion: o.sourceCreativeVersion,
        channel: o.channel,
        measurementWindow: o.measurementWindow,
        metrics: o.metrics,
        observedAt: o.observedAt,
      }))
    );
    return deriveRates(latest);
  }

  aggregateConversions(conversions: ConversionEvent[]): {
    purchases: number;
    revenue: number;
    qualifiedLeads: number;
    currency?: string | null;
    mixedCurrency: boolean;
  } {
    let purchases = 0;
    let revenue = 0;
    let qualifiedLeads = 0;
    const currencies = new Set<string>();

    for (const c of conversions) {
      if (c.conversionType === 'PURCHASE') {
        purchases += 1;
        if (c.value != null) revenue += c.value;
        if (c.currency) currencies.add(c.currency);
      }
      if (c.conversionType === 'QUALIFIED_LEAD') qualifiedLeads += 1;
      if (c.conversionType === 'LEAD') {
        // counted separately unless primary KPI is leads
      }
    }

    return {
      purchases,
      revenue,
      qualifiedLeads,
      currency: currencies.size === 1 ? [...currencies][0] : null,
      mixedCurrency: currencies.size > 1,
    };
  }

  contentSummaries(
    observations: PerformanceObservation[],
    conversions: ConversionEvent[]
  ): ContentPerformanceSummary[] {
    const groups = new Map<string, PerformanceObservation[]>();
    for (const obs of observations) {
      const key = `${obs.contentKey}:${obs.sourceCreativeArtifactId}:${obs.sourceCreativeVersion}`;
      const list = groups.get(key) ?? [];
      list.push(obs);
      groups.set(key, list);
    }

    const summaries: ContentPerformanceSummary[] = [];
    for (const [, obsList] of groups) {
      const sample = obsList[0];
      const bySchedule = new Map<string, typeof obsList>();
      for (const o of obsList) {
        const sk = o.scheduleId ?? `${o.contentKey}:${o.sourceCreativeArtifactId}:${o.sourceCreativeVersion}`;
        const list = bySchedule.get(sk) ?? [];
        list.push(o);
        bySchedule.set(sk, list);
      }
      const scheduleMetrics: PerformanceMetrics[] = [];
      for (const [, schedObs] of bySchedule) {
        scheduleMetrics.push(this.aggregateCampaignMetrics(schedObs));
      }
      const metrics = scheduleMetrics.length === 1
        ? scheduleMetrics[0]
        : mergeMetrics(scheduleMetrics);
      const contentConversions = conversions.filter(
        (c) =>
          c.contentKey === sample.contentKey &&
          (!c.attribution.contentKey || c.attribution.contentKey === sample.contentKey)
      );
      const conv = this.aggregateConversions(contentConversions);
      summaries.push({
        contentKey: sample.contentKey,
        sourceCreativeArtifactId: sample.sourceCreativeArtifactId,
        sourceCreativeVersion: sample.sourceCreativeVersion,
        channel: sample.channel,
        metrics,
        conversions: { purchases: conv.purchases, revenue: conv.revenue, currency: conv.currency },
      });
    }
    return summaries.sort((a, b) => (b.conversions.purchases - a.conversions.purchases) || (b.metrics.views ?? 0) - (a.metrics.views ?? 0));
  }

  channelSummaries(
    observations: PerformanceObservation[],
    conversions: ConversionEvent[]
  ): ChannelPerformanceSummary[] {
    const channels = new Set<string>();
    for (const o of observations) channels.add(o.channel);
    for (const c of conversions) {
      const obs = observations.find((o) => o.contentKey === c.contentKey);
      if (obs) channels.add(obs.channel);
    }

    const summaries: ChannelPerformanceSummary[] = [];
    for (const channel of channels) {
      const channelObs = observations.filter((o) => o.channel === channel);
      const channelContentKeys = new Set(channelObs.map((o) => o.contentKey));
      const channelConversions = conversions.filter(
        (c) => !c.contentKey || channelContentKeys.has(c.contentKey)
      );
      summaries.push({
        channel: channel as MarketingChannel,
        metrics: this.aggregateCampaignMetrics(channelObs),
        conversions: this.aggregateConversions(channelConversions),
      });
    }
    return summaries;
  }

  getWorkspaceBaseline(workspaceId: string, primaryKpi: string): number | null {
    const rows = db.prepare(`
      SELECT pe.primary_kpi_value, pe.primary_kpi
      FROM performance_evaluations pe
      JOIN campaigns c ON c.id = pe.campaign_id
      WHERE c.workspace_id = ?
        AND pe.classification NOT IN ('INSUFFICIENT_DATA')
        AND pe.primary_kpi = ?
      ORDER BY pe.evaluated_at DESC
      LIMIT 10
    `).all(workspaceId, primaryKpi) as Array<{ primary_kpi_value: number | null }>;

    const values = rows.map((r) => r.primary_kpi_value).filter((v): v is number => v != null);
    if (values.length < 3) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

export const performanceAggregationService = new PerformanceAggregationService();
