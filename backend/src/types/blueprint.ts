export type BlueprintStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface BlueprintStrategy {
  objectiveRole?: string;
  audiencePattern?: string;
  positioning?: string;
  messageHierarchy?: string;
  proofStrategy?: string;
  ctaStrategy?: string;
  offerFraming?: string;
  creativePrinciples?: string[];
  channelRoles?: Record<string, string>;
}

export interface BlueprintContentItem {
  sequence: number;
  purpose: string;
  contentType: string;
  channel: string;
  format?: string;
  objectiveRole?: string;
  messageRole?: string;
  ctaRole?: string;
  relativeTiming?: string;
  creativeGuidance?: string;
  sourceContentKey?: string;
  sourceCreativeVersion?: number;
}

export interface BlueprintEvidenceSummary {
  sourceCampaignId: string;
  classification: string;
  confidence: string;
  primaryKpi: string;
  primaryKpiValue?: number | null;
  target?: string | null;
  targetResult?: string | null;
  attributedConversions?: number;
  attributedRevenue?: number;
  topContentKeys: string[];
  channelContributions: Array<{ channel: string; summary: string }>;
  relevantLearnings: string[];
  evaluationId?: string;
}

export interface BlueprintSourceExample {
  contentKey: string;
  creativeArtifactId?: string;
  creativeVersion?: number;
  role?: string;
}

export interface CampaignBlueprint {
  id: string;
  workspaceId: string;
  sourceCampaignId: string;
  name: string;
  description?: string;
  objectiveType: string;
  status: BlueprintStatus;
  currentVersion: number;
  strategicPattern: BlueprintStrategy;
  contentPattern: BlueprintContentItem[];
  channelPattern: string[];
  cadencePattern?: string;
  evidenceSummary: BlueprintEvidenceSummary;
  sourceExamples: BlueprintSourceExample[];
  learnedWhy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintUsage {
  id: string;
  workspaceId: string;
  blueprintId: string;
  blueprintVersion: number;
  campaignId: string;
  createdAt: string;
}
