import type { MarketingChannel } from './channels';

export type PerformanceClassification =
  | 'EXCEPTIONAL'
  | 'HIGH_PERFORMING'
  | 'ABOVE_AVERAGE'
  | 'AVERAGE'
  | 'BELOW_AVERAGE'
  | 'LOW_PERFORMING'
  | 'INSUFFICIENT_DATA';

export type MeasurementWindow =
  | 'INITIAL'
  | '24_HOURS'
  | '72_HOURS'
  | '7_DAYS'
  | '14_DAYS'
  | '30_DAYS'
  | 'LIFETIME'
  | 'CUSTOM';

export type PerformanceSource = 'PROVIDER' | 'MANUAL' | 'IMPORT' | 'CONVERSION';

export type AttributionModel =
  | 'DIRECT'
  | 'TRACKED_LINK'
  | 'PROMO_CODE'
  | 'PROVIDER_REPORTED'
  | 'MANUAL'
  | 'UNATTRIBUTED';

export type AttributionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type LearningType = 'MARKET_PERFORMANCE' | 'USER_PREFERENCE';
export type LearningStatus = 'CANDIDATE' | 'ACTIVE' | 'DISMISSED' | 'SUPERSEDED';
export type LearningConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ConversionType =
  | 'PURCHASE'
  | 'LEAD'
  | 'QUALIFIED_LEAD'
  | 'SIGNUP'
  | 'TRIAL'
  | 'BOOKING'
  | 'FORM_SUBMISSION'
  | 'EMAIL_SUBSCRIBE'
  | 'CUSTOM';

export interface PerformanceMetrics {
  reach?: number | null;
  impressions?: number | null;
  views?: number | null;
  uniqueViews?: number | null;
  videoStarts?: number | null;
  videoCompletions?: number | null;
  watchTimeSeconds?: number | null;
  averageWatchTimeSeconds?: number | null;
  completionRate?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  replies?: number | null;
  clicks?: number | null;
  uniqueClicks?: number | null;
  ctr?: number | null;
  sessions?: number | null;
  leads?: number | null;
  qualifiedLeads?: number | null;
  signups?: number | null;
  trials?: number | null;
  addToCart?: number | null;
  checkoutStarted?: number | null;
  purchases?: number | null;
  revenue?: number | null;
  spend?: number | null;
  cpc?: number | null;
  cpl?: number | null;
  cpa?: number | null;
  roas?: number | null;
  emailDelivered?: number | null;
  emailOpens?: number | null;
  emailClicks?: number | null;
  emailUnsubscribes?: number | null;
  currency?: string | null;
}

export interface PerformanceObservation {
  id: string;
  workspaceId: string;
  campaignId: string;
  scheduleId?: string;
  contentKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  channel: MarketingChannel;
  providerKey?: string;
  destinationId?: string;
  externalPublishId?: string;
  observedAt: string;
  measurementWindow: MeasurementWindow;
  metrics: PerformanceMetrics;
  source: PerformanceSource;
  rawMetadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AttributionResult {
  model: AttributionModel;
  campaignId?: string;
  contentKey?: string;
  scheduleId?: string;
  confidence: AttributionConfidence;
  evidence?: string[];
}

export interface ConversionEvent {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey?: string;
  scheduleId?: string;
  conversionType: ConversionType;
  value?: number;
  currency?: string;
  externalConversionId?: string;
  occurredAt: string;
  attribution: AttributionResult;
  source: 'MANUAL' | 'PROVIDER' | 'IMPORT' | 'TRACKING';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ObjectiveEvaluation {
  campaignId: string;
  objectiveId: string;
  objectiveType: string;
  primaryKpi: string;
  primaryKpiValue?: number | null;
  supportingResults: { kpi: string; value?: number | null }[];
  conversionResult?: { purchases?: number; revenue?: number; currency?: string | null };
  successCriteria?: string | null;
  score?: number | null;
  classification: PerformanceClassification;
  confidence: AttributionConfidence;
  reasons: string[];
  evaluatedAt: string;
  measurementWindow: MeasurementWindow;
}

export interface PerformanceEvaluationRecord extends ObjectiveEvaluation {
  id: string;
  workspaceId: string;
}

export interface ContentPerformanceSummary {
  contentKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  channel: MarketingChannel;
  contentType?: string;
  format?: string;
  metrics: PerformanceMetrics;
  conversions: { purchases: number; revenue: number; currency?: string | null };
  classification?: PerformanceClassification;
}

export interface ChannelPerformanceSummary {
  channel: MarketingChannel;
  metrics: PerformanceMetrics;
  conversions: { purchases: number; revenue: number; qualifiedLeads: number };
}

export interface CampaignPerformanceSummary {
  campaignId: string;
  campaignName: string;
  objective: { id: string; name: string; type: string; primaryKpi: string };
  classification: PerformanceClassification;
  confidence: AttributionConfidence;
  primaryKpi: string;
  primaryKpiValue?: number | null;
  metrics: PerformanceMetrics;
  conversions: { purchases: number; revenue: number; qualifiedLeads: number; currency?: string | null };
  spend?: number | null;
  roas?: number | null;
  mixedCurrency?: boolean;
  topContent: ContentPerformanceSummary[];
  underperformingContent: ContentPerformanceSummary[];
  channelPerformance: ChannelPerformanceSummary[];
  evaluationReasons: string[];
  lastObservedAt?: string;
  measurementWindow: MeasurementWindow;
  blueprintCandidate?: boolean;
}

export interface WorkspaceLearning {
  id: string;
  workspaceId: string;
  type: LearningType;
  category: string;
  statement: string;
  confidence: LearningConfidence;
  evidenceCount: number;
  status: LearningStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LearningEvidenceRecord {
  id: string;
  learningId: string;
  sourceType: string;
  sourceId: string;
  observedAt: string;
  weight?: number;
}
