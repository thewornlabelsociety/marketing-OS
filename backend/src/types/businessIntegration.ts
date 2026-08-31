export const READ_ONLY_BUSINESS_CAPABILITIES = ['READ_PRODUCTS'] as const;
export type BusinessCapability = 'READ_PRODUCTS' | 'READ_EVENTS' | 'READ_DEALS' | 'READ_CONTENT' | 'READ_AVAILABILITY';
export type BusinessIntegrationStatus = 'CONNECTED' | 'SYNCING' | 'NEEDS_ATTENTION' | 'DISCONNECTED';
export type SourceRecordType = 'PRODUCT' | 'EATERY' | 'DEAL' | 'EVENT' | 'MENU_ITEM' | 'POST';

export interface NormalizedSourceRecord {
  externalId: string;
  sourceType: SourceRecordType;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrls: string[];
  priceAmount?: number;
  priceCurrency?: string;
  availability: 'AVAILABLE' | 'SOLD' | 'UNAVAILABLE';
  occurredAt?: string;
  sourceUpdatedAt?: string;
  payload: Record<string, unknown>;
}

export interface ConnectorSyncResult {
  records: NormalizedSourceRecord[];
  checkpoint?: string;
}

export interface BusinessIntegrationConnector {
  readonly type: string;
  readonly capabilities: readonly BusinessCapability[];
  sync(config: Record<string, unknown>, secret: string | null, checkpoint: string | null): Promise<ConnectorSyncResult>;
}
