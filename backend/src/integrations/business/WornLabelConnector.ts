import type { BusinessIntegrationConnector, ConnectorSyncResult, NormalizedSourceRecord } from '../../types/businessIntegration';

interface WornLabelProduct {
  id: string; title: string; brand?: string | null; category?: string | null; subCategory?: string | null;
  size?: string | null; price: number; currency: string; description?: string | null; publicUrl?: string | null;
  primaryImageUrl?: string | null; images: string[]; publishedAt?: string | null; updatedAt?: string | null;
  availability: 'AVAILABLE' | 'SOLD' | 'UNAVAILABLE'; condition?: string | null;
  marketingBucket?: 'NEW' | 'CURRENT' | 'SALE' | null;
  attributes?: Record<string, unknown>;
}

export class WornLabelConnector implements BusinessIntegrationConnector {
  readonly type = 'WORN_LABEL';
  readonly capabilities = ['READ_PRODUCTS', 'READ_AVAILABILITY'] as const;

  async sync(config: Record<string, unknown>, secret: string | null, checkpoint: string | null): Promise<ConnectorSyncResult> {
    const baseUrl = String(config.baseUrl ?? '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Worn Label API URL is not configured');
    if (!secret) throw new Error('Worn Label service credential is not configured');

    const url = new URL(`${baseUrl}/api/service/marketing/products`);
    if (checkpoint) {
      // Incremental sync: fetch active + sold to detect availability changes
      url.searchParams.set('status', 'all');
      url.searchParams.set('updated_after', checkpoint);
    } else {
      // Initial full sync: active listings only (bounded, no historical noise)
      url.searchParams.set('status', 'active');
    }
    url.searchParams.set('limit', '100');

    const response = await fetch(url, { headers: { 'X-Service-Token': secret, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Worn Label sync failed (${response.status})`);
    const data = await response.json() as { products: WornLabelProduct[]; checkpoint?: string | null };

    const records: NormalizedSourceRecord[] = data.products.map((product) => ({
      externalId: product.id,
      sourceType: 'PRODUCT',
      title: product.title,
      subtitle: [product.brand, product.size].filter(Boolean).join(' · ') || undefined,
      description: product.description ?? undefined,
      imageUrls: Array.from(new Set([product.primaryImageUrl, ...product.images].filter((v): v is string => Boolean(v)))),
      priceAmount: product.price,
      priceCurrency: product.currency,
      availability: product.availability,
      occurredAt: product.publishedAt ?? undefined,
      sourceUpdatedAt: product.updatedAt ?? undefined,
      payload: {
        brand: product.brand, category: product.category, subCategory: product.subCategory,
        size: product.size, publicUrl: product.publicUrl, condition: product.condition,
        attributes: product.attributes ?? {},
      },
    }));
    return { records, checkpoint: data.checkpoint ?? undefined };
  }
}
