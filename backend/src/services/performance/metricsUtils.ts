import type { PerformanceMetrics } from '../../types/performance';

const COUNT_METRICS = new Set([
  'reach', 'impressions', 'views', 'uniqueViews', 'videoStarts', 'videoCompletions',
  'watchTimeSeconds', 'likes', 'comments', 'saves', 'shares', 'replies', 'clicks',
  'uniqueClicks', 'sessions', 'leads', 'qualifiedLeads', 'signups', 'trials',
  'addToCart', 'checkoutStarted', 'purchases', 'emailDelivered', 'emailOpens',
  'emailClicks', 'emailUnsubscribes',
]);

const RATE_METRICS = new Set(['ctr', 'completionRate', 'cpc', 'cpl', 'cpa', 'roas', 'averageWatchTimeSeconds']);

export const MINIMUM_IMPRESSIONS_FOR_CLASSIFICATION = 100;

export function isValidMetricValue(key: string, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return false;
  if (COUNT_METRICS.has(key) && value < 0) return false;
  if (key === 'revenue' || key === 'spend') return true;
  if (RATE_METRICS.has(key) && value < 0) return false;
  return true;
}

export function normalizeMetrics(input: Record<string, unknown>): { metrics: PerformanceMetrics; error?: string } {
  const metrics: PerformanceMetrics = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'currency') {
      if (value === null || value === undefined) metrics.currency = null;
      else if (typeof value === 'string') metrics.currency = value;
      else return { metrics: {}, error: `Invalid currency: ${key}` };
      continue;
    }
    if (value === null || value === undefined) {
      (metrics as Record<string, unknown>)[key] = null;
      continue;
    }
    if (!isValidMetricValue(key, value)) {
      return { metrics: {}, error: `Invalid metric value for ${key}` };
    }
    (metrics as Record<string, unknown>)[key] = value;
  }
  return { metrics };
}

export function mergeMetrics(items: PerformanceMetrics[]): PerformanceMetrics {
  const result: PerformanceMetrics = {};
  const keys = new Set<string>();
  for (const item of items) {
    for (const k of Object.keys(item)) keys.add(k);
  }
  for (const key of keys) {
    const values = items.map((m) => (m as Record<string, unknown>)[key]).filter((v) => v !== undefined);
    const nonNull = values.filter((v) => v !== null);
    if (nonNull.length === 0) {
      (result as Record<string, unknown>)[key] = null;
    } else if (key === 'currency') {
      const currencies = [...new Set(nonNull as string[])];
      (result as Record<string, unknown>)[key] = currencies.length === 1 ? currencies[0] : null;
    } else {
      (result as Record<string, unknown>)[key] = (nonNull as number[]).reduce((sum, v) => sum + v, 0);
    }
  }
  return result;
}

export function pickLatestCumulativeMetrics(
  observations: Array<{ measurementWindow: string; metrics: PerformanceMetrics; observedAt: string }>,
  preferredWindow?: string
): PerformanceMetrics {
  const windowPriority = ['LIFETIME', '30_DAYS', '14_DAYS', '7_DAYS', '72_HOURS', '24_HOURS', 'INITIAL', 'CUSTOM'];
  const byPublication = new Map<string, typeof observations>();

  // Group by window, pick highest priority window per content/schedule
  const sorted = [...observations].sort((a, b) => {
    if (preferredWindow) {
      if (a.measurementWindow === preferredWindow && b.measurementWindow !== preferredWindow) return -1;
      if (b.measurementWindow === preferredWindow && a.measurementWindow !== preferredWindow) return 1;
    }
    const ai = windowPriority.indexOf(a.measurementWindow);
    const bi = windowPriority.indexOf(b.measurementWindow);
    if (ai !== bi) return bi - ai;
    return b.observedAt.localeCompare(a.observedAt);
  });

  if (sorted.length === 0) return {};
  return sorted[0].metrics;
}

