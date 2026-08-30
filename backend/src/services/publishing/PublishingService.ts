import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { PublishingProviderRegistry } from '../../integrations/adapters/PublishingProviderRegistry';
import type { PublishAttempt, ScheduledContentItem } from '../../types/scheduledContent';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { prePublishCheckService } from './PrePublishCheckService';
import { schedulingService, type SchedulingServiceError } from './SchedulingService';
import { buildIdempotencyKey } from './publishingUtils';

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

  async publishSchedule(
    scheduleId: string,
    campaignId: string,
    options?: { manualPublish?: boolean },
  ): Promise<{ item: ScheduledContentItem; attempt?: PublishAttempt } | PublishingServiceError> {
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
      if (code === 'ASSET_MISSING') {
        db.prepare(`UPDATE scheduled_content_items SET status = 'BLOCKED', block_reason = ?, updated_at = ? WHERE id = ?`)
          .run('Visual asset required before direct publishing.', new Date().toISOString(), scheduleId);
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

    db.prepare(`
      INSERT INTO publish_attempts
        (id, workspace_id, campaign_id, schedule_id, attempt_number, provider_key,
         source_creative_artifact_id, source_creative_version, idempotency_key, status,
         destination_id, connection_id, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
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
    if (this.hasUnknownAttempt(scheduleId)) {
      return { error: 'Previous publish outcome is unknown. Reconcile before retrying.', code: 'RECONCILIATION_REQUIRED' };
    }
    return this.publishSchedule(scheduleId, campaignId, { manualPublish: true });
  }

  markPublished(
    scheduleId: string,
    campaignId: string,
    input: { publishedAt?: string; externalUrl?: string; notes?: string },
  ): { item: ScheduledContentItem } | PublishingServiceError {
    const schedule = schedulingService.getById(scheduleId, campaignId);
    if (!schedule) return { error: 'Schedule not found.', code: 'NOT_FOUND' };
    if (schedule.status === 'CANCELLED') return { error: 'Schedule is cancelled.', code: 'SCHEDULE_CANCELLED' };
    if (this.hasSuccessfulPublish(scheduleId) || schedule.status === 'PUBLISHED') {
      return { error: 'Item already published.', code: 'ALREADY_PUBLISHED' };
    }

    const artifact = creativeGeneratorService.getById(schedule.sourceCreativeArtifactId, campaignId);
    if (!artifact) return { error: 'Source creative not found.', code: 'NOT_FOUND' };
    const preflight = prePublishCheckService.run(schedule, artifact, { manualPublish: true });
    if (preflight.blockers.includes('CREATIVE_NOT_APPROVED') || preflight.blockers.includes('APPROVED_VERSION_MISMATCH')) {
      return { error: preflight.blockers.join('; '), code: preflight.blockers[0] ?? 'PUBLISH_VALIDATION_FAILED' };
    }

    const publishedAt = input.publishedAt ?? new Date().toISOString();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE scheduled_content_items
      SET status = 'PUBLISHED', published_at = ?, external_url = ?, notes = COALESCE(?, notes), updated_at = ?
      WHERE id = ? AND campaign_id = ?
    `).run(publishedAt, input.externalUrl ?? null, input.notes ?? null, now, scheduleId, campaignId);

    return { item: schedulingService.getById(scheduleId, campaignId)! };
  }
}

export const publishingService = new PublishingService();
