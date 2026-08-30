export type IntegrationCategory = 'PUBLISHING' | 'ADVERTISING' | 'ANALYTICS' | 'COMMERCE' | 'INTAKE' | 'EDITING';

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'PENDING';

export interface Integration {
  id: string;
  workspaceId: string;
  provider: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  capabilities: string[];
  config: Record<string, unknown>; // provider-specific, never embed logic in core
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}
