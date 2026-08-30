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
