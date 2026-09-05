export type BriefCompletenessStatus = 'COMPLETE' | 'NEEDS_INPUT';

export type BriefPatchFields = Partial<{
  timingStartDate: string | null;
  timingEndDate: string | null;
  offerDescription: string | null;
  offerValue: string | null;
  offerUrgency: string | null;
  additionalContext: string | null;
  proposition: string | null;
  audienceDescription: string | null;
}>;

export interface AssembledBrief {
  id: string;
  campaignId: string;
  workspaceId: string;
  sourceSummary: string | null;
  objectiveSummary: string | null;
  audienceDescription: string | null;
  audienceSegment: string | null;
  audienceProblem: string | null;
  audienceDesire: string | null;
  proposition: string | null;
  keyDetails: string[];
  offerDescription: string | null;
  offerValue: string | null;
  offerUrgency: string | null;
  offerConstraints: string[];
  timingStartDate: string | null;
  timingEndDate: string | null;
  timingImportantDates: string[];
  constraints: string[];
  additionalContext: string | null;
  completenessStatus: BriefCompletenessStatus;
  completenessMissingFields: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignChannelRecommendation {
  channel: string;
  role: string;
  rationale: string;
}

export interface CampaignContentRecommendation {
  contentType: string;
  channel: string;
  format: string;
  quantity: number;
  purpose: string;
}

export interface CampaignPlan {
  id: string;
  campaignId: string;
  workspaceId: string;
  version: number;
  status: string;
  isCurrent: boolean;
  strategy: {
    campaignAngle: string;
    coreMessage: string;
    proposition: string;
    audienceFocus: string;
  };
  hooks: {
    primary: string;
    supporting: string[];
  };
  proofPoints: string[];
  callToAction: {
    primary: string;
    alternatives: string[];
  };
  channels: CampaignChannelRecommendation[];
  contentMix: CampaignContentRecommendation[];
  cadence: {
    summary: string;
    duration: string | null;
  };
  creativeDirection: {
    visualDirection: string;
    photographyDirection: string | null;
    videoDirection: string | null;
    copyDirection: string;
  };
  measurement: {
    objective: string;
    primaryKpi: string;
    supportingKpis: string[];
    conversionEvent: string | null;
  };
  rationale: {
    summary: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BriefUpsertInput {  campaignId: string;
  workspaceId: string;
  sourceSummary: string | null;
  objectiveSummary: string | null;
  audienceDescription: string | null;
  audienceSegment: string | null;
  audienceProblem: string | null;
  audienceDesire: string | null;
  proposition: string | null;
  keyDetails: string[];
  offerDescription: string | null;
  offerValue: string | null;
  offerUrgency: string | null;
  offerConstraints: string[];
  timingStartDate: string | null;
  timingEndDate: string | null;
  timingImportantDates: string[];
  constraints: string[];
  additionalContext: string | null;
  completenessStatus: string;
  completenessMissingFields: string[];
  updatedAt: string;
}

export interface BriefInsertInput extends BriefUpsertInput {
  id: string;
  createdAt: string;
}

export interface PlanStoreInput {
  id: string;
  campaignId: string;
  workspaceId: string;
  version: number;
  status: string;
  isCurrent: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionCreateInput {
  id: string;
  campaignId: string;
  workspaceId: string;
  fromPlanId: string;
  fromPlanVersion: number;
  requestText: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanApprovalUpsertInput {
  id: string;
  campaignId: string;
  workspaceId: string;
  approvedPlanId: string;
  approvedVersion: number;
  approvedAt: string;
  createdAt: string;
}

export interface PlanApprovalRecord {
  approvedPlanId: string;
  approvedVersion: number;
  approvedAt: string;
}

export interface CampaignBriefRepository {
  findByCampaignId(campaignId: string): Promise<AssembledBrief | null>;
  insert(input: BriefInsertInput): Promise<AssembledBrief>;
  updateByCampaignId(input: BriefUpsertInput): Promise<AssembledBrief>;
  patchFields(campaignId: string, fields: BriefPatchFields, updatedAt: string): Promise<AssembledBrief | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface CampaignPlanRepository {
  getCurrent(campaignId: string): Promise<CampaignPlan | null>;
  listVersions(campaignId: string): Promise<CampaignPlan[]>;
  getById(planId: string, campaignId: string): Promise<CampaignPlan | null>;
  getMaxVersion(campaignId: string): Promise<number>;
  insert(input: PlanStoreInput): Promise<CampaignPlan>;
  markAllNonCurrent(campaignId: string): Promise<void>;
  markCurrent(planId: string): Promise<void>;
  updateStatus(planId: string, status: string, updatedAt: string): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface RevisionRequestRepository {
  create(input: RevisionCreateInput): Promise<void>;
  updateStatus(id: string, status: string, updatedAt: string): Promise<void>;
  findLatestForCampaign(campaignId: string): Promise<{ id: string; status: string } | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface PlanApprovalRepository {
  findByCampaignId(campaignId: string): Promise<PlanApprovalRecord | null>;
  upsertByCampaignId(input: PlanApprovalUpsertInput): Promise<void>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface PlanningRepositories {
  brief: CampaignBriefRepository;
  plan: CampaignPlanRepository;
  revision: RevisionRequestRepository;
  approval: PlanApprovalRepository;
}

export interface PlanningFixtureIds {
  briefIds: string[];
  planIds: string[];
  revisionIds: string[];
  approvalIds: string[];
  campaignIds: string[];
}
