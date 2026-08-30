import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type { DestinationValidationResult, PublishRequest, PublishResult } from '../../types/publishing';
import type { PublishingProvider } from '../contracts/PublishingProvider';
import { mediaDeliveryService } from '../../services/media/MediaDeliveryService';
import { metaGraphClient, isMetaMockMode } from './MetaGraphClient';

interface DestinationRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  channel: string;
  external_destination_id: string;
  capabilities: string;
  status: string;
}

interface ConnectionRow {
  id: string;
  workspace_id: string;
  status: string;
  access_credential_ref: string | null;
  expires_at: string | null;
}

function mapErrorCategory(code?: string): PublishResult['errorCategory'] {
  switch (code) {
    case 'AUTH_EXPIRED': return 'AUTH_EXPIRED';
    case 'PERMISSION_DENIED': return 'PERMISSION_DENIED';
    case 'VALIDATION_FAILED': return 'VALIDATION_FAILED';
    case 'MEDIA_INVALID': return 'MEDIA_INVALID';
    case 'RATE_LIMITED': return 'RATE_LIMITED';
    case 'UNKNOWN_RESULT': return 'UNKNOWN_RESULT';
    case 'PROVIDER_REJECTED': return 'PROVIDER_REJECTED';
    default: return 'PROVIDER_TEMPORARY';
  }
}

function extractCaption(content: PublishRequest['content']): string {
  if ('caption' in content && typeof content.caption === 'string') return content.caption;
  if ('body' in content && typeof content.body === 'string') return content.body;
  if ('headline' in content && typeof content.headline === 'string') return content.headline;
  return '';
}

function requiredCapability(channel: MarketingChannel, contentKind: string): string {
  if (channel === 'FACEBOOK') return 'publish_facebook_page_photo';
  if (contentKind === 'STATIC_POST') return 'publish_image_feed';
  return 'publish_image_feed';
}

export class MetaPublishingProvider implements PublishingProvider {
  readonly providerKey = 'meta';

  supports(channel: MarketingChannel): boolean {
    return channel === 'INSTAGRAM' || channel === 'FACEBOOK';
  }

  async validateDestination(destinationId: string, channel: MarketingChannel): Promise<DestinationValidationResult> {
    const destination = db.prepare('SELECT * FROM publishing_destinations WHERE id = ?').get(destinationId) as DestinationRow | undefined;
    if (!destination) return { valid: false, error: 'Destination not found', code: 'DESTINATION_REQUIRED' };
    if (destination.channel !== channel) {
      return { valid: false, error: 'Destination channel mismatch', code: 'PUBLISH_VALIDATION_FAILED' };
    }
    if (destination.status !== 'ACTIVE') {
      return { valid: false, error: 'Destination inactive', code: 'DESTINATION_UNAVAILABLE' };
    }
    const caps = JSON.parse(destination.capabilities || '[]') as string[];
    const needed = channel === 'FACEBOOK' ? 'publish_facebook_page_photo' : 'publish_image_feed';
    if (!caps.includes(needed)) {
      return { valid: false, error: 'Destination does not support this publish operation', code: 'VALIDATION_FAILED' };
    }
    return { valid: true };
  }

  async validatePublication(request: PublishRequest): Promise<DestinationValidationResult> {
    const destCheck = await this.validateDestination(request.destinationId, request.channel);
    if (!destCheck.valid) return destCheck;

    const kind = request.content.kind;
    if (kind === 'STORY' || kind === 'SHORT_VIDEO' || kind === 'CAROUSEL') {
      return {
        valid: false,
        error: `${kind} publishing is not supported in Phase 3J Meta integration`,
        code: 'VALIDATION_FAILED',
      };
    }
    if (kind !== 'STATIC_POST' && request.channel === 'INSTAGRAM') {
      return { valid: false, error: 'Only static image feed posts are supported for Instagram in Phase 3J', code: 'VALIDATION_FAILED' };
    }

    const imageAsset = request.mediaAssets.find((a) => a.mimeType?.startsWith('image/') || a.type === 'image');
    if (!imageAsset) {
      return { valid: false, error: 'Image asset required for Meta publishing', code: 'MEDIA_INVALID' };
    }
    const publicUrl = mediaDeliveryService.resolvePublicUrl(imageAsset, request.workspaceId);
    if (!publicUrl) {
      return { valid: false, error: 'Media must be accessible via hosted delivery URL', code: 'MEDIA_INVALID' };
    }

    return { valid: true };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const validation = await this.validatePublication(request);
    if (!validation.valid) {
      return {
        success: false,
        providerKey: this.providerKey,
        errorCode: validation.code ?? 'VALIDATION_FAILED',
        errorMessage: validation.error,
        errorCategory: mapErrorCategory(validation.code),
      };
    }

    const destination = db.prepare('SELECT * FROM publishing_destinations WHERE id = ?').get(request.destinationId) as DestinationRow;
    const connection = db.prepare('SELECT * FROM integration_connections WHERE id = ?').get(destination.connection_id) as ConnectionRow;
    if (!connection || connection.workspace_id !== request.workspaceId) {
      return { success: false, providerKey: this.providerKey, errorCode: 'CONNECTION_REQUIRED', errorMessage: 'Connection not found', errorCategory: 'DESTINATION_UNAVAILABLE' };
    }
    if (connection.status === 'REAUTH_REQUIRED' || connection.status === 'EXPIRED') {
      return { success: false, providerKey: this.providerKey, errorCode: 'AUTH_EXPIRED', errorMessage: 'Meta connection needs reauthorization', errorCategory: 'AUTH_EXPIRED' };
    }
    if (connection.expires_at && new Date(connection.expires_at).getTime() < Date.now()) {
      return { success: false, providerKey: this.providerKey, errorCode: 'AUTH_EXPIRED', errorMessage: 'Meta token expired', errorCategory: 'AUTH_EXPIRED' };
    }

    const imageAsset = request.mediaAssets.find((a) => a.mimeType?.startsWith('image/') || a.type === 'image')!;
    const imageUrl = mediaDeliveryService.resolvePublicUrl(imageAsset, request.workspaceId)!;

    try {
      const output = await metaGraphClient.publishImage({
        destinationExternalId: destination.external_destination_id,
        channel: request.channel as 'INSTAGRAM' | 'FACEBOOK',
        caption: extractCaption(request.content),
        imageUrl,
        idempotencyKey: request.idempotencyKey,
      });
      return {
        success: true,
        providerKey: this.providerKey,
        externalPublishId: output.externalPublishId,
        externalUrl: output.externalUrl,
        publishedAt: output.publishedAt,
      };
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'PUBLISH_FAILED';
      const message = (err as Error).message;
      if (code === 'UNKNOWN_RESULT') {
        return {
          success: false,
          providerKey: this.providerKey,
          errorCode: 'UNKNOWN_RESULT',
          errorMessage: message,
          errorCategory: 'UNKNOWN_RESULT',
          unknownOutcome: true,
        };
      }
      return {
        success: false,
        providerKey: this.providerKey,
        errorCode: code,
        errorMessage: message,
        errorCategory: mapErrorCategory(code),
      };
    }
  }

  async getPublicationStatus(externalPublishId: string, _workspaceId: string): Promise<{ status: string; externalUrl?: string }> {
    return { status: 'PUBLISHED' };
  }

  isMockMode(): boolean {
    return isMetaMockMode();
  }
}

export const metaPublishingProvider = new MetaPublishingProvider();
