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

export type EvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExperimentVariant {
  id: string;
  label: string;
  role: 'CONTROL' | 'VARIANT';
  contentKey: string;
  creativeArtifactId: string;
  creativeVersion: number;
  scheduleId?: string;
  channel: string;
  description?: string;
}

export interface ExperimentQualityFinding {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export interface ExperimentQualityResult {
  valid: boolean;
  findings: ExperimentQualityFinding[];
}

export interface VariantAnalysisResult {
  variantId: string;
  label: string;
  role: 'CONTROL' | 'VARIANT';
  primaryKpiValue: number | null;
  impressions: number | null;
  clicks: number | null;
  metrics: Record<string, number | null>;
}

export interface ExperimentAnalysis {
  id: string;
  measurementWindow: string;
  analyzedAt: string;
  primaryKpi: string;
  variantResults: VariantAnalysisResult[];
  winnerVariantId?: string;
  outcome: ExperimentOutcome;
  confidence: EvidenceConfidence;
  reasons: string[];
  warnings: string[];
  campaignObjectiveImpact?: string;
}

export interface Experiment {
  id: string;
  workspaceId: string;
  campaignId: string;
  name: string;
  description?: string;
  hypothesis: string;
  variableType: ExperimentVariableType;
  objectiveId: string;
  primaryKpi: string;
  experimentKpi?: string;
  experimentKpiRationale?: string;
  controlDescription: string;
  variantDescription: string;
  status: ExperimentStatus;
  mode: ExperimentMode;
  outcome?: ExperimentOutcome;
  confidence?: EvidenceConfidence;
  minimumMeaningfulLift?: number;
  startedAt?: string;
  endedAt?: string;
  variants: ExperimentVariant[];
  createdAt: string;
  updatedAt: string;
}
