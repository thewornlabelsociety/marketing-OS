import fs from 'fs';
import type { CreativeArtifact } from '../../types/creativeArtifact';
import type { MediaValidationCode, MediaValidationResult } from '../../types/mediaAsset';
import type { PublishableAsset, ScheduledContentItem } from '../../types/scheduledContent';
import { isMetaMockMode } from '../../integrations/meta/MetaGraphClient';
import { detectMimeFromBuffer } from './mediaStorageUtils';
import { mediaAssetService } from './MediaAssetService';
import { mediaDeliveryService } from './MediaDeliveryService';

const IMAGE_TYPES = new Set(['STATIC_POST', 'CAROUSEL', 'STORY']);

export class MediaValidationService {
  validatePublicBaseUrl(): MediaValidationResult {
    const checks: MediaValidationResult['checks'] = [];
    const blockers: MediaValidationCode[] = [];
    if (isMetaMockMode() || process.env.META_MOCK_MODE === '1') {
      checks.push({ key: 'public_base_url', status: 'PASS', message: 'Mock mode — localhost allowed' });
      return { valid: true, checks, blockers, warnings: [] };
    }
    const base = process.env.MEDIA_PUBLIC_BASE_URL ?? '';
    if (!base.trim()) {
      checks.push({ key: 'public_base_url', status: 'FAIL', message: 'MEDIA_PUBLIC_BASE_URL is required for live provider publishing', code: 'MEDIA_NOT_PUBLICLY_ACCESSIBLE' });
      blockers.push('MEDIA_NOT_PUBLICLY_ACCESSIBLE');
      return { valid: false, checks, blockers, warnings: [] };
    }
    const lower = base.toLowerCase();
    if (
      lower.includes('localhost')
      || lower.includes('127.0.0.1')
      || lower.startsWith('file:')
      || /^[a-z]:\\/i.test(base)
      || base.includes('\\')
    ) {
      checks.push({ key: 'public_base_url', status: 'FAIL', message: 'Media base URL is not publicly accessible', code: 'MEDIA_NOT_PUBLICLY_ACCESSIBLE' });
      blockers.push('MEDIA_NOT_PUBLICLY_ACCESSIBLE');
      return { valid: false, checks, blockers, warnings: [] };
    }
    checks.push({ key: 'public_base_url', status: 'PASS' });
    return { valid: true, checks, blockers, warnings: [] };
  }

  validateAsset(asset: PublishableAsset, workspaceId: string): MediaValidationResult {
    const checks: MediaValidationResult['checks'] = [];
    const blockers: MediaValidationCode[] = [];
    const warnings: string[] = [];

    // Non-canonical assets (no mass_ id, no storageKey, no localPathReference) are
    // trusted pass-throughs — they pre-date the media asset registry.
    if (!asset.id.startsWith('mass_') && !asset.storageKey && !asset.localPathReference) {
      checks.push({ key: 'asset_exists', status: 'PASS', message: 'Non-canonical asset accepted' });
      return { valid: true, checks, blockers, warnings };
    }

    const resolved = mediaAssetService.resolveReadableAsset(asset, workspaceId);
    if (!resolved) {
      checks.push({ key: 'asset_exists', status: 'FAIL', message: 'Media asset not found or unreadable', code: 'MEDIA_MISSING' });
      blockers.push('MEDIA_MISSING');
      return { valid: false, checks, blockers, warnings };
    }

    const { record, absolutePath } = resolved;
    if (record.workspaceId && record.workspaceId !== workspaceId) {
      checks.push({ key: 'workspace', status: 'FAIL', message: 'Media asset workspace mismatch', code: 'MEDIA_WORKSPACE_MISMATCH' });
      blockers.push('MEDIA_WORKSPACE_MISMATCH');
      return { valid: false, checks, blockers, warnings };
    }

    const stat = fs.statSync(absolutePath);
    if (stat.size <= 0) {
      checks.push({ key: 'file_size', status: 'FAIL', message: 'Media file is empty', code: 'MEDIA_INVALID' });
      blockers.push('MEDIA_INVALID');
    } else {
      checks.push({ key: 'file_size', status: 'PASS' });
    }

    const buffer = fs.readFileSync(absolutePath);
    const detected = detectMimeFromBuffer(buffer);
    if (!detected) {
      checks.push({ key: 'mime', status: 'FAIL', message: 'Unsupported or corrupted media file', code: 'MEDIA_INVALID' });
      blockers.push('MEDIA_INVALID');
    } else {
      checks.push({ key: 'mime', status: 'PASS', message: detected });
      if (asset.mimeType && asset.mimeType !== detected) {
        warnings.push(`Declared MIME ${asset.mimeType} differs from detected ${detected}`);
      }
    }

    if (record.status === 'UNAVAILABLE' || record.status === 'DELETED') {
      checks.push({ key: 'status', status: 'FAIL', message: 'Media asset unavailable', code: 'MEDIA_UNAVAILABLE' });
      blockers.push('MEDIA_UNAVAILABLE');
    } else {
      checks.push({ key: 'status', status: 'PASS' });
    }

    const publicUrl = mediaDeliveryService.resolvePublicUrl(asset, workspaceId);
    if (!publicUrl) {
      checks.push({ key: 'delivery_url', status: 'FAIL', message: 'Could not generate provider delivery URL', code: 'MEDIA_INVALID' });
      blockers.push('MEDIA_INVALID');
    } else if (publicUrl.includes('\\') || /[a-z]:\\/i.test(publicUrl)) {
      checks.push({ key: 'delivery_url', status: 'FAIL', message: 'Delivery URL exposes local filesystem path', code: 'MEDIA_INVALID' });
      blockers.push('MEDIA_INVALID');
    } else {
      checks.push({ key: 'delivery_url', status: 'PASS' });
    }

    return { valid: blockers.length === 0, checks, blockers, warnings };
  }

  validateForSchedule(
    schedule: ScheduledContentItem,
    artifact: CreativeArtifact,
    options?: { requirePublicUrl?: boolean },
  ): MediaValidationResult {
    const checks: MediaValidationResult['checks'] = [];
    const blockers: MediaValidationCode[] = [];
    const warnings: string[] = [];

    if (schedule.publicationMode !== 'DIRECT') {
      return { valid: true, checks: [{ key: 'mode', status: 'PASS', message: 'Non-direct mode' }], blockers, warnings };
    }

    if (IMAGE_TYPES.has(artifact.contentType) && schedule.mediaAssets.length === 0) {
      checks.push({ key: 'presence', status: 'FAIL', message: 'Visual asset required', code: 'MEDIA_MISSING' });
      blockers.push('MEDIA_MISSING');
      return { valid: false, checks, blockers, warnings };
    }

    for (const asset of schedule.mediaAssets) {
      const result = this.validateAsset(asset, schedule.workspaceId);
      checks.push(...result.checks);
      blockers.push(...result.blockers);
      warnings.push(...result.warnings);
    }

    if (options?.requirePublicUrl) {
      const publicCheck = this.validatePublicBaseUrl();
      checks.push(...publicCheck.checks);
      blockers.push(...publicCheck.blockers);
      warnings.push(...publicCheck.warnings);
    }

    return { valid: blockers.length === 0, checks, blockers, warnings };
  }
}

export const mediaValidationService = new MediaValidationService();
