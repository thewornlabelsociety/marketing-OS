import { createHmac } from 'crypto';
import fs from 'fs';
import type { PublishableAsset } from '../../types/scheduledContent';
import { isMetaMockMode } from '../../integrations/meta/MetaGraphClient';
import { mediaAssetService } from './MediaAssetService';

const DEFAULT_TTL_SECONDS = 86400; // 24h — Meta cURLs image_url at publish time; conservative window for retries

function signingSecret(): string {
  return process.env.MEDIA_DELIVERY_SECRET ?? process.env.CREDENTIAL_ENCRYPTION_KEY ?? 'local-media-delivery-secret';
}

export function tokenTtlSeconds(): number {
  const raw = process.env.MEDIA_SIGNED_URL_TTL_SECONDS;
  const parsed = raw ? Number(raw) : DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(parsed) || parsed < 60) return DEFAULT_TTL_SECONDS;
  return Math.min(parsed, 7 * 24 * 3600);
}

export function tokenTtlMs(): number {
  return tokenTtlSeconds() * 1000;
}

function baseUrl(): string {
  return process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4100}`;
}

export function isPublicBaseUrlValidForLive(): boolean {
  if (isMetaMockMode() || process.env.META_MOCK_MODE === '1') return true;
  const base = process.env.MEDIA_PUBLIC_BASE_URL ?? '';
  if (!base.trim()) return false;
  const lower = base.toLowerCase();
  return !(
    lower.includes('localhost')
    || lower.includes('127.0.0.1')
    || lower.startsWith('file:')
    || /^[a-z]:\\/i.test(base)
    || base.includes('\\')
  );
}

export class MediaDeliveryService {
  createHostedToken(assetId: string, workspaceId: string): string {
    return this.createHostedTokenWithExpiry(assetId, workspaceId, Date.now() + tokenTtlMs());
  }

  createHostedTokenWithExpiry(assetId: string, workspaceId: string, expiresAtMs: number): string {
    const payload = `${assetId}:${workspaceId}:${expiresAtMs}`;
    const sig = createHmac('sha256', signingSecret()).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  resolvePublicUrl(asset: PublishableAsset, workspaceId: string): string | null {
    const resolved = mediaAssetService.resolveReadableAsset(asset, workspaceId);
    if (!resolved) return null;
    const token = this.createHostedToken(resolved.record.id, workspaceId);
    return `${baseUrl()}/api/media/hosted/${token}`;
  }

  verifyToken(token: string): { assetId: string; workspaceId: string } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length < 4) return null;
      const sig = parts.pop()!;
      const expiresAt = Number(parts.pop());
      const workspaceId = parts.pop()!;
      const assetId = parts.join(':');
      const payload = `${assetId}:${workspaceId}:${expiresAt}`;
      const expected = createHmac('sha256', signingSecret()).update(payload).digest('hex');
      if (expected !== sig) return null;
      if (Date.now() > expiresAt) return null;
      return { assetId, workspaceId };
    } catch {
      return null;
    }
  }

  resolveHostedFile(token: string): { absolutePath: string; mimeType: string; workspaceId: string } | null {
    const verified = this.verifyToken(token);
    if (!verified) return null;
    const record = mediaAssetService.getById(verified.assetId, verified.workspaceId);
    if (!record || record.status !== 'ACTIVE') return null;
    try {
      const absolutePath = mediaAssetService.getAbsolutePath(record);
      if (!fs.existsSync(absolutePath)) return null;
      return { absolutePath, mimeType: record.mimeType, workspaceId: verified.workspaceId };
    } catch {
      return null;
    }
  }

  /** Backward-compatible helper for tests registering transient assets. */
  ensureHostedAsset(asset: PublishableAsset, workspaceId: string): PublishableAsset {
    if (asset.id.startsWith('mass_')) return asset;
    return asset;
  }
}

export const mediaDeliveryService = new MediaDeliveryService();
