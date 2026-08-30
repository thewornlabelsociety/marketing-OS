import type { BrandKit, ContentItem, ContentRow, Entity, EntityRow, PerformanceLog, PerformanceRow } from '../types';

export function parseBrandKit(raw: string): BrandKit {
  const kit = JSON.parse(raw || '{}') as BrandKit;
  const palette = kit.visualIdentity?.palette;
  const typography = kit.visualIdentity?.typography ?? kit.typography;
  const voiceAndTone = kit.voiceAndTone;

  return {
    ...kit,
    primaryColor: kit.primaryColor ?? palette?.primary,
    secondaryColor: kit.secondaryColor ?? palette?.accent,
    backgroundColor: kit.backgroundColor ?? palette?.neutralLight,
    typography: kit.typography ?? typography,
    voice: kit.voice ?? {
      archetype: voiceAndTone?.archetype,
      tone: voiceAndTone?.toneKeywords?.join(', '),
    },
  };
}

export function mapEntityRow(r: EntityRow): Entity {
  const brandKit = parseBrandKit(r.brand_kit);
  const voiceAndTone = brandKit.voiceAndTone;
  const voice = brandKit.voice;

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    tenantId: r.tenant_id,
    archetype: voice?.archetype ?? voiceAndTone?.archetype ?? '',
    brandKit,
    apiKeys: JSON.parse(r.api_keys || '{}') as Record<string, string>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapContentRow(r: ContentRow): ContentItem {
  return {
    id: r.id,
    entityId: r.entity_id,
    tenantId: r.tenant_id,
    type: r.type,
    title: r.title,
    bodyMarkdown: r.body_markdown ?? null,
    assets: JSON.parse(r.assets || '[]') as unknown[],
    status: r.status,
    targetChannels: JSON.parse(r.target_channels || '[]') as string[],
    scheduledFor: r.scheduled_for ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPerformanceRow(r: PerformanceRow): PerformanceLog {
  return {
    id: r.id,
    entityId: r.entity_id,
    contentId: r.content_id ?? null,
    impressions: r.impressions ?? 0,
    revenue: r.revenue ?? 0,
    conversions: r.conversions ?? 0,
    hook: r.hook ?? null,
    aiLearnings: r.ai_learnings ?? null,
    isSyncedToVault: r.is_synced_to_vault === 1,
    createdAt: r.created_at,
    updatedAt: r.created_at,
  };
}

export function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof out[key] === 'object'
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}
