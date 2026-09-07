import type { ContentPlan, ContentPlanApproval, ContentPlanStatus } from '../../types/contentPlan';

export interface ContentPlanInsert {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourcePlanId: string;
  sourcePlanVersion: number;
  version: number;
  status: ContentPlanStatus;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPlanRevisionInsert {
  id: string;
  workspaceId: string;
  campaignId: string;
  fromContentPlanId: string;
  fromContentPlanVersion: number;
  requestText: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPlanApprovalUpsert {
  id: string;
  campaignId: string;
  workspaceId: string;
  contentPlanId: string;
  contentPlanVersion: number;
  approvedAt: string;
  createdAt: string;
}

export interface ContentPlanRepository {
  findCurrentByCampaignId(campaignId: string): Promise<ContentPlan | null>;
  findById(id: string, campaignId: string): Promise<ContentPlan | null>;
  listByCampaignId(campaignId: string): Promise<ContentPlan[]>;
  maxVersion(campaignId: string): Promise<number>;
  clearCurrentForCampaign(campaignId: string): Promise<void>;
  insert(input: ContentPlanInsert): Promise<ContentPlan>;
  replaceCurrentVersion(input: ContentPlanInsert): Promise<ContentPlan>;
  updateStatus(id: string, status: ContentPlanStatus, updatedAt: string): Promise<void>;
  restoreCurrent(id: string): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface ContentPlanRevisionRepository {
  insert(input: ContentPlanRevisionInsert): Promise<void>;
  markApplied(
    id: string,
    resultingContentPlanId: string,
    resultingContentPlanVersion: number,
    updatedAt: string,
  ): Promise<void>;
  markFailed(id: string, updatedAt: string): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface ContentPlanApprovalRepository {
  findByCampaignId(campaignId: string): Promise<ContentPlanApproval | null>;
  upsertByCampaignId(input: ContentPlanApprovalUpsert): Promise<void>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface ContentPlanningRepositories {
  plan: ContentPlanRepository;
  revision: ContentPlanRevisionRepository;
  approval: ContentPlanApprovalRepository;
}

export interface ContentPlanningFixtureIds {
  contentPlanIds: string[];
  contentPlanRevisionIds: string[];
  contentPlanApprovalIds: string[];
}
