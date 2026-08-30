export type AutomationLevel = 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT';

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  brandBrain: BrandBrainSummary | null;
  automationLevel: AutomationLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrandBrainSummary {
  displayName: string;
  voice: string[];
  bannedWords: string[];
  preferredWords: string[];
}
