import type { BrandKit, Campaign, CampaignBrief, CampaignPlan, CampaignSourceType, ContentItem, Entity, Objective, PerformanceLog } from '../types';

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
  // Entities / Workspaces
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

  // Objectives
  getObjectives: (workspaceId?: string) =>
    request<Objective[]>(workspaceId ? `/objectives?workspaceId=${encodeURIComponent(workspaceId)}` : '/objectives'),
  createObjective: (payload: {
    workspaceId: string;
    name: string;
    description?: string;
    objectiveType: string;
    primaryKpi: string;
    supportingKpis?: string[];
    defaultChannels?: string[];
  }) =>
    request<Objective>('/objectives', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  patchObjective: (id: string, patch: Partial<Omit<Objective, 'id' | 'workspaceId' | 'isSystem' | 'createdAt'>>) =>
    request<Objective>(`/objectives/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Campaigns
  getCampaigns: (workspaceId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set('workspaceId', workspaceId);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request<Campaign[]>(`/campaigns${qs ? `?${qs}` : ''}`);
  },
  getCampaign: (id: string) => request<Campaign>(`/campaigns/${id}`),
  createCampaign: (payload: {
    workspaceId: string;
    objectiveId: string;
    name?: string;
    sourceType: CampaignSourceType;
    sourceId?: string;
    sourceTitle: string;
    sourceDescription?: string;
    brief?: string;
    channels?: string[];
  }) =>
    request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  patchCampaign: (id: string, patch: Partial<Campaign>) =>
    request<Campaign>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Campaign Brief
  getCampaignBrief: (campaignId: string) =>
    request<CampaignBrief>(`/campaigns/${campaignId}/brief`),
  patchCampaignBrief: (campaignId: string, patch: Partial<CampaignBrief>) =>
    request<CampaignBrief>(`/campaigns/${campaignId}/brief`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Campaign Plans
  getCampaignPlan: (campaignId: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan`),
  getCampaignPlanStatus: (campaignId: string) =>
    request<{ aiConfigured: boolean; aiProvider: string | null; hasPlan: boolean }>(
      `/campaigns/${campaignId}/plan/status`
    ),
  getCampaignPlanVersions: (campaignId: string) =>
    request<CampaignPlan[]>(`/campaigns/${campaignId}/plan/versions`),
  generateCampaignPlan: (campaignId: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan`, { method: 'POST' }),
  requestPlanRevision: (campaignId: string, requestText: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan/revisions`, {
      method: 'POST',
      body: JSON.stringify({ requestText }),
    }),
  approveCampaignPlan: (campaignId: string, planId: string) =>
    request<{ approved: boolean }>(`/campaigns/${campaignId}/plan/approve`, {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),

  // Content
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

  // Performance
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
