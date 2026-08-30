export type ProviderErrorCategory =
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'DESTINATION_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'MEDIA_INVALID'
  | 'RATE_LIMITED'
  | 'PROVIDER_TEMPORARY'
  | 'PROVIDER_REJECTED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_RESULT';

export type IntegrationConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'ERROR';

export interface IntegrationConnectionRecord {
  id: string;
  workspaceId: string;
  providerKey: string;
  status: IntegrationConnectionStatus;
  displayName: string;
  providerAccountId?: string;
  providerAccountName?: string;
  accessCredentialRef?: string;
  refreshCredentialRef?: string;
  expiresAt?: string;
  scopes: string[];
  capabilities: string[];
  lastVerifiedAt?: string;
  lastErrorCode?: string;
  lastErrorSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishingDestinationRecord {
  id: string;
  workspaceId: string;
  connectionId: string;
  providerKey: string;
  channel: string;
  externalDestinationId: string;
  displayName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  capabilities: string[];
  connectionStatus?: IntegrationConnectionStatus;
  unavailableReason?: string;
  selectable?: boolean;
}

export interface ProviderDestinationDiscovery {
  externalDestinationId: string;
  displayName: string;
  channel: string;
  capabilities: string[];
}

export const META_GRAPH_API_VERSION = 'v21.0';
export const META_REQUIRED_PERMISSIONS = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_read_engagement',
  'pages_show_list',
  'pages_manage_posts',
] as const;

/** Phase 3J supported publish operations — organic only, no paid ads. */
export const META_PUBLISH_CAPABILITIES = [
  'publish_image_feed',
  'publish_facebook_page_photo',
  'read_performance',
] as const;

export const META_UNSUPPORTED_CAPABILITIES = [
  'publish_story',
  'publish_reel',
  'publish_carousel',
  'publish_video_resumable',
  'paid_ads',
] as const;
