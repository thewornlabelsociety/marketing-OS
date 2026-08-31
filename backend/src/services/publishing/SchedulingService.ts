import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { DEFAULT_SCHEDULE_TIMEZONE } from './publishingUtils';
import type { MarketingChannel } from '../../types/channels';
import type {
  CampaignPublishingSummary,
  PublicationExportBundle,
  PublicationMode,
  PublishableAsset,
  ScheduledContentItem,
  ScheduledContentStatus,
  UnscheduledDeliverable,
} from '../../types/scheduledContent';
import { contentPlannerService } from '../campaigns/ContentPlannerService';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { mediaAssetService } from '../media/MediaAssetService';
import { prePublishCheckService } from './PrePublishCheckService';
import { hasRequiredPublishableMedia } from './publishingUtils';

export type SchedulingServiceError = { error: string; code: string };

interface ScheduleRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  content_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  channel: string;
  destination_id: string | null;
  scheduled_for: string;
  timezone: string;
  status: string;
  publication_mode: string;
  media_assets: string;
  notes: string | null;
  published_at: string | null;
  external_publish_id: string | null;
  external_url: string | null;
  cancelled_at: string | null;
  block_reason: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ScheduleRow, newerRevisionAvailable = false, reconciliationRequired = false): ScheduledContentItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    contentKey: row.content_key,
    sourceCreativeArtifactId: row.source_creative_artifact_id,
    sourceCreativeVersion: row.source_creative_version,
    channel: row.channel as MarketingChannel,
    destinationId: row.destination_id ?? undefined,
    scheduledFor: row.scheduled_for,
    timezone: row.timezone,
    status: row.status as ScheduledContentStatus,
    publicationMode: row.publication_mode as PublicationMode,
    mediaAssets: JSON.parse(row.media_assets) as PublishableAsset[],
    notes: row.notes ?? undefined,
    publishedAt: row.published_at ?? undefined,
    externalPublishId: row.external_publish_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    blockReason: row.block_reason ?? undefined,
    newerRevisionAvailable,
    reconciliationRequired: reconciliationRequired || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const HAS_UNKNOWN_ATTEMPT_CASE = `CASE WHEN EXISTS (
  SELECT 1 FROM publish_attempts pa WHERE pa.schedule_id = sci.id AND pa.status = 'UNKNOWN'
) THEN 1 ELSE 0 END AS has_unknown_attempt`;

function resolveApprovedCreative(
  campaignId: string,
  contentKey: string,
): { artifactId: string; version: number; channel: MarketingChannel; contentType: string } | SchedulingServiceError {
  const approval = creativeGeneratorService.getApproval(campaignId, contentKey);
  if (!approval) {
    return { error: 'Approve creative before scheduling.', code: 'CREATIVE_NOT_APPROVED' };
  }
  const artifact = creativeGeneratorService.getById(approval.creativeArtifactId, campaignId);
  if (!artifact) {
    return { error: 'Approved creative artifact not found.', code: 'NOT_FOUND' };
  }
  if (artifact.version !== approval.approvedVersion) {
    return { error: 'Approved creative version mismatch.', code: 'APPROVED_VERSION_MISMATCH' };
  }
  return {
    artifactId: artifact.id,
    version: artifact.version,
    channel: artifact.channel,
    contentType: artifact.contentType,
  };
}

function hasNewerUnapprovedRevision(campaignId: string, contentKey: string, scheduledArtifactId: string): boolean {
  const current = creativeGeneratorService.getCurrent(campaignId, contentKey);
  if (!current) return false;
  if (current.id === scheduledArtifactId) return false;
  return !creativeGeneratorService.isDeliverableApproved(campaignId, contentKey);
}

export class SchedulingService {
  list(campaignId: string): ScheduledContentItem[] {
    const rows = db.prepare(`
      SELECT sci.*, ${HAS_UNKNOWN_ATTEMPT_CASE}
      FROM scheduled_content_items sci
      WHERE sci.campaign_id = ? AND sci.cancelled_at IS NULL
      ORDER BY sci.scheduled_for ASC
    `).all(campaignId) as (ScheduleRow & { has_unknown_attempt: number })[];
    return rows.map((row) => mapRow(
      row,
      hasNewerUnapprovedRevision(campaignId, row.content_key, row.source_creative_artifact_id),
      row.has_unknown_attempt === 1,
    ));
  }

