import { db } from '../../db/database';
import { PublishingProviderRegistry } from '../../integrations/adapters/PublishingProviderRegistry';
import type { CreativeArtifact } from '../../types/creativeArtifact';
import type { PrePublishCheckResult, PublishableAsset, ScheduledContentItem } from '../../types/scheduledContent';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { mediaValidationService } from '../media/MediaValidationService';
import { isMetaMockMode } from '../../integrations/meta/MetaGraphClient';
import { buildIdempotencyKey, hasRequiredPublishableMedia } from './publishingUtils';

interface DestinationRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  provider_key: string;
  channel: string;
  status: string;
  capabilities?: string;
}

interface ConnectionRow {
  id: string;
  status: string;
}

export class PrePublishCheckService {
  run(
    schedule: ScheduledContentItem,
    artifact: CreativeArtifact,
    options?: { manualPublish?: boolean },
  ): PrePublishCheckResult {
    const checks: PrePublishCheckResult['checks'] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (schedule.status === 'CANCELLED') {
      checks.push({ key: 'schedule_cancelled', status: 'FAIL', message: 'Schedule is cancelled' });
      blockers.push('SCHEDULE_CANCELLED');
    } else {
      checks.push({ key: 'schedule_cancelled', status: 'PASS' });
    }

    const approval = creativeGeneratorService.getApproval(schedule.campaignId, schedule.contentKey);
    if (!approval) {
      checks.push({ key: 'creative_approved', status: 'FAIL', message: 'Creative is not approved' });
      blockers.push('CREATIVE_NOT_APPROVED');
    } else if (
      approval.creativeArtifactId !== schedule.sourceCreativeArtifactId
      || approval.approvedVersion !== schedule.sourceCreativeVersion
    ) {
      checks.push({ key: 'approved_version', status: 'FAIL', message: 'Scheduled source does not match approved creative version' });
      blockers.push('APPROVED_VERSION_MISMATCH');
    } else {
      checks.push({ key: 'approved_version', status: 'PASS' });
    }

    if (artifact.id !== schedule.sourceCreativeArtifactId || artifact.version !== schedule.sourceCreativeVersion) {
      checks.push({ key: 'artifact_exists', status: 'FAIL', message: 'Source creative artifact missing or version mismatch' });
      blockers.push('APPROVED_VERSION_MISMATCH');
    } else {
      checks.push({ key: 'artifact_exists', status: 'PASS' });
    }

    const succeeded = db.prepare(`
      SELECT id FROM publish_attempts
      WHERE schedule_id = ? AND status = 'SUCCEEDED'
    `).get(schedule.id) as { id: string } | undefined;
    if (succeeded && schedule.status === 'PUBLISHED') {
      checks.push({ key: 'duplicate', status: 'FAIL', message: 'Already published successfully' });
      blockers.push('ALREADY_PUBLISHED');
    } else {
      checks.push({ key: 'duplicate', status: 'PASS' });
    }

    if (schedule.publicationMode === 'MANUAL' || schedule.publicationMode === 'EXPORT') {
      checks.push({ key: 'provider', status: 'PASS', message: 'Manual/export mode — provider not required' });
      if (!hasRequiredPublishableMedia(artifact.contentType, schedule.mediaAssets)) {
        warnings.push('Visual assets may still be required for manual upload');
      }
      return { ready: blockers.length === 0, checks, blockers, warnings };
    }

    if (!schedule.destinationId) {
      checks.push({ key: 'destination', status: 'FAIL', message: 'Destination is required for direct publish' });
      blockers.push('DESTINATION_REQUIRED');
    } else {
      const destination = db.prepare('SELECT * FROM publishing_destinations WHERE id = ?').get(schedule.destinationId) as DestinationRow | undefined;
      if (!destination || destination.workspace_id !== schedule.workspaceId) {
        checks.push({ key: 'destination', status: 'FAIL', message: 'Destination not found' });
        blockers.push('DESTINATION_REQUIRED');
      } else if (destination.channel !== schedule.channel) {
        checks.push({ key: 'destination', status: 'FAIL', message: 'Destination channel mismatch' });
        blockers.push('PUBLISH_VALIDATION_FAILED');
      } else if (destination.status !== 'ACTIVE') {
        checks.push({ key: 'destination', status: 'FAIL', message: 'Destination inactive' });
        blockers.push('PUBLISH_VALIDATION_FAILED');
      } else {
        checks.push({ key: 'destination', status: 'PASS' });
        const connection = db.prepare('SELECT * FROM integration_connections WHERE id = ?').get(destination.connection_id) as ConnectionRow | undefined;
        if (!connection || connection.status !== 'CONNECTED') {
          if (connection?.status === 'REAUTH_REQUIRED' || connection?.status === 'EXPIRED') {
            checks.push({ key: 'connection', status: 'FAIL', message: 'Publishing connection requires reauthorization' });
            blockers.push('AUTH_EXPIRED');
          } else {
            checks.push({ key: 'connection', status: 'FAIL', message: 'Publishing connection not available' });
            blockers.push('CONNECTION_REQUIRED');
          }
        } else {
          checks.push({ key: 'connection', status: 'PASS' });
          const provider = PublishingProviderRegistry.get(destination.provider_key);
          if (!provider) {
            checks.push({ key: 'provider', status: 'FAIL', message: 'Publishing provider unavailable' });
            blockers.push('PROVIDER_UNAVAILABLE');
          } else {
            checks.push({ key: 'provider', status: 'PASS' });
            const caps = JSON.parse((destination as DestinationRow & { capabilities?: string }).capabilities || '[]') as string[];
            // Only enforce channel-specific capability when the destination already declares
            // granular publish_* capabilities (e.g. from Phase 3K meta destinations).
            // Legacy destinations with generic ["publish"] are accepted for backward compat.
            const hasGranularCaps = caps.some((c) => c.startsWith('publish_'));
            const needed = schedule.channel === 'FACEBOOK'
              ? 'publish_facebook_page_photo'
              : schedule.channel === 'INSTAGRAM'
                ? 'publish_image_feed'
                : null;
            if (needed && hasGranularCaps && !caps.includes(needed)) {
              checks.push({ key: 'destination_capability', status: 'FAIL', message: 'Destination does not support this publish operation' });
              blockers.push('PUBLISH_VALIDATION_FAILED');
            } else {
              checks.push({ key: 'destination_capability', status: 'PASS' });
            }
          }
        }
      }
    }

    if (!hasRequiredPublishableMedia(artifact.contentType, schedule.mediaAssets)) {
      checks.push({ key: 'assets', status: 'FAIL', message: 'Visual asset required before direct publishing' });
      blockers.push('ASSET_MISSING');
    } else {
      const mediaResult = mediaValidationService.validateForSchedule(schedule, artifact, {
        requirePublicUrl: !isMetaMockMode() && process.env.META_MOCK_MODE !== '1',
      });
      for (const check of mediaResult.checks) {
        checks.push({
          key: `media_${check.key}`,
          status: check.status === 'PASS' ? 'PASS' : check.status === 'WARNING' ? 'WARNING' : 'FAIL',
          message: check.message,
        });
      }
      for (const code of mediaResult.blockers) {
        if (code === 'MEDIA_NOT_PUBLICLY_ACCESSIBLE') blockers.push('MEDIA_NOT_PUBLICLY_ACCESSIBLE');
        else if (code === 'MEDIA_MISSING' || code === 'MEDIA_UNAVAILABLE') blockers.push('ASSET_MISSING');
        else blockers.push('MEDIA_INVALID');
      }
      warnings.push(...mediaResult.warnings);
      if (mediaResult.valid) {
        checks.push({ key: 'assets', status: 'PASS' });
      }
    }

    if (!options?.manualPublish) {
      const due = new Date(schedule.scheduledFor).getTime() <= Date.now();
      if (!due && schedule.status !== 'READY') {
        warnings.push('Scheduled time has not been reached');
      }
    }

    return { ready: blockers.length === 0, checks, blockers, warnings };
  }

  validateAssets(contentType: string, mediaAssets: PublishableAsset[], publicationMode: string): boolean {
    if (publicationMode !== 'DIRECT') return true;
    return hasRequiredPublishableMedia(contentType, mediaAssets);
  }

  idempotencyKeyFor(schedule: ScheduledContentItem): string {
    return buildIdempotencyKey(schedule.id, schedule.sourceCreativeArtifactId, schedule.sourceCreativeVersion);
  }
}

export const prePublishCheckService = new PrePublishCheckService();
