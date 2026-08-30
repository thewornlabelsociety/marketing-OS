export type AttentionSignalType =
  | 'CAMPAIGN_READY_FOR_REVIEW'
  | 'CAMPAIGN_CHANGES_REQUESTED'
  | 'CAMPAIGN_READY_FOR_APPROVAL'
  | 'CONTENT_READY_FOR_REVIEW'
  | 'CONTENT_CHANGES_REQUESTED'
  | 'CONTENT_READY_FOR_APPROVAL'
  | 'READY_TO_SCHEDULE'
  | 'UNSCHEDULED_APPROVED_CONTENT'
  | 'PUBLISHING_FAILED'
  | 'PUBLISHING_RETRY_REQUIRED'
  | 'PERFORMANCE_UNDERPERFORMING'
  | 'PERFORMANCE_HIGH_PERFORMING'
  | 'PERFORMANCE_INSUFFICIENT_DATA'
  | 'EXPERIMENT_READY_TO_START'
  | 'EXPERIMENT_INSUFFICIENT_DATA'
  | 'EXPERIMENT_READY_FOR_ANALYSIS'
  | 'EXPERIMENT_DECISION_AVAILABLE'
  | 'EXPERIMENT_INCONCLUSIVE'
  | 'EXPERIMENT_CONFLICT_WARNING'
  | 'BLUEPRINT_CANDIDATE'
  | 'LEARNING_CANDIDATE'
  | 'INTEGRATION_ATTENTION';

export type AttentionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AttentionSignalStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface AttentionSignal {
  id: string;
  workspaceId: string;
  signalKey: string;
  signalType: AttentionSignalType;
  severity: AttentionSeverity;
  entityType: string;
  entityId: string;
  campaignId?: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  title: string;
  summary?: string;
  actionLabel?: string;
  actionTarget?: string;
  dismissible: boolean;
  status: AttentionSignalStatus;
  detectedAt: string;
  resolvedAt?: string;
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCounts {
  needsAttention: number;
  readyForReview: number;
  scheduledThisWeek: number;
  underperforming: number;
  experimentsAwaitingDecision: number;
}

export interface DashboardUpcomingItem {
  scheduleId: string;
  campaignId: string;
  campaignName: string;
  contentKey: string;
  channel: string;
  scheduledFor: string;
  timezone: string;
  localDayLabel: string;
  localTimeLabel: string;
  status: string;
}

export interface DashboardPerformanceItem {
  campaignId: string;
  campaignName: string;
  objectiveType: string;
  objectiveName?: string;
  classification: string;
  primaryKpi: string;
  primaryKpiValue?: number | null;
  confidence?: string;
  measurementWindow?: string;
  reasons?: string[];
  actionTarget: string;
}

export interface DashboardExperimentItem {
  experimentId: string;
  campaignId: string;
  campaignName: string;
  name: string;
  signalType: AttentionSignalType;
  outcome?: string;
  primaryKpi?: string;
  confidence?: string;
  measurementWindow?: string;
  mode?: string;
  warnings?: string[];
  actionTarget: string;
}

export interface DashboardOpportunityItem {
  id: string;
  type: 'BLUEPRINT_CANDIDATE' | 'LEARNING_CANDIDATE';
  title: string;
  summary?: string;
  campaignId?: string;
  actionLabel: string;
  actionTarget: string;
  signalId?: string;
  dismissible: boolean;
}

export interface DashboardSnapshot {
  workspaceId: string;
  generatedAt: string;
  counts: DashboardCounts;
  needsAttention: AttentionSignal[];
  readyForYou: AttentionSignal[];
  upcoming: DashboardUpcomingItem[];
  performance: {
    highPerforming: DashboardPerformanceItem[];
    underperforming: DashboardPerformanceItem[];
    insufficientData: DashboardPerformanceItem[];
  };
  experiments: DashboardExperimentItem[];
  opportunities: DashboardOpportunityItem[];
  empty: boolean;
}
