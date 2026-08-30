import type { MeasurementWindow } from './performance';

export type ExperimentStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type ExperimentOutcome =
  | 'VARIANT_A_WINS'
  | 'VARIANT_B_WINS'
  | 'VARIANT_WINNER'
  | 'NO_MEANINGFUL_DIFFERENCE'
  | 'INCONCLUSIVE'
  | 'INSUFFICIENT_DATA'
  | 'CANCELLED';

export type ExperimentMode = 'CONTROLLED_SPLIT' | 'OBSERVATIONAL_COMPARISON' | 'MANUAL';

export type ExperimentVariableType =
  | 'HOOK'
  | 'HEADLINE'
  | 'CTA'
  | 'COPY'
  | 'OFFER_FRAMING'
  | 'CREATIVE_FORMAT'
  | 'VISUAL_STYLE'
  | 'THUMBNAIL'
  | 'SUBJECT_LINE'
  | 'SEND_TIME'
  | 'POST_TIME'
  | 'CHANNEL'
  | 'CONTENT_SEQUENCE'
  | 'LANDING_MESSAGE'
  | 'CUSTOM';

export type ExperimentType = 'AB';

export type VariantRole = 'CONTROL' | 'VARIANT';

export type EvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type EvidenceCompleteness = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';

export interface StructuredHypothesis {
  ifChange: string;
  thenEffect: string;
  becauseRationale: string;
  measuredBy: string;
}

export interface MinimumEvidencePolicy {
  minimumObservations?: number;
  minimumImpressionsPerVariant?: number;
  minimumClicksPerVariant?: number;
  minimumConversionsPerVariant?: number;
  minimumMeasurementWindow?: MeasurementWindow;
}

export interface ExperimentVariant {
  id: string;
  workspaceId: string;
  experimentId: string;
  label: string;
  role: VariantRole;
  contentKey: string;
  creativeArtifactId: string;
  creativeVersion: number;
  scheduleId?: string;
  channel: string;
  destinationId?: string;
  description?: string;
  createdAt: string;
}

export interface ExperimentDistribution {
  id: string;
  workspaceId: string;
  experimentId: string;
  variantId: string;
  scheduleId?: string;
  startedAt?: string;
  endedAt?: string;
  channel: string;
  destinationId?: string;
  estimatedAudience?: number | null;
  actualAudience?: number | null;
  allocationPercentage?: number | null;
  mode: ExperimentMode;
  createdAt: string;
}

export interface VariantAnalysisResult {
  variantId: string;
  label: string;
  role: VariantRole;
  contentKey: string;
  creativeArtifactId: string;
  creativeVersion: number;
  scheduleId?: string;
  channel: string;
  measurementWindow?: MeasurementWindow;
  metrics: Record<string, number | null>;
  primaryKpiValue: number | null;
  conversions: number;
  revenue: number | null;
  currency?: string | null;
  impressions: number | null;
  clicks: number | null;
}

export interface ExperimentAnalysis {
  id: string;
  workspaceId: string;
  experimentId: string;
  measurementWindow: MeasurementWindow;
  analyzedAt: string;
  primaryKpi: string;
  variantResults: VariantAnalysisResult[];
  winnerVariantId?: string;
  outcome: ExperimentOutcome;
  confidence: EvidenceConfidence;
  reasons: string[];
  evidenceCompleteness: EvidenceCompleteness;
  warnings: string[];
  campaignObjectiveImpact?: string;
  createdAt: string;
}

export interface Experiment {
  id: string;
  workspaceId: string;
  campaignId: string;
  name: string;
  description?: string;
  hypothesis: string;
  hypothesisStructured?: StructuredHypothesis;
  experimentType: ExperimentType;
  objectiveId: string;
  primaryKpi: string;
  experimentKpi?: string;
  experimentKpiRationale?: string;
  guardrailMetrics: string[];
  variableType: ExperimentVariableType;
  controlDescription: string;
  variantDescription: string;
  status: ExperimentStatus;
  mode: ExperimentMode;
  minimumEvidencePolicy: MinimumEvidencePolicy;
  minimumMeaningfulLift?: number;
  outcome?: ExperimentOutcome;
  winnerVariantId?: string;
  confidence?: EvidenceConfidence;
  cancellationReason?: string;
  startedAt?: string;
  endedAt?: string;
  variants: ExperimentVariant[];
  distributions: ExperimentDistribution[];
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentQualityFinding {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ExperimentQualityResult {
  valid: boolean;
  findings: ExperimentQualityFinding[];
}
