export interface IntakeRecord {
  externalId: string;
  title: string;
  description: string | null;
  price: number | null;
  images: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  receivedAt: string;
}

// Intake providers are brand-agnostic; entity_id routes the record to the correct workspace
export interface IntakeProvider {
  readonly provider: string;
  fetchPending(): Promise<IntakeRecord[]>;
  acknowledge(externalId: string): Promise<void>;
}
