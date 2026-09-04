import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { PublishingProviderRegistry } from '../../integrations/adapters/PublishingProviderRegistry';
import type { PublicationReconciliationInput, PublishAttempt, PublishableAsset, ScheduledContentItem } from '../../types/scheduledContent';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { prePublishCheckService } from './PrePublishCheckService';
import { schedulingService, type SchedulingServiceError } from './SchedulingService';
import { buildIdempotencyKey } from './publishingUtils';
import { tokenTtlSeconds } from '../media/MediaDeliveryService';

export type PublishingServiceError = { error: string; code: string };

interface AttemptRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  schedule_id: string;
  attempt_number: number;
  provider_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  idempotency_key: string;
  status: string;
  destination_id: string | null;
  connection_id: string | null;
  external_publish_id: string | null;
  external_url: string | null;
  provider_status: string | null;
  error_code: string | null;
  error_message: string | null;
  error_category: string | null;
  resolution_method: string | null;
  resolution_evidence: string | null;
  resolved_at: string | null;
  media_asset_ids: string | null;
  media_checksums: string | null;
  media_delivery_metadata: string | null;
  started_at: string;
  completed_at: string | null;
}

function mapAttempt(row: AttemptRow): PublishAttempt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    scheduleId: row.schedule_id,
    attemptNumber: row.attempt_number,
    providerKey: row.provider_key,
    sourceCreativeArtifactId: row.source_creative_artifact_id,
    sourceCreativeVersion: row.source_creative_version,
    idempotencyKey: row.idempotency_key,
    status: row.status as PublishAttempt['status'],
    destinationId: row.destination_id ?? undefined,
    connectionId: row.connection_id ?? undefined,
    externalPublishId: row.external_publish_id ?? undefined,
    externalUrl: row.external_url ?? undefined,
    providerStatus: row.provider_status ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    errorCategory: row.error_category ?? undefined,
    resolutionMethod: row.resolution_method ?? undefined,
    resolutionEvidence: row.resolution_evidence ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    mediaAssetIds: row.media_asset_ids ? JSON.parse(row.media_asset_ids) as string[] : undefined,
    mediaChecksums: row.media_checksums ? JSON.parse(row.media_checksums) as string[] : undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export class PublishingService {
  getAttempts(scheduleId: string, campaignId: string): PublishAttempt[] {
    const rows = db.prepare(`
      SELECT * FROM publish_attempts
      WHERE schedule_id = ? AND campaign_id = ?
      ORDER BY attempt_number ASC
    `).all(scheduleId, campaignId) as AttemptRow[];
    return rows.map(mapAttempt);
  }

  private nextAttemptNumber(scheduleId: string): number {
    const row = db.prepare('SELECT MAX(attempt_number) as max_n FROM publish_attempts WHERE schedule_id = ?').get(scheduleId) as { max_n: number | null };
    return (row.max_n ?? 0) + 1;
  }

  private hasSuccessfulPublish(scheduleId: string): boolean {
    const row = db.prepare(`
      SELECT id FROM publish_attempts WHERE schedule_id = ? AND status = 'SUCCEEDED' LIMIT 1
    `).get(scheduleId);
    return Boolean(row);
  }

  private hasUnknownAttempt(scheduleId: string): boolean {
    const row = db.prepare(`
      SELECT id FROM publish_attempts WHERE schedule_id = ? AND status = 'UNKNOWN' LIMIT 1
    `).get(scheduleId);
    return Boolean(row);
  }

  // A PENDING attempt that is older than STALE_PENDING_THRESHOLD_MS was left behind by a
  // crashed process. We cannot know whether the publish reached the provider, so we promote
  // it to UNKNOWN — the same state as an acknowledged ambiguous outcome — and require operator
  // reconciliation before retrying. Reuses the existing UNKNOWN / Resolve-as-Published flow.
  private static readonly STALE_PENDING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

  private promoteStalePendingToUnknown(scheduleId: string): void {
    const cutoff = new Date(Date.now() - PublishingService.STALE_PENDING_THRESHOLD_MS).toISOString();
    db.prepare(`
      UPDATE publish_attempts
      SET status = 'UNKNOWN',
          error_code = 'STALE_PENDING',
          error_message = 'Attempt status unknown — process may have crashed during publish',
          error_category = 'UNKNOWN_RESULT',
          completed_at = COALESCE(completed_at, ?)
      WHERE schedule_id = ? AND status = 'PENDING' AND started_at < ?
    `).run(new Date().toISOString(), scheduleId, cutoff);
  }

  async publishSchedule(
    scheduleId: string,
    campaignId: string,
    options?: { manualPublish?: boolean },
  ): Promise<{ item: ScheduledContentItem; attempt?: PublishAttempt } | PublishingServiceError> {
    this.promoteStalePendingToUnknown(scheduleId);
    if (this.hasUnknownAttempt(scheduleId)) {
      return { error: 'Previous publish outcome is unknown. Reconcile before retrying.', code: 'RECONCILIATION_REQUIRED' };
    }
    const schedule = schedulingService.getById(scheduleId, campaignId);
    if (!schedule) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (schedule.status === 'CANCELLED') return { error: 'Schedule is cancelled.', code: 'SCHEDULE_CANCELLED' };
    if (schedule.status === 'PUBLISHED' || this.hasSuccessfulPublish(scheduleId)) {
      return { error: 'Item already published.', code: 'ALREADY_PUBLISHED' };
    }

    const artifact = creativeGeneratorService.getById(schedule.sourceCreativeArtifactId, campaignId);
    if (!artifact) return { error: 'Source creative not found.', code: 'NOT_FOUND' };

    const preflight = prePublishCheckService.run(schedule, artifact, { manualPublish: options?.manualPublish ?? true });
    if (!preflight.ready) {
      const code = preflight.blockers[0] ?? 'PUBLISH_VALIDATION_FAILED';
      if (code === 'ASSET_MISSING' || code === 'MEDIA_INVALID' || code === 'MEDIA_NOT_PUBLICLY_ACCESSIBLE') {
        const reason = code === 'MEDIA_NOT_PUBLICLY_ACCESSIBLE'
          ? 'Media is not publicly accessible for provider publishing.'
          : code === 'MEDIA_INVALID'
            ? 'Scheduled media failed validation.'
            : 'Visual asset required before direct publishing.';
        db.prepare(`UPDATE scheduled_content_items SET status = 'BLOCKED', block_reason = ?, updated_at = ? WHERE id = ?`)
          .run(reason, new Date().toISOString(), scheduleId);
      }
      return { error: preflight.blockers.join('; '), code };
    }

    if (schedule.publicationMode !== 'DIRECT') {
      return { error: 'Direct publish is not available for manual/export schedules.', code: 'PUBLISH_VALIDATION_FAILED' };
    }

    const destination = db.prepare('SELECT provider_key, connection_id FROM publishing_destinations WHERE id = ?').get(schedule.destinationId!) as
      { provider_key: string; connection_id: string } | undefined;
    const provider = destination ? PublishingProviderRegistry.get(destination.provider_key) : null;
    if (!provider) return { error: 'Publishing provider unavailable.', code: 'PROVIDER_UNAVAILABLE' };

    if (provider.validatePublication) {
      const pubValidation = await provider.validatePublication({
        workspaceId: schedule.workspaceId,
        campaignId: schedule.campaignId,
        scheduleId: schedule.id,
        channel: schedule.channel,
        destinationId: schedule.destinationId!,
        contentKey: schedule.contentKey,
        creativeArtifactId: schedule.sourceCreativeArtifactId,
        creativeVersion: schedule.sourceCreativeVersion,
        content: artifact.content,
        mediaAssets: schedule.mediaAssets,
        scheduledFor: schedule.scheduledFor,
        idempotencyKey: buildIdempotencyKey(schedule.id, schedule.sourceCreativeArtifactId, schedule.sourceCreativeVersion),
      });
      if (!pubValidation.valid) {
        const failedAt = new Date().toISOString();
        db.prepare(`UPDATE scheduled_content_items SET status = 'FAILED', updated_at = ? WHERE id = ?`)
          .run(failedAt, scheduleId);
        return { error: pubValidation.error ?? 'Provider validation failed', code: pubValidation.code ?? 'PUBLISH_VALIDATION_FAILED' };
      }
    }

    const idempotencyKey = buildIdempotencyKey(schedule.id, schedule.sourceCreativeArtifactId, schedule.sourceCreativeVersion);
    const existingSuccess = db.prepare(`
      SELECT id FROM publish_attempts WHERE idempotency_key = ? AND status = 'SUCCEEDED'
    `).get(idempotencyKey);
    if (existingSuccess) {
      return { error: 'Item already published.', code: 'ALREADY_PUBLISHED' };
    }

    const attemptId = `patt_${randomUUID()}`;
    const attemptNumber = this.nextAttemptNumber(scheduleId);
    const startedAt = new Date().toISOString();
    db.prepare(`
      UPDATE scheduled_content_items SET status = 'PUBLISHING', updated_at = ? WHERE id = ?
    `).run(startedAt, scheduleId);

    const mediaAssetIds = schedule.mediaAssets.map((a) => a.id);
    const mediaChecksums = schedule.mediaAssets.map((a) => (a as PublishableAsset & { checksum?: string }).checksum ?? '');
    const deliveryMetadata = JSON.stringify({
      assetIds: mediaAssetIds,
      checksums: mediaChecksums.filter(Boolean),
      deliveryUrlGeneratedAt: startedAt,
      tokenTtlSeconds: tokenTtlSeconds(),
    });

    db.prepare(`
      INSERT INTO publish_attempts
        (id, workspace_id, campaign_id, schedule_id, attempt_number, provider_key,
         source_creative_artifact_id, source_creative_version, idempotency_key, status,
         destination_id, connection_id, media_asset_ids, media_checksums, media_delivery_metadata, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId,
      schedule.workspaceId,
      campaignId,
      scheduleId,
      attemptNumber,
      provider.providerKey,
      schedule.sourceCreativeArtifactId,
      schedule.sourceCreativeVersion,
      idempotencyKey,
      schedule.destinationId ?? null,
      destination?.connection_id ?? null,
      JSON.stringify(mediaAssetIds),
      JSON.stringify(mediaChecksums),
      deliveryMetadata,
      startedAt,
    );

    const result = await provider.publish({
      workspaceId: schedule.workspaceId,
      campaignId: schedule.campaignId,
      scheduleId: schedule.id,
      channel: schedule.channel,
      destinationId: schedule.destinationId!,
      contentKey: schedule.contentKey,
      creativeArtifactId: schedule.sourceCreativeArtifactId,
      creativeVersion: schedule.sourceCreativeVersion,
      content: artifact.content,
      mediaAssets: schedule.mediaAssets,
      scheduledFor: schedule.scheduledFor,
      idempotencyKey,
    });
    const completedAt = new Date().toISOString();

    if (result.success) {
      db.prepare(`
        UPDATE publish_attempts
        SET status = 'SUCCEEDED', external_publish_id = ?, external_url = ?, provider_status = ?, completed_at = ?
        WHERE id = ?
      `).run(result.externalPublishId ?? null, result.externalUrl ?? null, result.providerStatus ?? 'PUBLISHED', completedAt, attemptId);
      db.prepare(`
        UPDATE scheduled_content_items
        SET status = 'PUBLISHED', published_at = ?, external_publish_id = ?, external_url = ?, updated_at = ?
        WHERE id = ?
      `).run(result.publishedAt ?? completedAt, result.externalPublishId ?? null, result.externalUrl ?? null, completedAt, scheduleId);
    } else if (result.unknownOutcome) {
      db.prepare(`
        UPDATE publish_attempts
        SET status = 'UNKNOWN', error_code = ?, error_message = ?, error_category = ?, provider_status = ?, completed_at = ?
        WHERE id = ?
      `).run(result.errorCode ?? 'UNKNOWN_RESULT', result.errorMessage ?? 'Unknown publish outcome', result.errorCategory ?? 'UNKNOWN_RESULT', 'UNKNOWN', completedAt, attemptId);
      db.prepare(`
        UPDATE scheduled_content_items SET status = 'FAILED', block_reason = ?, updated_at = ? WHERE id = ?
      `).run('Publish outcome unknown — reconcile before retrying.', completedAt, scheduleId);
    } else {
      db.prepare(`
        UPDATE publish_attempts
        SET status = 'FAILED', error_code = ?, error_message = ?, error_category = ?, provider_status = ?, completed_at = ?
        WHERE id = ?
      `).run(result.errorCode ?? 'PUBLISH_FAILED', result.errorMessage ?? 'Publish failed', result.errorCategory ?? null, result.providerStatus ?? 'FAILED', completedAt, attemptId);
      db.prepare(`
        UPDATE scheduled_content_items SET status = 'FAILED', updated_at = ? WHERE id = ?
      `).run(completedAt, scheduleId);
    }

    return {
      item: schedulingService.getById(scheduleId, campaignId)!,
      attempt: mapAttempt(db.prepare('SELECT * FROM publish_attempts WHERE id = ?').get(attemptId) as AttemptRow),
    };
  }

  async retry(scheduleId: string, campaignId: string) {
    this.promoteStalePendingToUnknown(scheduleId);
    if (this.hasUnknownAttempt(scheduleId)) {
      return { error: 'Previous publish outcome is unknown. Reconcile before retrying.', code: 'RECONCILIATION_REQUIRED' };
    }
    return this.publishSchedule(scheduleId, campaignId, { manualPublish: true });
  }

  markPublished(
    scheduleId: string,
    campaignId: string,
    input: PublicationReconciliationInput,
  ): { item: ScheduledContentItem } | PublishingServiceError {
    const schedule = schedulingService.getById(scheduleId, campaignId);
    if (!schedule) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (schedule.status === 'CANCELLED') return { error: 'Schedule is cancelled.', code: 'SCHEDULE_CANCELLED' };
    if (this.hasSuccessfulPublish(scheduleId) || schedule.status === 'PUBLISHED') {
      return { error: 'Item already published.', code: 'ALREADY_PUBLISHED' };
    }

    const hasUnknownAttempt = this.hasUnknownAttempt(scheduleId);
    if (!hasUnknownAttempt && schedule.publicationMode !== 'MANUAL' && schedule.publicationMode !== 'EXPORT') {
      return { error: 'Only uncertain provider outcomes or manual/export items can be reconciled.', code: 'PUBLISH_VALIDATION_FAILED' };
    }

    const evidence = input.evidence?.trim();
    if (!evidence) {
      return { error: 'Reconciliation evidence is required.', code: 'PUBLISH_VALIDATION_FAILED' };
    }

    const artifact = creativeGeneratorService.getById(schedule.sourceCreativeArtifactId, campaignId);
    if (!artifact) return { error: 'Source creative not found.', code: 'NOT_FOUND' };
    const preflight = prePublishCheckService.run(schedule, artifact, { manualPublish: true });
    if (preflight.blockers.includes('CREATIVE_NOT_APPROVED') || preflight.blockers.includes('APPROVED_VERSION_MISMATCH')) {
      return { error: preflight.blockers.join('; '), code: preflight.blockers[0] ?? 'PUBLISH_VALIDATION_FAILED' };
    }

    const publishedAt = input.publishedAt ?? new Date().toISOString();
    if (Number.isNaN(new Date(publishedAt).getTime())) {
      return { error: 'Invalid publication date/time.', code: 'PUBLISH_VALIDATION_FAILED' };
    }
    const now = new Date().toISOString();
    const resolve = db.transaction(() => {
      db.prepare(`
        UPDATE scheduled_content_items
        SET status = 'PUBLISHED', published_at = ?, external_publish_id = ?, external_url = ?,
            block_reason = NULL, updated_at = ?
        WHERE id = ? AND campaign_id = ?
      `).run(
        new Date(publishedAt).toISOString(),
        input.externalPublishId?.trim() || null,
        input.externalUrl?.trim() || null,
        now,
        scheduleId,
        campaignId,
      );

      const unknown = db.prepare(`
        SELECT id FROM publish_attempts
        WHERE schedule_id = ? AND status = 'UNKNOWN'
        LIMIT 1
      `).get(scheduleId) as { id: string } | undefined;

      if (unknown) {
        // Preserve the original attempt identity and provider history while recording
        // that a human, not the provider API, resolved the outcome.
        db.prepare(`
          UPDATE publish_attempts
          SET status = 'SUCCEEDED', provider_status = 'MANUALLY_RESOLVED',
              external_publish_id = COALESCE(?, external_publish_id),
              external_url = COALESCE(?, external_url),
              resolution_method = 'OPERATOR_CONFIRMED_EXTERNAL',
              resolution_evidence = ?, resolved_at = ?, completed_at = COALESCE(completed_at, ?)
          WHERE schedule_id = ? AND status = 'UNKNOWN'
        `).run(
          input.externalPublishId?.trim() || null,
          input.externalUrl?.trim() || null,
          evidence,
          now,
          now,
          scheduleId,
        );
      } else {
        // MANUAL/EXPORT publication has no provider request. Create truthful lineage
        // without claiming that an external provider API returned success.
        db.prepare(`
          INSERT INTO publish_attempts
            (id, workspace_id, campaign_id, schedule_id, attempt_number, provider_key,
             source_creative_artifact_id, source_creative_version, idempotency_key, status,
             external_publish_id, external_url, provider_status, resolution_method,
             resolution_evidence, resolved_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, 'manual_reconciliation', ?, ?, ?, 'SUCCEEDED',
                  ?, ?, 'MANUALLY_RESOLVED', 'OPERATOR_CONFIRMED_EXTERNAL', ?, ?, ?, ?)
        `).run(
          `attempt_${randomUUID()}`,
          schedule.workspaceId,
          campaignId,
          scheduleId,
          this.nextAttemptNumber(scheduleId),
          schedule.sourceCreativeArtifactId,
          schedule.sourceCreativeVersion,
          `manual-resolution:${scheduleId}`,
          input.externalPublishId?.trim() || null,
          input.externalUrl?.trim() || null,
          evidence,
          now,
          now,
          now,
        );
      }
    });
    resolve();

    return { item: schedulingService.getById(scheduleId, campaignId)! };
  }
}

export const publishingService = new PublishingService();