  getById(scheduleId: string, campaignId: string): ScheduledContentItem | null {
    const row = db.prepare(`
      SELECT sci.*, ${HAS_UNKNOWN_ATTEMPT_CASE}
      FROM scheduled_content_items sci
      WHERE sci.id = ? AND sci.campaign_id = ?
    `).get(scheduleId, campaignId) as (ScheduleRow & { has_unknown_attempt: number }) | undefined;
    if (!row) return null;
    return mapRow(
      row,
      hasNewerUnapprovedRevision(campaignId, row.content_key, row.source_creative_artifact_id),
      row.has_unknown_attempt === 1,
    );
  }

  getSummary(campaignId: string): CampaignPublishingSummary | SchedulingServiceError {
    const creativeSummary = creativeGeneratorService.getSummary(campaignId);
    if ('error' in creativeSummary) return creativeSummary;

    const schedules = this.list(campaignId);
    const approvedDeliverables = creativeSummary.deliverables.filter((d) => d.isApproved);
    const scheduledKeys = new Set(schedules.filter((s) => s.status !== 'CANCELLED').map((s) => s.contentKey));

    const unscheduledItems: UnscheduledDeliverable[] = [];
    const plan = contentPlannerService.getApprovedContentPlan(campaignId);
    for (const d of approvedDeliverables) {
      if (scheduledKeys.has(d.contentKey)) continue;
      const deliverable = plan?.deliverables.find((x) => x.contentKey === d.contentKey);
      const timing = deliverable?.timing;
      const suggestedTiming = timing?.phase
        ? `${timing.phase}${timing.relativeOrder ? ` · Day ${timing.relativeOrder}` : ''}`
        : undefined;
      unscheduledItems.push({
        contentKey: d.contentKey,
        title: d.title,
        channel: d.channel,
        contentType: d.contentType,
        format: d.format,
        approvedVersion: d.currentVersion ?? 1,
        creativeArtifactId: d.artifactId ?? '',
        suggestedTiming,
      });
    }

    const active = schedules.filter((s) => s.status !== 'CANCELLED');
    return {
      totalApprovedCreative: approvedDeliverables.length,
      scheduled: active.length,
      published: active.filter((s) => s.status === 'PUBLISHED').length,
      failed: active.filter((s) => s.status === 'FAILED').length,
      unscheduled: unscheduledItems.length,
      blocked: active.filter((s) => s.status === 'BLOCKED').length,
      upcoming: active.filter((s) => ['SCHEDULED', 'READY', 'BLOCKED', 'FAILED', 'PUBLISHING'].includes(s.status)),
      unscheduledItems,
      publishedItems: active.filter((s) => s.status === 'PUBLISHED'),
      failedItems: active.filter((s) => s.status === 'FAILED'),
    };
  }

