import type {
  BrandKit,
  Campaign,
  CampaignBrief,
  CampaignCreativeSummary,
  CampaignPublishingSummary,
  CampaignPlan,
  CampaignSourceType,
  ChannelCapability,
  ContentItem,
  ContentPlan,
  ContentPlanApprovalRecord,
  CreativeApprovalRecord,
  CreativeArtifact,
  IntegrationConnection,
  PublishingDestination,
  ScheduledContentItem,
  Entity,
  Objective,
  PerformanceLog,
} from '../types';

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

  // Campaign Brief (workspaceId enforces workspace isolation)
  getCampaignBrief: (campaignId: string, workspaceId: string) =>
    request<CampaignBrief>(`/campaigns/${campaignId}/brief?workspaceId=${encodeURIComponent(workspaceId)}`),
  patchCampaignBrief: (campaignId: string, workspaceId: string, patch: Partial<CampaignBrief>) =>
    request<CampaignBrief>(`/campaigns/${campaignId}/brief?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Campaign Plans (workspaceId enforces workspace isolation)
  getCampaignPlan: (campaignId: string, workspaceId: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan?workspaceId=${encodeURIComponent(workspaceId)}`),
  getCampaignPlanStatus: (campaignId: string, workspaceId: string) =>
    request<{ aiConfigured: boolean; aiProvider: string | null; hasPlan: boolean }>(
      `/campaigns/${campaignId}/plan/status?workspaceId=${encodeURIComponent(workspaceId)}`
    ),
  getCampaignPlanVersions: (campaignId: string, workspaceId: string) =>
    request<CampaignPlan[]>(`/campaigns/${campaignId}/plan/versions?workspaceId=${encodeURIComponent(workspaceId)}`),
  generateCampaignPlan: (campaignId: string, workspaceId: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'POST' }),
  requestPlanRevision: (campaignId: string, workspaceId: string, requestText: string) =>
    request<CampaignPlan>(`/campaigns/${campaignId}/plan/revisions`, {
      method: 'POST',
      body: JSON.stringify({ requestText, workspaceId }),
    }),
  approveCampaignPlan: (campaignId: string, workspaceId: string, planId: string) =>
    request<{ approved: boolean }>(`/campaigns/${campaignId}/plan/approve`, {
      method: 'POST',
      body: JSON.stringify({ planId, workspaceId }),
    }),
  getCampaignPlanApproval: (campaignId: string, workspaceId: string) =>
    request<{ approvedPlanId: string; approvedVersion: number; approvedAt: string }>(
      `/campaigns/${campaignId}/plan/approval?workspaceId=${encodeURIComponent(workspaceId)}`
    ),

  // Content Plans (workspaceId enforces workspace isolation)
  getContentPlan: (campaignId: string, workspaceId: string) =>
    request<ContentPlan>(`/campaigns/${campaignId}/content-plan?workspaceId=${encodeURIComponent(workspaceId)}`),
  getContentPlanStatus: (campaignId: string, workspaceId: string) =>
    request<{
      aiConfigured: boolean;
      aiProvider: string | null;
      hasContentPlan: boolean;
      contentPlanStatus: string | null;
      strategyApproved: boolean;
      contentPlanApproved: boolean;
      capabilities: ChannelCapability[];
    }>(`/campaigns/${campaignId}/content-plan/status?workspaceId=${encodeURIComponent(workspaceId)}`),
  getContentPlanVersions: (campaignId: string, workspaceId: string) =>
    request<ContentPlan[]>(`/campaigns/${campaignId}/content-plan/versions?workspaceId=${encodeURIComponent(workspaceId)}`),
  generateContentPlan: (campaignId: string, workspaceId: string) =>
    request<ContentPlan>(`/campaigns/${campaignId}/content-plan?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'POST' }),
  requestContentPlanRevision: (campaignId: string, workspaceId: string, requestText: string) =>
    request<ContentPlan>(`/campaigns/${campaignId}/content-plan/revisions`, {
      method: 'POST',
      body: JSON.stringify({ requestText, workspaceId }),
    }),
  approveContentPlan: (campaignId: string, workspaceId: string, contentPlanId: string) =>
    request<{ approved: boolean }>(`/campaigns/${campaignId}/content-plan/approval`, {
      method: 'POST',
      body: JSON.stringify({ contentPlanId, workspaceId }),
    }),
  getContentPlanApproval: (campaignId: string, workspaceId: string) =>
    request<ContentPlanApprovalRecord>(
      `/campaigns/${campaignId}/content-plan/approval?workspaceId=${encodeURIComponent(workspaceId)}`
    ),

  // Creative (workspaceId enforces workspace isolation)
  getCampaignCreative: (campaignId: string, workspaceId: string) =>
    request<CampaignCreativeSummary>(`/campaigns/${campaignId}/creative?workspaceId=${encodeURIComponent(workspaceId)}`),
  getCampaignCreativeStatus: (campaignId: string, workspaceId: string) =>
    request<{ aiConfigured: boolean; aiProvider: string | null; contentPlanApproved: boolean; summary: CampaignCreativeSummary | null }>(
      `/campaigns/${campaignId}/creative/status?workspaceId=${encodeURIComponent(workspaceId)}`
    ),
  generateAllCreative: (campaignId: string, workspaceId: string) =>
    request<{ artifacts: CreativeArtifact[]; failures: { contentKey: string; error: string; code?: string }[] }>(
      `/campaigns/${campaignId}/creative/generate`,
      { method: 'POST', body: JSON.stringify({ workspaceId }) },
    ),
  generateCreative: (campaignId: string, contentKey: string, workspaceId: string) =>
    request<CreativeArtifact>(`/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}/generate`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
  getCreative: (campaignId: string, contentKey: string, workspaceId: string) =>
    request<CreativeArtifact>(`/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}?workspaceId=${encodeURIComponent(workspaceId)}`),
  getCreativeVersions: (campaignId: string, contentKey: string, workspaceId: string) =>
    request<CreativeArtifact[]>(`/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}/versions?workspaceId=${encodeURIComponent(workspaceId)}`),
  requestCreativeRevision: (campaignId: string, contentKey: string, workspaceId: string, requestText: string, targetHint?: string) =>
    request<CreativeArtifact>(`/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ requestText, targetHint, workspaceId }),
    }),
  approveCreative: (campaignId: string, contentKey: string, workspaceId: string, creativeArtifactId: string) =>
    request<{ approved: boolean }>(`/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ creativeArtifactId, workspaceId }),
    }),
  getCreativeApproval: (campaignId: string, contentKey: string, workspaceId: string) =>
    request<CreativeApprovalRecord>(
      `/campaigns/${campaignId}/creative/${encodeURIComponent(contentKey)}/approval?workspaceId=${encodeURIComponent(workspaceId)}`
    ),

  // Schedule & Publishing
  getCampaignScheduleSummary: (campaignId: string, workspaceId: string) =>
    request<CampaignPublishingSummary>(`/campaigns/${campaignId}/schedule/summary?workspaceId=${encodeURIComponent(workspaceId)}`),
  getCampaignSchedule: (campaignId: string, workspaceId: string) =>
    request<ScheduledContentItem[]>(`/campaigns/${campaignId}/schedule?workspaceId=${encodeURIComponent(workspaceId)}`),
  createSchedule: (campaignId: string, workspaceId: string, payload: {
    contentKey: string;
    scheduledFor: string;
    timezone?: string;
    publicationMode: 'DIRECT' | 'EXPORT' | 'MANUAL';
    destinationId?: string;
    notes?: string;
  }) =>
    request<ScheduledContentItem>(`/campaigns/${campaignId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, workspaceId }),
    }),
  cancelSchedule: (campaignId: string, scheduleId: string, workspaceId: string) =>
    request<ScheduledContentItem>(`/campaigns/${campaignId}/schedule/${scheduleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
  publishSchedule: (campaignId: string, scheduleId: string, workspaceId: string) =>
    request<{ item: ScheduledContentItem }>(`/campaigns/${campaignId}/schedule/${scheduleId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
  retrySchedule: (campaignId: string, scheduleId: string, workspaceId: string) =>
    request<{ item: ScheduledContentItem }>(`/campaigns/${campaignId}/schedule/${scheduleId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    }),
  markSchedulePublished: (campaignId: string, scheduleId: string, workspaceId: string, payload?: { externalUrl?: string; notes?: string }) =>
    request<ScheduledContentItem>(`/campaigns/${campaignId}/schedule/${scheduleId}/mark-published`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, ...payload }),
    }),
  getWorkspaceSchedule: (workspaceId: string) =>
    request<ScheduledContentItem[]>(`/calendar/schedule?workspaceId=${encodeURIComponent(workspaceId)}`),
  getIntegrations: (workspaceId: string) =>
    request<IntegrationConnection[]>(`/integrations?workspaceId=${encodeURIComponent(workspaceId)}`),
  getPublishingDestinations: (workspaceId: string, channel?: string) =>
    request<PublishingDestination[]>(
      `/publishing/destinations?workspaceId=${encodeURIComponent(workspaceId)}${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`
    ),

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
