export interface BrandKit {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  typography?: { heading?: string; body?: string };
  voice?: { tone?: string; archetype?: string };
  voiceAndTone?: {
    archetype?: string;
    toneKeywords?: string[];
    readingLevel?: string;
    rules?: { dos?: string[]; donts?: string[] };
    vocabulary?: { preferred?: string[]; banned?: string[] };
  };
  visualIdentity?: {
    palette?: { primary?: string; accent?: string; neutralLight?: string; neutralDark?: string };
    typography?: { heading?: string; body?: string };
    aesthetic?: string;
  };
  audience?: {
    primaryICP?: string;
    painPoints?: string[];
  };
  memoryVault?: {
    corePillars?: string[];
    topPerformingHooks?: string[];
  };
  [key: string]: unknown;
}

export interface EntityRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  brand_kit: string;
  api_keys: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
  archetype: string;
  brandKit: BrandKit;
  apiKeys: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  type: string;
  title: string;
  body_markdown: string | null;
  assets: string;
  status: string;
  target_channels: string;
  scheduled_for: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface ContentItem {
  id: string;
  entityId: string;
  tenantId: string;
  type: string;
  title: string;
  bodyMarkdown: string | null;
  assets: unknown[];
  status: string;
  targetChannels: string[];
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceRow {
  id: string;
  tenant_id: string;
  content_id: string;
  entity_id: string;
  impressions: number;
  revenue: number;
  conversions: number;
  hook: string | null;
  ai_learnings: string | null;
  is_synced_to_vault: number;
  created_at: string;
}

export interface PerformanceLog {
  id: string;
  entityId: string;
  contentId: string | null;
  impressions: number;
  revenue: number;
  conversions: number;
  hook: string | null;
  aiLearnings: string | null;
  isSyncedToVault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectiveRow {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  objective_type: string;
  primary_kpi: string;
  supporting_kpis: string;
  conversion_event: string | null;
  success_criteria: string | null;
  default_channels: string;
  is_system: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Objective {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  objectiveType: string;
  primaryKpi: string;
  supportingKpis: string[];
  conversionEvent: string | null;
  successCriteria: string | null;
  defaultChannels: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRow {
  id: string;
  workspace_id: string;
  objective_id: string;
  name: string;
  status: string;
  source_type: string;
  source_id: string | null;
  source_title: string;
  source_description: string | null;
  source_metadata: string;
  brief: string | null;
  channels: string;
  cancellation_reason: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  objective_name?: string;
  objective_primary_kpi?: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  objectiveId: string;
  objectiveName: string | null;
  objectivePrimaryKpi: string | null;
  name: string;
  status: string;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string;
  sourceDescription: string | null;
  sourceMetadata: Record<string, unknown>;
  brief: string | null;
  channels: string[];
  cancellationReason: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
