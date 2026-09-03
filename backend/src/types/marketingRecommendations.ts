// Marketing Recommendations — Phase 4B types

import type { MarketingScope, ChannelKey } from './marketing';

export type RecommendationStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'DISMISSED'
  | 'EXPIRED'
  | 'COMPLETED';

export type RecommendationGenerationSource = 'AI' | 'RULE_BASED';

export type RecommendationType =
  | 'FEATURE_NEW_ARRIVALS'
  | 'FEATURE_CURRENT_STOCK'
  | 'SALE_EDIT'
  | 'REACTIVATE_UNFEATURED'
  | 'AMPLIFY_HIGH_PERFORMER'
  | 'FOUNDER_CONTENT'
  | 'EDITORIAL_CONTENT'
  | 'LOCAL_SHOP_CONTENT'
  | 'FILL_CALENDAR_GAP'
  | 'REDUCE_POSTING_FREQUENCY';

export type RecommendationContentType =
  | 'STATIC_POST'
  | 'CAROUSEL'
  | 'STORY'
  | 'EMAIL'
  | 'TALKING_POINTS';

export type RecommendationCreativeDirection = 'EDITORIAL' | 'PRODUCT_LED' | 'MINIMAL';

export interface MarketingRecommendation {
  id: string;
  workspaceId: string;
  fingerprint: string;
  status: RecommendationStatus;
  recommendationType: RecommendationType;
  generationSource: RecommendationGenerationSource;
  title: string;
  summary: string;
  rationale: string;
  priority: number;
  confidence?: number;
  marketingScopes: MarketingScope[];
  objectiveId?: string | null;
  primaryChannel: ChannelKey;
  secondaryChannels: ChannelKey[];
  contentType?: RecommendationContentType | null;
  creativeDirection?: RecommendationCreativeDirection | null;
  sourceProductIds: string[];
  sourceSellerIds: string[];
  hook?: string | null;
  angle?: string | null;
  cta?: string | null;
  talkingPoints?: string[] | null;
  suggestedDurationSeconds?: number | null;
  acceptedCampaignId?: string | null;
  acceptedArtifactId?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  dismissedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Context assembled for the expert ────────────────────────────────────────

export interface RecommendationInventoryItem {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  marketingBucket: 'NEW' | 'CURRENT' | 'SALE' | null;
  usageStatus: string;
  occurredAt: string | null;
}

export interface RecommendationContext {
  workspaceId: string;
  workspaceName: string;
  brandKnowledge: Record<string, unknown>;
  activeObjective: {
    id: string;
    name: string;
    objectiveType: string;
    primaryKpi: string;
  } | null;
  inventory: {
    newArrivals: RecommendationInventoryItem[];
    currentStock: RecommendationInventoryItem[];
    saleItems: RecommendationInventoryItem[];
    unfeaturedItems: RecommendationInventoryItem[];
  };
  calendar: {
    scheduledToday: number;
    scheduledThisWeek: number;
    channelsScheduledThisWeek: string[];
    nextEmptyDayOffsets: number[];
  };
  channels: {
    primary: ChannelKey;
    secondary: ChannelKey[];
  };
  recentContent: {
    productPostCount: number;
    founderPostCount: number;
    editorialPostCount: number;
    recentlyFeaturedProductIds: string[];
    recentScopes: string[];
    recentContentTypes: string[];
  };
  highPerformingCampaign: { id: string; kpi: string } | null;
  recentUnderperformingCampaign: boolean;
  recentDismissals: { type: string; count: number }[];
  contextSignature: string;
}

// ─── Generation result ────────────────────────────────────────────────────────

export interface RecommendationGenerationResult {
  recommendations: MarketingRecommendation[];
  generationSource: RecommendationGenerationSource;
  createdCount: number;
  reusedCount: number;
  expiredCount: number;
  cached: boolean;
  nextAllowedAt?: string;
}

// ─── DB row (internal) ───────────────────────────────────────────────────────

export interface MarketingRecommendationRow {
  id: string;
  workspace_id: string;
  fingerprint: string;
  status: string;
  recommendation_type: string;
  generation_source: string;
  title: string;
  summary: string;
  rationale: string;
  priority: number;
  confidence: number | null;
  marketing_scopes_json: string;
  objective_id: string | null;
  primary_channel: string;
  secondary_channels_json: string;
  content_type: string | null;
  creative_direction: string | null;
  source_product_ids_json: string;
  source_seller_ids_json: string;
  hook: string | null;
  angle: string | null;
  cta: string | null;
  talking_points_json: string | null;
  suggested_duration_seconds: number | null;
  accepted_campaign_id: string | null;
  accepted_artifact_id: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  dismissed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
