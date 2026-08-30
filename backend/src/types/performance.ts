export type PerformanceClassification =
  | 'EXCEPTIONAL'
  | 'HIGH_PERFORMING'
  | 'ABOVE_AVERAGE'
  | 'AVERAGE'
  | 'BELOW_AVERAGE'
  | 'LOW_PERFORMING'
  | 'INSUFFICIENT_DATA';

export interface PerformanceMetrics {
  // Reach & Visibility
  reach: number | null;
  impressions: number | null;
  views: number | null;
  watchTime: number | null;
  completionRate: number | null;
  // Engagement
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  // Traffic
  clicks: number | null;
  ctr: number | null;
  websiteSessions: number | null;
  // Conversion
  leads: number | null;
  trials: number | null;
  purchases: number | null;
  revenue: number | null;
  // Advertising
  adSpend: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
}

export interface CampaignPerformance {
  id: string;
  workspaceId: string;
  campaignId: string;
  objectiveId: string;
  channel: string | null;
  metrics: PerformanceMetrics;
  classification: PerformanceClassification | null;
  // Score is always against objective, not vanity metrics
  objectiveScore: number | null;
  recordedAt: string;
  createdAt: string;
}
