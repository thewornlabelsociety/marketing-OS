export type OfferType =
  | 'PHYSICAL_PRODUCT'
  | 'INVENTORY_BATCH'
  | 'SERVICE'
  | 'SOFTWARE_FEATURE'
  | 'PACKAGE'
  | 'EVENT'
  | 'OFFER'
  | 'PROMOTION'
  | 'ANNOUNCEMENT'
  | 'EDUCATIONAL_CONTENT';

export interface Offer {
  id: string;
  workspaceId: string;
  offerType: OfferType;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  sku: string | null;
  inventory: number | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