export function aggregateLatestObservations(
  observations: Array<{
    scheduleId?: string;
    contentKey: string;
    sourceCreativeArtifactId: string;
    sourceCreativeVersion: number;
    channel: string;
    measurementWindow: string;
    metrics: PerformanceMetrics;
    observedAt: string;
  }>
): PerformanceMetrics {
  const byKey = new Map<string, typeof observations[0]>();
  const windowPriority = ['LIFETIME', '30_DAYS', '14_DAYS', '7_DAYS', '72_HOURS', '24_HOURS', 'INITIAL', 'CUSTOM'];

  for (const obs of observations) {
    const key = `${obs.scheduleId ?? obs.contentKey}:${obs.sourceCreativeArtifactId}:${obs.sourceCreativeVersion}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, obs);
      continue;
    }
    const ai = windowPriority.indexOf(obs.measurementWindow);
    const bi = windowPriority.indexOf(existing.measurementWindow);
    if (ai < bi || (ai === bi && obs.observedAt > existing.observedAt)) {
      byKey.set(key, obs);
    }
  }

  return mergeMetrics([...byKey.values()].map((o) => o.metrics));
}

export function calculateRoas(
  revenue: number | null | undefined,
  spend: number | null | undefined,
  currency?: string | null,
  spendCurrency?: string | null
): { roas: number | null; mixedCurrency: boolean } {
  if (revenue == null || spend == null || spend <= 0) return { roas: null, mixedCurrency: false };
  if (currency && spendCurrency && currency !== spendCurrency) return { roas: null, mixedCurrency: true };
  return { roas: revenue / spend, mixedCurrency: false };
}

export function deriveRates(metrics: PerformanceMetrics): PerformanceMetrics {
  const result = { ...metrics };
  if (result.ctr == null && result.clicks != null && result.impressions != null && result.impressions > 0) {
    result.ctr = result.clicks / result.impressions;
  }
  if (
    result.completionRate == null &&
    result.videoCompletions != null &&
    result.videoStarts != null &&
    result.videoStarts > 0
  ) {
    result.completionRate = result.videoCompletions / result.videoStarts;
  }
  return result;
}

export function parseSuccessCriteriaTarget(criteria: string | null, primaryKpi: string): number | null {
  if (!criteria) return null;
  const normalized = criteria.toLowerCase().replace(/_/g, ' ');
  const kpi = primaryKpi.toLowerCase().replace(/_/g, ' ');

  const patterns = [
    new RegExp(`${kpi}\\s*>=\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
    new RegExp(`${kpi}\\s*≥\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s+${kpi}`, 'i'),
    new RegExp(`>=\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
    /(\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = criteria.match(pattern);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

export function getPrimaryKpiValue(metrics: PerformanceMetrics, primaryKpi: string, conversions?: {
  purchases: number;
  qualifiedLeads: number;
  revenue: number;
}): number | null {
  const kpi = primaryKpi.toLowerCase().replace(/_/g, '');
  const map: Record<string, number | null | undefined> = {
    purchases: conversions?.purchases ?? metrics.purchases,
    conversions: conversions?.purchases ?? metrics.purchases,
    revenue: conversions?.revenue ?? metrics.revenue,
    qualifiedleads: conversions?.qualifiedLeads ?? metrics.qualifiedLeads,
    leads: metrics.leads ?? conversions?.qualifiedLeads,
    reach: metrics.reach,
    impressions: metrics.impressions,
    views: metrics.views,
    clicks: metrics.clicks,
    websiteclicks: metrics.clicks,
    sessions: metrics.sessions,
    signups: metrics.signups,
    newsubscribers: metrics.signups,
    engagement: (metrics.comments ?? 0) + (metrics.saves ?? 0) + (metrics.shares ?? 0),
    engagementrate: metrics.impressions && metrics.impressions > 0
      ? (((metrics.comments ?? 0) + (metrics.saves ?? 0) + (metrics.shares ?? 0)) / metrics.impressions)
      : null,
  };
  const val = map[kpi] ?? (metrics as Record<string, unknown>)[primaryKpi];
  if (val === null || val === undefined) return null;
  return val as number;
}
