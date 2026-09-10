import type { CreativeArtifact, CreativeContent, CreativeQualityResult } from '../../types/creativeArtifact';

export interface CreativeArtifactRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  source_content_plan_id: string;
  source_content_plan_version: number;
  content_key: string;
  deliverable_id: string;
  version: number;
  status: string;
  is_current: number;
  channel: string;
  content_type: string;
  format: string;
  title: string | null;
  content: string;
  quality: string;
  media_asset_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export function normalizeCreativeTimestamp(value: string | Date): string {
  return new Date(value).toISOString();
}

export function mapCreativeArtifactRow(row: CreativeArtifactRow): CreativeArtifact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    sourceContentPlanId: row.source_content_plan_id,
    sourceContentPlanVersion: row.source_content_plan_version,
    contentKey: row.content_key,
    deliverableId: row.deliverable_id,
    version: row.version,
    channel: row.channel as CreativeArtifact['channel'],
    contentType: row.content_type as CreativeArtifact['contentType'],
    format: row.format as CreativeArtifact['format'],
    title: row.title ?? undefined,
    content: JSON.parse(row.content) as CreativeContent,
    quality: JSON.parse(row.quality) as CreativeQualityResult,
    status: row.status as CreativeArtifact['status'],
    isCurrent: row.is_current === 1,
    mediaAssetId: row.media_asset_id ?? undefined,
    createdAt: normalizeCreativeTimestamp(row.created_at),
    updatedAt: normalizeCreativeTimestamp(row.updated_at),
  };
}
