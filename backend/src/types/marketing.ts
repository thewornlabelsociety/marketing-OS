// Marketing Intelligence — shared types for Phase 4A

// ─── Scopes ──────────────────────────────────────────────────────────────────

/**
 * Marketing scope describes the context in which content is created.
 * A single workspace may create content for multiple scopes.
 *
 * BRAND        - Brand voice / identity content (not tied to a specific channel)
 * SHOP         - Own store / direct-to-consumer promotion
 * MARKETPLACE  - Third-party marketplace listings and promotion
 * SHOP_MARKETPLACE - Content that bridges both shop and marketplace audiences
 * FOUNDER      - Founder-voice or personal brand content
 * EDITORIAL    - Editorial, magazine-style, or content marketing pieces
 */
export type MarketingScope =
  | 'BRAND'
  | 'SHOP'
  | 'MARKETPLACE'
  | 'SHOP_MARKETPLACE'
  | 'FOUNDER'
  | 'EDITORIAL';

// ─── Knowledge Domains ───────────────────────────────────────────────────────

/**
 * Knowledge domains correspond to sections of the workspace's brand knowledge.
 * Each domain maps to a key path within the brand_kit JSON blob on the entities table.
 */
export type KnowledgeDomain =
  | 'BRAND_CORE'
  | 'AUDIENCE'
  | 'POSITIONING'
  | 'VOICE'
  | 'VISUAL_IDENTITY'
  | 'CONTENT_PILLARS'
  | 'CHANNEL_STRATEGY'
  | 'MARKETING_RULES'
  | 'CURRENT_CONTEXT'
  | 'CREATIVE_PREFERENCES'
  | 'OPERATOR_FEEDBACK'
  | 'MARKETING_OBJECTIVES';

/** Map from KnowledgeDomain to brand_kit JSON paths */
export const KNOWLEDGE_DOMAIN_PATHS: Record<KnowledgeDomain, string[]> = {
  BRAND_CORE:           ['brandBrain.identity'],
  AUDIENCE:             ['brandBrain.audience'],
  POSITIONING:          ['brandBrain.positioning'],
  VOICE:                ['brandBrain.personality', 'brandBrain.language'],
  VISUAL_IDENTITY:      ['brandBrain.visual'],
  CONTENT_PILLARS:      ['brandBrain.marketing'],
  CHANNEL_STRATEGY:     ['channelStrategy'],
  MARKETING_RULES:      ['brandBrain.language.bannedWords', 'marketingRules'],
  CURRENT_CONTEXT:      ['currentContext'],
  CREATIVE_PREFERENCES: ['creativePreferences'],
  OPERATOR_FEEDBACK:    ['operatorFeedback'],
  MARKETING_OBJECTIVES: ['marketingObjectives'],
};

// ─── AI Task Types ────────────────────────────────────────────────────────────

export type AITaskType =
  | 'CAMPAIGN_PLANNING'
  | 'CONTENT_PLANNING'
  | 'CREATIVE_COPY'
  | 'CREATIVE_REVISION'
  | 'CREATIVE_WHOLE_SET'
  | 'PERFORMANCE_ANALYSIS'
  | 'BRIEF_GENERATION'
  | 'MARKETING_RECOMMENDATION';

// ─── AI Brief Contract ────────────────────────────────────────────────────────

/**
 * MarketingAIBrief is the provider-neutral AI request contract.
 * All AI calls in Marketing OS should be expressed as a brief.
 * The AIOrchestrator translates the brief into provider-specific requests.
 */
export interface MarketingAIBrief {
  workspaceId: string;
  taskType: AITaskType;
  scope: MarketingScope;
  knowledgeDomains: KnowledgeDomain[];
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  /** Optional — links usage to a specific creative artifact */
  artifactId?: string;
  /** Optional — links usage to a specific campaign */
  campaignId?: string;
  /** Additional context passed to the prompt assembler */
  context?: Record<string, unknown>;
}

// ─── AI Usage ─────────────────────────────────────────────────────────────────

export interface AIUsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIGenerationResult {
  content: string;
  usage: AIUsageData;
}

// ─── AI Pricing ──────────────────────────────────────────────────────────────

export interface ModelPricing {
  inputPer1kTokens: number;   // USD
  outputPer1kTokens: number;  // USD
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface WorkspaceAIBudget {
  monthlyLimitUsd: number;
  alertThresholdPct: number;
}

export interface AIBudgetSummary {
  monthlyLimitUsd: number;
  spentThisMonthUsd: number;
  /** NZD estimate — not provider-billed; each historical record preserves the rate used */
  estimatedSpentThisMonthNzd: number;
  remainingUsd: number;
  /** 0–100 percentage of monthly limit consumed */
  percentageUsed: number;
  alertThresholdPct: number;
  withinBudget: boolean;
  nearingLimit: boolean;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export type FeedbackSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type FeedbackType =
  | 'COPY_APPROVED'
  | 'COPY_REJECTED'
  | 'COPY_REVISED'
  | 'DIRECTION_CHANGED'
  | 'WHOLE_SET_APPROVED'
  | 'WHOLE_SET_PARTIAL'
  | 'OPERATOR_NOTE';

export interface CreativeFeedbackRecord {
  id: string;
  workspaceId: string;
  artifactId: string | null;
  campaignId: string | null;
  feedbackType: FeedbackType;
  sentiment: FeedbackSentiment;
  feedbackText: string | null;
  operatorDecision: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Channel Strategy ─────────────────────────────────────────────────────────

export type ChannelKey =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'email'
  | 'sms'
  | 'website'
  | 'marketplace';

export interface ChannelConfig {
  enabled: boolean;
  priority: 'PRIMARY' | 'SECONDARY' | 'EXPERIMENTAL';
  postingFrequency?: string;
  notes?: string;
}

export type WorkspaceChannelStrategy = Partial<Record<ChannelKey, ChannelConfig>>;
