import type { MarketingChannel } from './channels';
import type { CreativeContent } from './creativeArtifact';
import type { PublishableAsset } from './scheduledContent';

export interface PublishRequest {
  workspaceId: string;
  campaignId: string;
  scheduleId: string;
  channel: MarketingChannel;
  destinationId: string;
  contentKey: string;
  creativeArtifactId: string;
  creativeVersion: number;
  content: CreativeContent;
  mediaAssets: PublishableAsset[];
  scheduledFor?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface PublishResult {
  success: boolean;
  externalPublishId?: string;
  externalUrl?: string;
  publishedAt?: string;
  providerKey: string;
  errorCode?: string;
  errorMessage?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface DestinationValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}
