export interface PublishingCapabilities {
  canSchedule: boolean;
  canPublishNow: boolean;
  supportedContentTypes: string[];
  supportedChannels: string[];
}

export interface PublishPayload {
  channel: string;
  contentId: string;
  body: string;
  assetUrls: string[];
  scheduledAt: string | null;
}

export interface PublishResult {
  externalId: string;
  publishedAt: string;
  url: string | null;
}

export interface PublishingProvider {
  readonly provider: string;
  readonly capabilities: PublishingCapabilities;
  publish(payload: PublishPayload): Promise<PublishResult>;
  cancel(externalId: string): Promise<void>;
  getStatus(externalId: string): Promise<string>;
}
