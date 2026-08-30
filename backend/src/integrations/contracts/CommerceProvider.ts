export interface ProductRecord {
  externalId: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  inventory: number | null;
  sku: string | null;
  images: string[];
  isActive: boolean;
}

export interface CommerceProvider {
  readonly provider: string;
  listProducts(workspaceRef: string): Promise<ProductRecord[]>;
  getProduct(externalId: string): Promise<ProductRecord>;
}
