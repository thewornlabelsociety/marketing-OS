export type AutomationLevel = 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT';

export type SopTrigger = 'CAMPAIGN_CREATED' | 'CONTENT_READY' | 'REVIEW_COMPLETE' | 'CAMPAIGN_APPROVED' | 'CAMPAIGN_PUBLISHED' | 'MANUAL';

export interface Sop {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  trigger: SopTrigger;
  automationLevel: AutomationLevel;
  steps: SopStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SopStep {
  order: number;
  action: string;
  params: Record<string, unknown>;
  requiresApproval: boolean;
}