  create(
    campaignId: string,
    workspaceId: string,
    input: {
      contentKey: string;
      scheduledFor: string;
      timezone?: string;
      publicationMode: PublicationMode;
      destinationId?: string;
      notes?: string;
      mediaAssets?: PublishableAsset[];
    },
  ): { item: ScheduledContentItem } | SchedulingServiceError {
    const approved = resolveApprovedCreative(campaignId, input.contentKey);
    if ('error' in approved) return approved;

    const scheduledDate = new Date(input.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      return { error: 'Invalid scheduled date/time.', code: 'PUBLISH_VALIDATION_FAILED' };
    }

    // Single-workspace local mode has one authoritative scheduling timezone.
    // Clients may send the value for compatibility, but cannot establish a competing authority.
    const timezone = DEFAULT_SCHEDULE_TIMEZONE;
    let mediaAssets: PublishableAsset[] = input.mediaAssets ?? [];
    if (mediaAssets.length > 0) {
      try {
        mediaAssets = mediaAssetService.pinForSchedule(mediaAssets, workspaceId, {
          campaignId,
          contentKey: input.contentKey,
          creativeArtifactId: approved.artifactId,
          creativeVersion: approved.version,
        });
      } catch (err) {
        const code = err instanceof Error && err.message === 'MEDIA_VERSION_MISMATCH'
          ? 'MEDIA_VERSION_MISMATCH'
          : 'MEDIA_MISSING';
        return { error: 'Media asset could not be pinned to this creative version.', code };
      }
    }

    if (input.publicationMode === 'DIRECT' && input.destinationId) {
      const dest = db.prepare('SELECT channel, workspace_id FROM publishing_destinations WHERE id = ?').get(input.destinationId) as
        { channel: string; workspace_id: string } | undefined;
      if (!dest || dest.workspace_id !== workspaceId) {
        return { error: 'Destination not found.', code: 'DESTINATION_REQUIRED' };
      }
      if (dest.channel !== approved.channel) {
        return { error: 'Destination is incompatible with deliverable channel.', code: 'PUBLISH_VALIDATION_FAILED' };
      }
    }

    let status: ScheduledContentStatus = 'SCHEDULED';
    let blockReason: string | undefined;
    if (input.publicationMode === 'DIRECT' && !hasRequiredPublishableMedia(approved.contentType, mediaAssets)) {
      status = 'BLOCKED';
      blockReason = 'Visual asset required before direct publishing.';
    }

    const id = `sched_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO scheduled_content_items
        (id, workspace_id, campaign_id, content_key, source_creative_artifact_id, source_creative_version,
         channel, destination_id, scheduled_for, timezone, status, publication_mode, media_assets, notes, block_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      campaignId,
      input.contentKey,
      approved.artifactId,
      approved.version,
      approved.channel,
      input.destinationId ?? null,
      scheduledDate.toISOString(),
      timezone,
      status,
      input.publicationMode,
      JSON.stringify(mediaAssets),
      input.notes ?? null,
      blockReason ?? null,
      now,
      now,
    );

    return { item: this.getById(id, campaignId)! };
  }

  update(
    scheduleId: string,
    campaignId: string,
    input: { scheduledFor?: string; timezone?: string; destinationId?: string | null; notes?: string; mediaAssets?: PublishableAsset[] },
  ): { item: ScheduledContentItem } | SchedulingServiceError {
    const existing = this.getById(scheduleId, campaignId);
    if (!existing) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (existing.status === 'PUBLISHED') return { error: 'Published items cannot be rescheduled.', code: 'ALREADY_PUBLISHED' };
    if (existing.status === 'CANCELLED') return { error: 'Cancelled items cannot be updated.', code: 'SCHEDULE_CANCELLED' };

    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor).toISOString() : existing.scheduledFor;
    const timezone = DEFAULT_SCHEDULE_TIMEZONE;
    const destinationId = input.destinationId === undefined ? existing.destinationId : input.destinationId ?? undefined;
    const mediaAssets = input.mediaAssets !== undefined
      ? (() => {
        try {
          return mediaAssetService.pinForSchedule(input.mediaAssets!, existing.workspaceId, {
            campaignId,
            contentKey: existing.contentKey,
            creativeArtifactId: existing.sourceCreativeArtifactId,
            creativeVersion: existing.sourceCreativeVersion,
          });
        } catch {
          return input.mediaAssets!;
        }
      })()
      : existing.mediaAssets;
    const notes = input.notes ?? existing.notes;
    const now = new Date().toISOString();

    let status = existing.status === 'FAILED' ? 'SCHEDULED' : existing.status;
    let blockReason = existing.blockReason;
    const artifact = creativeGeneratorService.getById(existing.sourceCreativeArtifactId, campaignId);
    if (existing.publicationMode === 'DIRECT' && artifact && !hasRequiredPublishableMedia(artifact.contentType, mediaAssets)) {
      status = 'BLOCKED';
      blockReason = 'Visual asset required before direct publishing.';
    } else if (status === 'BLOCKED' && artifact && hasRequiredPublishableMedia(artifact.contentType, mediaAssets)) {
      status = 'SCHEDULED';
      blockReason = undefined;
    }

    db.prepare(`
      UPDATE scheduled_content_items
      SET scheduled_for = ?, timezone = ?, destination_id = ?, media_assets = ?, notes = ?, status = ?, block_reason = ?, updated_at = ?
      WHERE id = ? AND campaign_id = ?
    `).run(
      scheduledFor,
      timezone,
      destinationId ?? null,
      JSON.stringify(mediaAssets),
      notes ?? null,
      status,
      blockReason ?? null,
      now,
      scheduleId,
      campaignId,
    );

    return { item: this.getById(scheduleId, campaignId)! };
  }

  updateScheduledVersion(
    scheduleId: string,
    campaignId: string,
    creativeArtifactId: string,
  ): { item: ScheduledContentItem } | SchedulingServiceError {
    const existing = this.getById(scheduleId, campaignId);
    if (!existing) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (existing.status === 'PUBLISHED') return { error: 'Published items cannot change source version.', code: 'ALREADY_PUBLISHED' };

    const artifact = creativeGeneratorService.getById(creativeArtifactId, campaignId);
    if (!artifact || artifact.contentKey !== existing.contentKey) {
      return { error: 'Creative artifact not found for this deliverable.', code: 'NOT_FOUND' };
    }

    const approval = creativeGeneratorService.getApproval(campaignId, existing.contentKey);
    if (!approval || approval.creativeArtifactId !== artifact.id || approval.approvedVersion !== artifact.version) {
      return { error: 'Target creative version is not explicitly approved.', code: 'CREATIVE_NOT_APPROVED' };
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE scheduled_content_items
      SET source_creative_artifact_id = ?, source_creative_version = ?, updated_at = ?
      WHERE id = ? AND campaign_id = ?
    `).run(artifact.id, artifact.version, now, scheduleId, campaignId);

