import type { BrandKit, ContentItem, Entity, PerformanceLog } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  getEntities: () => request<Entity[]>('/entities'),
  createEntity: (payload: { id: string; name: string; slug: string; brand_kit?: BrandKit }) =>
    request<{ success: boolean; id: string }>('/entities', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  patchBrandKit: (id: string, brandKit: Partial<BrandKit>) =>
    request<Entity>(`/entities/${id}/brand-kit`, {
      method: 'PATCH',
      body: JSON.stringify(brandKit),
    }),
  deleteEntity: (id: string) =>
    request<{ success: boolean; deletedId: string }>(`/entities/${id}`, {
      method: 'DELETE',
    }),
  getContent: (entityId?: string) =>
    request<ContentItem[]>(entityId ? `/content?entityId=${entityId}` : '/content'),
  createContent: (payload: {
    entityId: string;
    type: string;
    title: string;
    bodyMarkdown?: string;
    status?: string;
    targetChannels?: string[];
    scheduledFor?: string | null;
  }) =>
    request<ContentItem>('/content', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteContent: (id: string) =>
    request<void>(`/content/${id}`, { method: 'DELETE' }),
  getPerformance: (entityId?: string) =>
    request<PerformanceLog[]>(
      entityId ? `/performance?entityId=${entityId}` : '/performance'
    ),
  createPerformance: (payload: {
    entityId: string;
    contentId?: string | null;
    impressions?: number;
    revenue?: number;
    conversions?: number;
    hook?: string | null;
    aiLearnings?: string | null;
  }) =>
    request<PerformanceLog>('/performance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  syncVault: (entityId?: string) =>
    request<{ synced: number; entities: string[] }>('/performance/sync-vault', {
      method: 'POST',
      body: JSON.stringify(entityId ? { entityId } : {}),
    }),
};
