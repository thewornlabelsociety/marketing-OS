import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type { DestinationValidationResult, PublishRequest, PublishResult } from '../../types/publishing';
import type { PublishingProvider } from '../contracts/PublishingProvider';
import { mediaDeliveryService } from '../../services/media/MediaDeliveryService';
import { mediaValidationService } from '../../services/media/MediaValidationService';
import { metaGraphClient, isMetaMockMode } from './MetaGraphClient';
import { credentialVault } from '../../services/credentials/CredentialVault';

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
    case 'MEDIA_NOT_PUBLICLY_ACCESSIBLE': return 'MEDIA_INVALID';
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

function isImageAsset(asset: PublishRequest['mediaAssets'][number]): boolean {
  return asset.mimeType?.startsWith('image/') === true
    || asset.type?.toUpperCase() === 'IMAGE';
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

  private validateInstagramPublication(request: PublishRequest): DestinationValidationResult {
    const kind = request.content.kind;
    if (kind === 'STORY' || kind === 'SHORT_VIDEO' || kind === 'CAROUSEL' || kind === 'LONG_VIDEO') {
      return { valid: false, error: `${kind} publishing is not supported for Instagram`, code: 'VALIDATION_FAILED' };
    }
    if (kind !== 'STATIC_POST') {
      return { valid: false, error: 'Only static image feed posts are supported for Instagram', code: 'VALIDATION_FAILED' };
    }
    const imageAsset = request.mediaAssets.find(isImageAsset);
    if (!imageAsset) {
      return { valid: false, error: 'Image asset required for Instagram feed publishing', code: 'MEDIA_INVALID' };
    }
    return { valid: true };
  }

  private validateFacebookPublication(request: PublishRequest): DestinationValidationResult {
    const kind = request.content.kind;
    if (kind === 'STORY' || kind === 'SHORT_VIDEO' || kind === 'CAROUSEL' || kind === 'LONG_VIDEO') {
      return { valid: false, error: `${kind} publishing is not supported for Facebook Page photo posts`, code: 'VALIDATION_FAILED' };
    }
    const imageAsset = request.mediaAssets.find(isImageAsset);
    if (!imageAsset) {
      return { valid: false, error: 'Image asset required for Facebook Page photo publishing', code: 'MEDIA_INVALID' };
    }
    return { valid: true };
  }

  async validatePublication(request: PublishRequest): Promise<DestinationValidationResult> {
    const destCheck = await this.validateDestination(request.destinationId, request.channel);
    if (!destCheck.valid) return destCheck;

    const channelValidation = request.channel === 'FACEBOOK'
      ? this.validateFacebookPublication(request)
      : this.validateInstagramPublication(request);
    if (!channelValidation.valid) return channelValidation;

    const imageAsset = request.mediaAssets.find(isImageAsset)!;
    const publicCheck = mediaValidationService.validatePublicBaseUrl();
    if (!isMetaMockMode() && process.env.META_MOCK_MODE !== '1' && !publicCheck.valid) {
      return { valid: false, error: 'Media base URL is not publicly accessible', code: 'MEDIA_NOT_PUBLICLY_ACCESSIBLE' };
    }

    const publicUrl = mediaDeliveryService.resolvePublicUrl(imageAsset, request.workspaceId);
    if (!publicUrl) {
      return { valid: false, error: 'Media must be accessible via hosted delivery URL', code: 'MEDIA_INVALID' };
    }
    if (publicUrl.includes('\\') || /[a-z]:\\/i.test(publicUrl)) {
      return { valid: false, error: 'Media delivery URL must not expose local filesystem paths', code: 'MEDIA_INVALID' };
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

    // Credential resolution — skipped only in mock mode where no real token exists.
    // In production, the token MUST be resolved from the encrypted vault; there is no env-var fallback.
    let accessToken = '';
    if (!isMetaMockMode()) {
      if (!connection.access_credential_ref) {
        return {
          success: false,
          providerKey: this.providerKey,
          errorCode: 'CREDENTIAL_UNAVAILABLE',
          errorMessage: 'No credential stored for this Meta connection',
          errorCategory: 'DESTINATION_UNAVAILABLE',
        };
      }
      const resolved = credentialVault.read(connection.access_credential_ref, request.workspaceId);
      if (!resolved) {
        return {
          success: false,
          providerKey: this.providerKey,
          errorCode: 'CREDENTIAL_UNAVAILABLE',
          errorMessage: 'Credential could not be resolved for this workspace',
          errorCategory: 'DESTINATION_UNAVAILABLE',
        };
      }
      accessToken = resolved;
    }

    const imageAsset = request.mediaAssets.find(isImageAsset)!;
    const imageUrl = mediaDeliveryService.resolvePublicUrl(imageAsset, request.workspaceId)!;

    try {
      const output = await metaGraphClient.publishImage({
        destinationExternalId: destination.external_destination_id,
        channel: request.channel as 'INSTAGRAM' | 'FACEBOOK',
        caption: extractCaption(request.content),
        imageUrl,
        idempotencyKey: request.idempotencyKey,
        accessToken,
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
      const mediaFetch = /media|image|url|download|curl/i.test(message);
      return {
        success: false,
        providerKey: this.providerKey,
        errorCode: mediaFetch ? 'MEDIA_INVALID' : code,
        errorMessage: message,
        errorCategory: mapErrorCategory(mediaFetch ? 'MEDIA_INVALID' : code),
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
