export type PublishStatus = 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';

export interface PublishRecord {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentId: string;
  channel: string;
  provider: string;
  status: PublishStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null; // provider's post ID
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
