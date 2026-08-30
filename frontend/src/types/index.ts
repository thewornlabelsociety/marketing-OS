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

export type MarketingChannel =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'EMAIL'
  | 'WEBSITE';

export type PlannedContentType =
  | 'STATIC_POST'
  | 'CAROUSEL'
  | 'STORY'
  | 'SHORT_VIDEO'
  | 'LONG_VIDEO'
  | 'NEWSLETTER'
  | 'EMAIL'
  | 'ARTICLE'
  | 'LANDING_PAGE'
  | 'DOCUMENT'
  | 'OTHER';

export type ContentFormat =
  | 'SQUARE_1_1'
  | 'PORTRAIT_4_5'
  | 'VERTICAL_9_16'
  | 'LANDSCAPE_16_9'
  | 'NEWSLETTER'
  | 'DOCUMENT_CAROUSEL'
  | 'TEXT_POST'
  | 'ARTICLE'
  | 'LANDING_PAGE';

export interface ChannelCapability {
  channel: MarketingChannel;
  supportedContentTypes: PlannedContentType[];
  supportedFormats: ContentFormat[];
  supportedDevices: PreviewDevice[];
  preferredAspectRatios?: string[];
  maxMediaItems?: number;
  supportsCarousel: boolean;
  supportsVideo: boolean;
  supportsLongForm: boolean;
  supportsLinks: boolean;
  supportsStories: boolean;
}

export type ContentPlanStatus =
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REVISING'
  | 'APPROVED';

export interface AssetRequirement {
  id?: string;
  type: string;
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

export interface ContentPlan {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourcePlanId: string;
  sourcePlanVersion: number;
  version: number;
  summary: {
    campaignNarrative: string;
    customerJourney?: string;
    contentStrategy: string;
  };
  concepts: ContentConcept[];
  deliverables: ContentDeliverable[];
  cadence: {
    startDate?: string;
    endDate?: string;
    phases: { key: string; name: string; order: number; purpose?: string }[];
    notes?: string;
  };
  status: ContentPlanStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPlanApprovalRecord {
  campaignId: string;
  contentPlanId: string;
  contentPlanVersion: number;
  approvedAt: string;
}

export type CreativeArtifactStatus =
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REVISING'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED';

export interface CreativeQualityCheck {
  key: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  message?: string;
}

export interface CreativeQualityResult {
  passed: boolean;
  checks: CreativeQualityCheck[];
  warnings: string[];
  repaired?: boolean;
}

export type CreativeContent =
  | { kind: 'STATIC_POST'; headline?: string; caption: string; hook?: string; cta?: string; hashtags?: string[]; visualDirection?: string }
  | { kind: 'CAROUSEL'; caption: string; slides: { slideNumber: number; headline?: string; body?: string; visualDirection?: string }[]; cta?: string; visualDirection?: string }
  | { kind: 'STORY'; frames: { frameNumber: number; headline?: string; body?: string; cta?: string; visualDirection?: string }[] }
  | { kind: 'SHORT_VIDEO'; title?: string; hook: string; durationTargetSeconds?: number; scenes: { sceneNumber: number; durationSeconds?: number; visualDirection: string; spokenCopy?: string; onScreenText?: string }[]; voiceover?: string; caption?: string; cta?: string; shotRequirements?: string[] }
  | { kind: 'LONG_VIDEO'; title: string; hook?: string; outline: { sectionNumber: number; heading?: string; body: string }[]; cta?: string }
  | { kind: 'EMAIL'; subject: string; preheader?: string; headline?: string; body: string | { sections: { heading?: string; body: string }[] }; cta?: { label: string; destinationDescription?: string }; footerNotes?: string }
  | { kind: 'NEWSLETTER'; subject: string; preheader?: string; sections: { heading?: string; body: string }[]; cta?: { label: string; destinationDescription?: string }; footerNotes?: string }
  | { kind: 'TEXT_POST'; hook?: string; body: string; cta?: string }
  | { kind: 'ARTICLE'; title: string; excerpt?: string; sections: { heading?: string; body: string }[]; cta?: string }
  | { kind: 'LANDING_PAGE'; hero: { eyebrow?: string; headline: string; supportingText?: string; cta?: string }; sections: { heading?: string; body: string }[]; closingCta?: string };

export interface CreativeArtifact {
  id: string;
  workspaceId: string;
  campaignId: string;
  sourceContentPlanId: string;
  sourceContentPlanVersion: number;
  contentKey: string;
  deliverableId: string;
  version: number;
  channel: MarketingChannel;
  contentType: PlannedContentType;
  format: ContentFormat;
  title?: string;
  content: CreativeContent;
  quality: CreativeQualityResult;
  status: CreativeArtifactStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeApprovalRecord {
  campaignId: string;
  contentKey: string;
  creativeArtifactId: string;
  approvedVersion: number;
  approvedAt: string;
}

export interface CampaignCreativeSummary {
  contentPlanApproved: boolean;
  totalDeliverables: number;
  generated: number;
  approved: number;
  needsReview: number;
  needsGeneration: number;
  readyForScheduling: boolean;
  deliverables: {
    contentKey: string;
    title: string;
    channel: MarketingChannel;
    contentType: PlannedContentType;
    format: ContentFormat;
    hasCreative: boolean;
    currentVersion: number | null;
    status: CreativeArtifactStatus | null;
    isApproved: boolean;
    artifactId: string | null;
  }[];
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
