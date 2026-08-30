import type { ContentFormat, MarketingChannel, PlannedContentType, PreviewDevice } from './channels';

export type ContentPlanStatus =
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REVISING'
  | 'APPROVED';

export interface AssetRequirement {
  id?: string;
  type:
    | 'PRODUCT_PHOTO'
    | 'LIFESTYLE_PHOTO'
    | 'VIDEO'
    | 'TESTIMONIAL'
    | 'LOGO'
    | 'UGC'
    | 'GRAPHIC'
    | 'LINK'
    | 'OTHER';
  description: string;
  required: boolean;
  quantity?: number;
}

export interface ContentConcept {
  id: string;
  contentKey: string;
  name: string;
  strategicPurpose: string;
  coreMessage: string;
  audienceNeed?: string;
  desiredResponse?: string;
  proofPoints: string[];
  hookDirection?: string;
  ctaDirection?: string;
  creativeIdea?: string;
  sequenceRole?: string;
}

export interface ContentDeliverable {
  id: string;
  contentKey: string;
  title: string;
  purpose: string;
  campaignRole: string;
  journeyStage?: string;
  channel: MarketingChannel;
  contentType: PlannedContentType;
  format: ContentFormat;
  deviceTargets?: PreviewDevice[];
  objectiveRole: string;
  primaryMessage: string;
  supportingMessages: string[];
  hookDirection?: string;
  ctaRole?: string;
  proofPoints: string[];
  creativeDirection: string;
  assetRequirements: AssetRequirement[];
  sourceConceptId?: string;
  adaptationOf?: string;
  adaptationNotes?: string;
  sequence?: number;
  timing?: {
    phase?: string;
    relativeOrder?: number;
    preferredDate?: string;
  };
  status?: string;
}

export interface CampaignContentPhase {
  key: string;
  name: string;
  order: number;
  purpose?: string;
}

export interface ContentPlanSummary {
  campaignNarrative: string;
  customerJourney?: string;
  contentStrategy: string;
}

export interface ContentPlanCadence {
  startDate?: string;
  endDate?: string;
  phases: CampaignContentPhase[];
  notes?: string;
}

export interface ContentPlan {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourcePlanId: string;
  sourcePlanVersion: number;
  version: number;
  summary: ContentPlanSummary;
  concepts: ContentConcept[];
  deliverables: ContentDeliverable[];
  cadence: ContentPlanCadence;
  status: ContentPlanStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPlanApproval {
  campaignId: string;
  contentPlanId: string;
  contentPlanVersion: number;
  approvedAt: string;
}
