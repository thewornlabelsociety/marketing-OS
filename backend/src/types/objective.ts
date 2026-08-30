export type ObjectiveType =
  | 'SALES'
  | 'LEAD_GENERATION'
  | 'TRAFFIC'
  | 'AWARENESS'
  | 'ENGAGEMENT'
  | 'LAUNCH'
  | 'EVENT_PROMOTION'
  | 'EMAIL_LIST_GROWTH'
  | 'CUSTOMER_RETENTION'
  | 'RE_ENGAGEMENT'
  | 'EDUCATION'
  | 'COMMUNITY_GROWTH'
  | 'INVENTORY_CLEARANCE'
  | 'CUSTOM';

export interface Objective {
  id: string;
  workspaceId: string | null; // null = system template
  name: string;
  description: string;
  objectiveType: ObjectiveType;
  primaryKpi: string;
  supportingKpis: string[];
  conversionEvent: string | null;
  successCriteria: string | null;
  defaultChannels: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
