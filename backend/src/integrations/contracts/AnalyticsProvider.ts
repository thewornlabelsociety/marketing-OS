export interface AnalyticsQuery {
  externalId: string;
  startDate: string;
  endDate: string;
  metrics: string[];
}

export interface AnalyticsResult {
  externalId: string;
  metrics: Record<string, number | null>;
  fetchedAt: string;
}

// Not every provider supports every metric — all values are nullable
export interface AnalyticsProvider {
  readonly provider: string;
  readonly supportedMetrics: string[];
  getMetrics(query: AnalyticsQuery): Promise<AnalyticsResult>;
}
