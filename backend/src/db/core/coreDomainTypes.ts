import type { CampaignRow, EntityRow, ObjectiveRow } from '../../types';

export interface TenantInsert {
  id: string;
  planTier?: string;
  licenseKey?: string | null;
}

export interface EntityUpsertInput {
  id: string;
  tenantId: string;
  name: unknown;
  slug: unknown;
  brandKit: unknown;
  apiKeys: unknown;
}

export interface ObjectiveCreateInput {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  objectiveType: string;
  primaryKpi: string;
  supportingKpis: string[];
  conversionEvent: string | null;
  successCriteria: string | null;
  defaultChannels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ObjectivePatchInput {
  name?: string;
  description?: string | null;
  objectiveType?: string;
  primaryKpi?: string;
  conversionEvent?: string | null;
  successCriteria?: string | null;
  isActive?: boolean;
  supportingKpis?: string[];
  defaultChannels?: string[];
}

export interface CampaignCreateInput {
  id: string;
  workspaceId: string;
  objectiveId: string;
  name: string;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string;
  sourceDescription: string | null;
  sourceMetadata: Record<string, unknown>;
  brief: string | null;
  channels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPatchInput {
  name?: string;
  brief?: string | null;
  sourceTitle?: string;
  sourceDescription?: string | null;
  cancellationReason?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  completedAt?: string | null;
  status?: string;
  channels?: string[];
  sourceMetadata?: Record<string, unknown>;
  objectiveId?: string;
}

export interface CampaignListFilters {
  workspaceId?: string;
  status?: string;
}

export interface TenantRepository {
  findById(id: string): Promise<{ id: string } | null>;
  insertIfNotExists(input: TenantInsert): Promise<'inserted' | 'skipped'>;
  deleteById(id: string): Promise<boolean>;
}

export interface WorkspaceRepository {
  listActive(): Promise<EntityRow[]>;
  findById(id: string): Promise<EntityRow | null>;
  findBrandKit(id: string): Promise<string | null>;
  exists(id: string): Promise<boolean>;
  upsert(input: EntityUpsertInput): Promise<void>;
  patchBrandKit(id: string, brandKitJson: string): Promise<EntityRow | null>;
  deleteById(id: string): Promise<boolean>;
}

export interface ObjectiveRepository {
  listForWorkspace(workspaceId: string): Promise<ObjectiveRow[]>;
  findById(id: string): Promise<ObjectiveRow | null>;
  findForCampaignValidation(id: string): Promise<ObjectiveRow | null>;
  create(input: ObjectiveCreateInput): Promise<ObjectiveRow>;
  patch(id: string, patch: ObjectivePatchInput, updatedAt: string): Promise<ObjectiveRow | null>;
  deleteById(id: string): Promise<boolean>;
}

export interface CampaignRepository {
  list(filters: CampaignListFilters): Promise<CampaignRow[]>;
  findByIdWithObjective(id: string): Promise<CampaignRow | null>;
  findById(id: string): Promise<CampaignRow | null>;
  create(input: CampaignCreateInput): Promise<CampaignRow>;
  patch(id: string, patch: CampaignPatchInput, updatedAt: string): Promise<CampaignRow | null>;
  deleteById(id: string): Promise<boolean>;
}

export interface CoreDomainRepositories {
  readonly driver: 'sqlite' | 'postgres';
  tenant: TenantRepository;
  workspace: WorkspaceRepository;
  objective: ObjectiveRepository;
  campaign: CampaignRepository;
}

/** Verification-only: delete owned fixture rows by exact ID in FK-safe order. */
export interface FixtureCleanupCapable {
  deleteOwnedFixtures(ids: {
    tenantIds: string[];
    entityIds: string[];
    objectiveIds: string[];
    campaignIds: string[];
  }): Promise<{ removed: Record<string, number>; skipped: Record<string, number> }>;
}

export const CAMPAIGN_JOIN_SQLITE = `
  SELECT c.*,
    o.name  AS objective_name,
    o.primary_kpi AS objective_primary_kpi
  FROM campaigns c
  LEFT JOIN objectives o ON c.objective_id = o.id
`;

export const CAMPAIGN_JOIN_POSTGRES = `
  SELECT c.*,
    o.name  AS objective_name,
    o.primary_kpi AS objective_primary_kpi
  FROM campaigns c
  LEFT JOIN objectives o ON c.objective_id = o.id
`;
