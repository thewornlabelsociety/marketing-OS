import type { MarketingChannel } from '../../types/channels';
import type { MeasurementWindow, PerformanceMetrics } from '../../types/performance';

export interface ProviderPerformanceItem {
  scheduleId?: string;
  contentKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  channel: MarketingChannel;
  destinationId?: string;
  externalPublishId?: string;
  measurementWindow: MeasurementWindow;
  observedAt: string;
  metrics: PerformanceMetrics;
  rawMetadata?: Record<string, unknown>;
}

export interface ProviderPerformanceResult {
  providerKey: string;
  items: ProviderPerformanceItem[];
}

export interface FetchPerformanceRequest {
  workspaceId: string;
  campaignId: string;
  scheduleIds?: string[];
}

export interface PerformanceProvider {
  providerKey: string;
  supports(channel: MarketingChannel): boolean;
  fetchPerformance(request: FetchPerformanceRequest): Promise<ProviderPerformanceResult>;
}
