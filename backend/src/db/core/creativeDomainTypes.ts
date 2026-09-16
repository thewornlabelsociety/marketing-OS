import type { CreativeApproval, CreativeArtifact } from '../../types/creativeArtifact';

export interface CreativeArtifactInsert {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourceContentPlanId: string;
  sourceContentPlanVersion: number;
  contentKey: string;
  deliverableId: string;
  version: number;
  status: string;
  channel: string;
  contentType: string;
  format: string;
  title: string | null;
  content: string;
  quality: string;
  createdAt: string;
  updatedAt: string;
  // optional extended fields
  creativeDirection?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiGenerated?: boolean;
  aiTaskType?: string | null;
  repurposeRequestId?: string | null;
  marketingScopesJson?: string | null;
  marketingScope?: string | null;
  mediaAssetId?: string | null;
}

export interface CreativeSourceLinkRow {
  sourceRecordId: string;
  position: number;
}

export interface CreativeSourceLinkRepository {
  insert(artifactId: string, sourceRecordId: string, position: number, createdAt: string): Promise<void>;
  listByArtifactId(artifactId: string): Promise<CreativeSourceLinkRow[]>;
  copyFromParent(parentArtifactId: string, childArtifactId: string, createdAt: string): Promise<void>;
  countBySourceRecordId(sourceRecordId: string): Promise<number>;
}

export interface CreativeDerivationRepository {
  insert(parentArtifactId: string, childArtifactId: string, relationship: string, createdAt: string): Promise<void>;
}

export interface CreativeRevisionInsert {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey: string;
  creativeArtifactId: string;
  sourceVersion: number;
  requestText: string;
  targetHint: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeApprovalUpsert {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey: string;
  creativeArtifactId: string;
  approvedVersion: number;
  approvedAt: string;
  createdAt: string;
}

export interface ApprovedCurrentCreativeRow {
  artifactId: string;
  campaignId: string;
  contentKey: string;
  channel: string;
  contentType: string;
  format: string;
  version: number;
  campaignName: string;
}

export interface CreativeArtifactRepository {
  findCurrentByCampaignAndKey(campaignId: string, contentKey: string): Promise<CreativeArtifact | null>;
  findById(id: string, campaignId: string): Promise<CreativeArtifact | null>;
  findByIdForWorkspace(id: string, workspaceId: string): Promise<CreativeArtifact | null>;
  findByRepurposeRequestId(requestId: string): Promise<Array<{ id: string; contentKey: string; contentType: string; channel: string }>>;
  listByCampaignAndKey(campaignId: string, contentKey: string): Promise<CreativeArtifact[]>;
  maxVersionForCampaignAndKey(campaignId: string, contentKey: string): Promise<number>;
  clearCurrentForCampaignAndContentKey(campaignId: string, contentKey: string): Promise<void>;
  insert(input: CreativeArtifactInsert): Promise<CreativeArtifact>;
  replaceCurrentForCampaignAndContentKey(input: CreativeArtifactInsert): Promise<CreativeArtifact>;
  updateStatus(id: string, status: string, updatedAt: string): Promise<void>;
  patchContent(id: string, contentJson: string, status: string, updatedAt: string): Promise<void>;
  patchMediaAsset(id: string, mediaAssetId: string, status: string, updatedAt: string): Promise<void>;
  listApprovedCurrentForWorkspace(workspaceId: string): Promise<ApprovedCurrentCreativeRow[]>;
}

export interface CreativeRevisionRepository {
  insert(input: CreativeRevisionInsert): Promise<void>;
  markApplied(id: string, resultingArtifactId: string, resultingVersion: number, updatedAt: string): Promise<void>;
  markFailed(id: string, updatedAt: string): Promise<void>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface CreativeApprovalRepository {
  findByCampaignAndKey(campaignId: string, contentKey: string): Promise<CreativeApproval | null>;
  upsertByCampaignAndKey(input: CreativeApprovalUpsert): Promise<void>;
  deleteByCampaignAndKey(campaignId: string, contentKey: string): Promise<boolean>;
  deleteByCampaignId(campaignId: string): Promise<boolean>;
}

export interface CreativeRepositories {
  artifact: CreativeArtifactRepository;
  revision: CreativeRevisionRepository;
  approval: CreativeApprovalRepository;
  sourceLink: CreativeSourceLinkRepository;
  derivation: CreativeDerivationRepository;
}
