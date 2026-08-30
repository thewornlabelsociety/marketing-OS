export type CampaignLibraryClassification =
  | 'HIGH_PERFORMING'
  | 'LOW_PERFORMING'
  | 'EVERGREEN'
  | 'SEASONAL'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'BLUEPRINT_CANDIDATE'
  | 'BLUEPRINT';

export type CancellationReasonType =
  | 'OFFER_WITHDRAWN'
  | 'STOCK_UNAVAILABLE'
  | 'TIMING_CHANGED'
  | 'STRATEGY_CHANGED'
  | 'DUPLICATE'
  | 'BUDGET'
  | 'OTHER';

export interface SeasonalMetadata {
  season?: string;
  recurringWindow?: string;
  notes?: string;
}

export interface CampaignLibraryRecord {
  id: string;
  workspaceId: string;
  campaignId: string;
  classifications: CampaignLibraryClassification[];
  archivedAt?: string;
  cancellationReasonType?: CancellationReasonType;
  cancellationNotes?: string;
  evergreen: boolean;
  seasonal?: SeasonalMetadata;
  blueprintCandidate: boolean;
  blueprintId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryCampaignSummary {
  libraryRecord: CampaignLibraryRecord;
  campaignId: string;
  campaignName: string;
  objectiveType: string;
  objectiveName: string;
  primaryKpi: string;
  lifecycleStatus: string;
  primaryKpiValue?: number | null;
  performanceClassification?: string;
  channels: string[];
  completedAt?: string;
  sourceTitle: string;
  sourceType: string;
}

export interface LibrarySummary {
  total: number;
  highPerforming: number;
  lowPerforming: number;
  evergreen: number;
  seasonal: number;
  blueprints: number;
  cancelled: number;
  archived: number;
}
