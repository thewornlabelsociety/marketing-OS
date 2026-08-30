import { createHmac, randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import type { PublishableAsset } from '../../types/scheduledContent';

const TOKEN_TTL_MS = 60 * 60 * 1000;

function signingSecret(): string {
  return process.env.MEDIA_DELIVERY_SECRET ?? process.env.CREDENTIAL_ENCRYPTION_KEY ?? 'local-media-delivery-secret';
}

function baseUrl(): string {
  return process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4100}`;
}

export class MediaDeliveryService {
  createHostedToken(assetId: string, workspaceId: string, localPathReference: string): string {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = `${assetId}:${workspaceId}:${expiresAt}:${localPathReference}`;
    const sig = createHmac('sha256', signingSecret()).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  resolvePublicUrl(asset: PublishableAsset, workspaceId: string): string | null {
    if (!asset.localPathReference && !asset.storageKey) return null;
    const localPath = asset.localPathReference ?? asset.storageKey!;
    const token = this.createHostedToken(asset.id, workspaceId, localPath);
    return `${baseUrl()}/api/media/hosted/${token}`;
  }

  verifyToken(token: string): { localPath: string; workspaceId: string } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length < 5) return null;
      const sig = parts.pop()!;
      const localPath = parts.pop()!;
      const expiresAt = Number(parts.pop());
      const workspaceId = parts.pop()!;
      const assetId = parts.join(':');
      const payload = `${assetId}:${workspaceId}:${expiresAt}:${localPath}`;
      const expected = createHmac('sha256', signingSecret()).update(payload).digest('hex');
      if (expected !== sig) return null;
      if (Date.now() > expiresAt) return null;
      const resolved = path.resolve(localPath);
      if (!fs.existsSync(resolved)) return null;
      return { localPath: resolved, workspaceId };
    } catch {
      return null;
    }
  }

  /** Register a transient hosted asset for provider delivery when only a local path exists. */
  ensureHostedAsset(asset: PublishableAsset, workspaceId: string): PublishableAsset {
    if (asset.storageKey || asset.localPathReference) return asset;
    return asset;
  }
}

export const mediaDeliveryService = new MediaDeliveryService();
