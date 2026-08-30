export type ExperimentStatus = 'DRAFT' | 'RUNNING' | 'COMPLETE' | 'CANCELLED';

export interface Experiment {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  name: string;
  hypothesis: string;
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  audienceId: string | null;
  channels: string[];
  startDate: string | null;
  endDate: string | null;
  status: ExperimentStatus;
  metrics: string[];
  winner: 'A' | 'B' | null;
  confidence: number | null;
  learning: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentVariant {
  label: string;
  contentId: string | null;
  description: string;
}
