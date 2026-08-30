import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../../db/database';
import type { PublishableAsset } from '../../types/scheduledContent';
import type { MediaAssetRecord } from '../../types/mediaAsset';
import {
  detectMimeFromBuffer,
  ensureDir,
  resolveStoragePath,
  sha256Checksum,
  workspaceMediaDir,
} from './mediaStorageUtils';

interface AssetRow {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  content_key: string | null;
  creative_artifact_id: string | null;
  creative_version: number | null;
  storage_key: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  checksum: string;
  original_filename: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: AssetRow): MediaAssetRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id ?? undefined,
    contentKey: row.content_key ?? undefined,
    creativeArtifactId: row.creative_artifact_id ?? undefined,
    creativeVersion: row.creative_version ?? undefined,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    checksum: row.checksum,
    originalFilename: row.original_filename ?? undefined,
    status: row.status as MediaAssetRecord['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MediaAssetService {
  getById(id: string, workspaceId: string): MediaAssetRecord | null {
    const row = db.prepare('SELECT * FROM media_assets WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as AssetRow | undefined;
    return row ? mapRow(row) : null;
  }

  getAbsolutePath(record: MediaAssetRecord): string {
    return resolveStoragePath(record.workspaceId, record.storageKey);
  }

  readBytes(record: MediaAssetRecord): Buffer | null {
    if (record.status !== 'ACTIVE') return null;
    const abs = this.getAbsolutePath(record);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs);
  }

  toPublishableAsset(record: MediaAssetRecord): PublishableAsset {
    return {
      id: record.id,
      type: record.mimeType.startsWith('image/') ? 'IMAGE' : record.mimeType.startsWith('video/') ? 'VIDEO' : 'FILE',
      storageProvider: 'local',
      storageKey: record.storageKey,
      mimeType: record.mimeType,
      width: record.width,
      height: record.height,
    };
  }

  registerFromBuffer(input: {
    workspaceId: string;
    buffer: Buffer;
    mimeType?: string;
    originalFilename?: string;
    campaignId?: string;
    contentKey?: string;
    creativeArtifactId?: string;
    creativeVersion?: number;
  }): MediaAssetRecord {
    const detected = detectMimeFromBuffer(input.buffer);
    const mimeType = input.mimeType ?? detected;
    if (!mimeType) throw new Error('Unsupported or undetectable media type');

    const checksum = sha256Checksum(input.buffer);
    const existing = db.prepare(`
      SELECT * FROM media_assets
      WHERE workspace_id = ? AND checksum = ? AND status = 'ACTIVE'
        AND COALESCE(campaign_id, '') = COALESCE(?, '')
        AND COALESCE(content_key, '') = COALESCE(?, '')
        AND COALESCE(creative_artifact_id, '') = COALESCE(?, '')
        AND COALESCE(creative_version, -1) = COALESCE(?, -1)
      LIMIT 1
    `).get(
      input.workspaceId,
      checksum,
      input.campaignId ?? null,
      input.contentKey ?? null,
      input.creativeArtifactId ?? null,
      input.creativeVersion ?? null,
    ) as AssetRow | undefined;
    if (existing) return mapRow(existing);

    const id = `mass_${randomUUID()}`;
    const storageKey = `${id}${mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : '.bin'}`;
    const dir = workspaceMediaDir(input.workspaceId);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, storageKey), input.buffer);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO media_assets
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, creative_version,
         storage_key, mime_type, file_size, checksum, original_filename, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      id,
      input.workspaceId,
      input.campaignId ?? null,
      input.contentKey ?? null,
      input.creativeArtifactId ?? null,
      input.creativeVersion ?? null,
      storageKey,
      mimeType,
      input.buffer.length,
      checksum,
      input.originalFilename ?? null,
      now,
      now,
    );
    return this.getById(id, input.workspaceId)!;
  }

  registerFromLocalPath(input: {
    workspaceId: string;
    localPath: string;
    mimeType?: string;
    originalFilename?: string;
    campaignId?: string;
    contentKey?: string;
    creativeArtifactId?: string;
    creativeVersion?: number;
  }): MediaAssetRecord {
    const resolved = path.resolve(input.localPath);
    if (!fs.existsSync(resolved)) throw new Error('Media file not found');
    const buffer = fs.readFileSync(resolved);
    return this.registerFromBuffer({
      ...input,
      buffer,
      originalFilename: input.originalFilename ?? path.basename(resolved),
    });
  }

  /** Resolve schedule payload assets to canonical pinned records. */
  pinForSchedule(
    assets: PublishableAsset[],
    workspaceId: string,
    context: {
      campaignId: string;
      contentKey: string;
      creativeArtifactId: string;
      creativeVersion: number;
    },
  ): PublishableAsset[] {
    return assets.map((asset) => {
      if (asset.id.startsWith('mass_')) {
        const record = this.getById(asset.id, workspaceId);
        if (!record || record.status !== 'ACTIVE') {
          throw new Error('MEDIA_MISSING');
        }
        if (
          record.creativeArtifactId
          && record.creativeVersion
          && (record.creativeArtifactId !== context.creativeArtifactId || record.creativeVersion !== context.creativeVersion)
        ) {
          throw new Error('MEDIA_VERSION_MISMATCH');
        }
        return { ...this.toPublishableAsset(record), checksum: record.checksum } as PublishableAsset & { checksum?: string };
      }
      if (asset.localPathReference) {
        const record = this.registerFromLocalPath({
          workspaceId,
          localPath: asset.localPathReference,
          mimeType: asset.mimeType,
          campaignId: context.campaignId,
          contentKey: context.contentKey,
          creativeArtifactId: context.creativeArtifactId,
          creativeVersion: context.creativeVersion,
        });
        return { ...this.toPublishableAsset(record), checksum: record.checksum } as PublishableAsset & { checksum?: string };
      }
      if (asset.storageKey) {
        const abs = resolveStoragePath(workspaceId, asset.storageKey);
        if (!fs.existsSync(abs)) throw new Error('MEDIA_MISSING');
        const buffer = fs.readFileSync(abs);
        const record = this.registerFromBuffer({
          workspaceId,
          buffer,
          mimeType: asset.mimeType,
          campaignId: context.campaignId,
          contentKey: context.contentKey,
          creativeArtifactId: context.creativeArtifactId,
          creativeVersion: context.creativeVersion,
        });
        return { ...this.toPublishableAsset(record), checksum: record.checksum } as PublishableAsset & { checksum?: string };
      }
      // Non-canonical asset (no mass_ id, no localPathReference, no storageKey) —
      // pre-Phase 3K style; pass through as-is for backward compatibility.
      return asset;
    });
  }

  resolveReadableAsset(asset: PublishableAsset, workspaceId: string): { record: MediaAssetRecord; absolutePath: string } | null {
    if (asset.id.startsWith('mass_')) {
      const record = this.getById(asset.id, workspaceId);
      if (!record || record.status !== 'ACTIVE') return null;
      const absolutePath = this.getAbsolutePath(record);
      if (!fs.existsSync(absolutePath)) return null;
      return { record, absolutePath };
    }
    if (asset.storageKey) {
      try {
        const absolutePath = resolveStoragePath(workspaceId, asset.storageKey);
        if (!fs.existsSync(absolutePath)) return null;
        return {
          record: {
            id: asset.id,
            workspaceId,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            fileSize: fs.statSync(absolutePath).size,
            checksum: sha256Checksum(fs.readFileSync(absolutePath)),
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          absolutePath,
        };
      } catch {
        return null;
      }
    }
    if (asset.localPathReference && fs.existsSync(path.resolve(asset.localPathReference))) {
      const absolutePath = path.resolve(asset.localPathReference);
      const buffer = fs.readFileSync(absolutePath);
      return {
        record: {
          id: asset.id,
          workspaceId,
          storageKey: path.basename(absolutePath),
          mimeType: asset.mimeType ?? detectMimeFromBuffer(buffer) ?? 'application/octet-stream',
          fileSize: buffer.length,
          checksum: sha256Checksum(buffer),
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        absolutePath,
      };
    }
    return null;
  }

  markUnavailable(id: string, workspaceId: string): void {
    db.prepare(`UPDATE media_assets SET status = 'UNAVAILABLE', updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .run(new Date().toISOString(), id, workspaceId);
  }
}

export const mediaAssetService = new MediaAssetService();
