export type CampaignStatus =
  | 'DRAFTING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REVISING'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'MEASURING'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'ARCHIVED';

export interface Campaign {
  id: string;
  workspaceId: string;
  objectiveId: string;
  name: string;
  status: CampaignStatus;
  brief: CampaignBrief | null;
  strategy: CampaignStrategy | null;
  channels: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignBrief {
  summary: string;
  targetAudienceId: string | null;
  offerId: string | null;
  keyMessages: string[];
  callToAction: string | null;
}

export interface CampaignStrategy {
  contentPlan: string;
  channels: string[];
  postingSchedule: string | null;
  budget: number | null;
}
