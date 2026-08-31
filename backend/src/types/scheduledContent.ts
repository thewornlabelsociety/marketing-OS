import type { MarketingChannel } from './channels';
import type { CreativeContent } from './creativeArtifact';

export type ScheduledContentStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'READY'
  | 'BLOCKED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export type PublicationMode = 'DIRECT' | 'EXPORT' | 'MANUAL';

export interface PublishableAsset {
  id: string;
  type: string;
  storageProvider?: string;
  storageKey?: string;
  localPathReference?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  checksum?: string;
}

export interface ScheduledContentItem {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  channel: MarketingChannel;
  destinationId?: string;
  scheduledFor: string;
  timezone: string;
  status: ScheduledContentStatus;
  publicationMode: PublicationMode;
  mediaAssets: PublishableAsset[];
  notes?: string;
  publishedAt?: string;
  externalPublishId?: string;
  externalUrl?: string;
  cancelledAt?: string;
  blockReason?: string;
  newerRevisionAvailable?: boolean;
  /** True when the schedule has an UNKNOWN publish attempt that must be reconciled before retrying. */
  reconciliationRequired?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PublishAttemptStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface PublishAttempt {
  id: string;
  workspaceId: string;
  campaignId: string;
  scheduleId: string;
  attemptNumber: number;
  providerKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  idempotencyKey: string;
  status: PublishAttemptStatus;
  destinationId?: string;
  connectionId?: string;
  externalPublishId?: string;
  externalUrl?: string;
  providerStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
  mediaAssetIds?: string[];
  mediaChecksums?: string[];
  startedAt: string;
  completedAt?: string;
}

export interface PrePublishCheck {
  key: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  message?: string;
}

export interface PrePublishCheckResult {
  ready: boolean;
  checks: PrePublishCheck[];
  blockers: string[];
  warnings: string[];
}

export interface CampaignPublishingSummary {
  totalApprovedCreative: number;
  scheduled: number;
  published: number;
  failed: number;
  unscheduled: number;
  blocked: number;
  upcoming: ScheduledContentItem[];
  unscheduledItems: UnscheduledDeliverable[];
  publishedItems: ScheduledContentItem[];
  failedItems: ScheduledContentItem[];
}

export interface UnscheduledDeliverable {
  contentKey: string;
  title: string;
  channel: MarketingChannel;
  contentType: string;
  format: string;
  approvedVersion: number;
  creativeArtifactId: string;
  suggestedTiming?: string;
}

export interface PublicationExportBundle {
  campaign: { id: string; name: string };
  deliverable: { contentKey: string; title: string; channel: MarketingChannel; format: string };
  approvedCreativeVersion: number;
  creativeArtifactId: string;
  copy: CreativeContent;
  assetReferences: PublishableAsset[];
  scheduledFor: string;
  timezone: string;
  instructions: string;
}

export type IntegrationConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'ERROR';

export interface IntegrationConnection {
  id: string;
  workspaceId: string;
  providerKey: string;
  status: IntegrationConnectionStatus;
  displayName: string;
  providerAccountId?: string;
  providerAccountName?: string;
  scopes?: string[];
  capabilities: string[];
  expiresAt?: string;
  lastVerifiedAt?: string;
  lastErrorCode?: string;
  lastErrorSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export type PublishingDestinationStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR';

export interface PublishingDestination {
  id: string;
  workspaceId: string;
  connectionId: string;
  providerKey: string;
  channel: MarketingChannel;
  externalDestinationId: string;
  displayName: string;
  status: PublishingDestinationStatus;
  capabilities?: string[];
}