    return { item: this.getById(scheduleId, campaignId)! };
  }

  cancel(scheduleId: string, campaignId: string): { item: ScheduledContentItem } | SchedulingServiceError {
    const existing = this.getById(scheduleId, campaignId);
    if (!existing) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (existing.status === 'PUBLISHED') return { error: 'Published items cannot be cancelled.', code: 'ALREADY_PUBLISHED' };

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE scheduled_content_items
      SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
      WHERE id = ? AND campaign_id = ?
    `).run(now, now, scheduleId, campaignId);

    return { item: this.getById(scheduleId, campaignId)! };
  }

  buildExportBundle(scheduleId: string, campaignId: string): PublicationExportBundle | SchedulingServiceError {
    const schedule = this.getById(scheduleId, campaignId);
    if (!schedule) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    const artifact = creativeGeneratorService.getById(schedule.sourceCreativeArtifactId, campaignId);
    if (!artifact) return { error: 'Source creative not found.', code: 'NOT_FOUND' };
    const campaign = db.prepare('SELECT id, name FROM campaigns WHERE id = ?').get(campaignId) as { id: string; name: string };

    return {
      campaign: { id: campaign.id, name: campaign.name },
      deliverable: {
        contentKey: schedule.contentKey,
        title: artifact.title ?? schedule.contentKey,
        channel: schedule.channel,
        format: artifact.format,
      },
      approvedCreativeVersion: schedule.sourceCreativeVersion,
      creativeArtifactId: schedule.sourceCreativeArtifactId,
      copy: artifact.content,
      assetReferences: schedule.mediaAssets,
      scheduledFor: schedule.scheduledFor,
      timezone: schedule.timezone,
      instructions: schedule.publicationMode === 'EXPORT'
        ? 'Export this bundle and publish through your external workflow.'
        : 'Complete manual publishing using the approved copy and asset references.',
    };
  }

  listForWorkspace(workspaceId: string): ScheduledContentItem[] {
    const rows = db.prepare(`
      SELECT sci.*, ${HAS_UNKNOWN_ATTEMPT_CASE}
      FROM scheduled_content_items sci
      WHERE sci.workspace_id = ? AND sci.cancelled_at IS NULL
      ORDER BY sci.scheduled_for ASC
    `).all(workspaceId) as (ScheduleRow & { has_unknown_attempt: number })[];
    return rows.map((row) => mapRow(
      row,
      hasNewerUnapprovedRevision(row.campaign_id, row.content_key, row.source_creative_artifact_id),
      row.has_unknown_attempt === 1,
    ));
  }

  preflight(scheduleId: string, campaignId: string, options?: { manualPublish?: boolean }) {
    const schedule = this.getById(scheduleId, campaignId);
    if (!schedule) return { error: 'Schedule not found.', code: 'NOT_FOUND' } as SchedulingServiceError;
    const artifact = creativeGeneratorService.getById(schedule.sourceCreativeArtifactId, campaignId);
    if (!artifact) return { error: 'Source creative not found.', code: 'NOT_FOUND' } as SchedulingServiceError;
    return prePublishCheckService.run(schedule, artifact, options);
  }
}

export const schedulingService = new SchedulingService();
