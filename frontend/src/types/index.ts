export interface BrandBrain {
  identity?: {
    name?: string;
    description?: string;
    website?: string;
    market?: string;
  };
  audience?: {
    primaryAudience?: string;
    needs?: string[];
    problems?: string[];
    desires?: string[];
  };
  personality?: {
    archetype?: string;
    traits?: string[];
    principles?: string[];
    tone?: {
      warmToCool?: number;
      playfulToSerious?: number;
      boldToRestrained?: number;
      conversationalToFormal?: number;
    };
  };
  language?: {
    preferredWords?: string[];
    bannedWords?: string[];
    preferredPhrases?: string[];
    bannedPhrases?: string[];
    ctaStyle?: string;
    exampleCopy?: string;
  };
  visual?: {
    palette?: string[];
    fonts?: string[];
    visualStyleNotes?: string;
    imageStyleNotes?: string;
  };
  marketing?: {
    defaultChannels?: string[];
    contentPillars?: string[];
    primaryGoals?: string[];
  };
  memory?: {
    marketPerformanceLearnings?: string[];
    userPreferenceLearnings?: string[];
  };
}

export interface BrandKit {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  typography?: {
    heading?: string;
    body?: string;
  };
  voice?: {
    tone?: string;
    archetype?: string;
  };
  memoryVault?: {
    topPerformingHooks?: string[];
  };
  brandBrain?: BrandBrain;
  [key: string]: unknown;
}

export interface Entity {
  id: string;
  name: string;
  slug: string;
  archetype: string;
  brandKit: BrandKit;
  apiKeys: Record<string, string>;
  createdAt: string;
  updatedAt: string;
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

export type CampaignSourceType =
  | 'PRODUCT'
  | 'SERVICE'
  | 'OFFER'
  | 'FEATURE'
  | 'EVENT'
  | 'INVENTORY_BATCH'
  | 'ANNOUNCEMENT'
  | 'EDUCATIONAL_TOPIC'
  | 'CAMPAIGN_IDEA'
  | 'OTHER';

export interface Campaign {
  id: string;
  workspaceId: string;
  objectiveId: string;
  objectiveName: string | null;
  objectivePrimaryKpi: string | null;
  name: string;
  status: CampaignStatus;
  sourceType: CampaignSourceType;
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

export interface ContentItem {
  id: string;
  entityId: string;
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

// --- Campaign Brief ---

export interface CampaignBrief {
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
  completenessStatus: 'COMPLETE' | 'NEEDS_INPUT';
  completenessMissingFields: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Campaign Plan ---

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

// --- Preview ---

export type PreviewChannel =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'linkedin'
  | 'email'
  | 'website';

export type PreviewDevice = 'mobile' | 'desktop';

export interface PreviewDescriptor {
  channel: PreviewChannel;
  format: string;  // e.g. 'feed', 'story', 'reel', 'newsletter'
  device: PreviewDevice;
}

// --- Legacy ---

export interface DropDraft {
  brand: string;
  title: string;
  price: string;
  body: string;
  hook: string;
  scheduledFor: string;
  targetChannels: string[];
}

export type AppTab =
  | 'campaigns'
  | 'campaign-detail'
  | 'calendar'
  | 'performance'
  | 'brand-brain'
  | 'objectives'
  | 'studio';

export interface DeepLinkParams {
  entity?: string;
  brand?: string;
  title?: string;
  price?: string;
}
