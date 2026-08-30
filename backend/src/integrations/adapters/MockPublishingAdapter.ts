import axios from 'axios';
import type { MarketingChannel } from '../../types/channels';
import type { DestinationValidationResult, PublishRequest, PublishResult } from '../../types/publishing';
import type { PublishingProvider } from '../contracts/PublishingProvider';
import { mediaDeliveryService } from '../../services/media/MediaDeliveryService';

export const mockPublishCallLog: PublishRequest[] = [];
export let mockPublishShouldFail = false;
export let mockPublishFailureMessage = 'Mock provider failure';

export function resetMockPublishingState(): void {
  mockPublishCallLog.length = 0;
  mockPublishShouldFail = false;
  mockPublishFailureMessage = 'Mock provider failure';
}

/** DETERMINISTIC_TEST_ADAPTER — local verification only. */
export class MockPublishingAdapter implements PublishingProvider {
  readonly providerKey = 'mock';

  supports(channel: MarketingChannel): boolean {
    return ['INSTAGRAM', 'EMAIL', 'FACEBOOK', 'LINKEDIN', 'TIKTOK'].includes(channel);
  }

  async validateDestination(destinationId: string, channel: MarketingChannel): Promise<DestinationValidationResult> {
    if (!destinationId.startsWith('dest_')) {
      return { valid: false, error: 'Invalid destination', code: 'DESTINATION_REQUIRED' };
    }
    if (destinationId.includes('email') && channel !== 'EMAIL') {
      return { valid: false, error: 'Destination incompatible with channel', code: 'PUBLISH_VALIDATION_FAILED' };
    }
    if (destinationId.includes('instagram') && channel !== 'INSTAGRAM') {
      return { valid: false, error: 'Destination incompatible with channel', code: 'PUBLISH_VALIDATION_FAILED' };
    }
    if (destinationId.includes('facebook') && channel !== 'FACEBOOK') {
      return { valid: false, error: 'Destination incompatible with channel', code: 'PUBLISH_VALIDATION_FAILED' };
    }
    return { valid: true };
  }

  async validatePublication(request: PublishRequest): Promise<DestinationValidationResult> {
    const dest = await this.validateDestination(request.destinationId, request.channel);
    if (!dest.valid) return dest;
    // Image requirement and URL validation apply only to image-first channels.
    const imageFirstChannels = ['INSTAGRAM', 'FACEBOOK'];
    if (imageFirstChannels.includes(request.channel)) {
      const imageAsset = request.mediaAssets.find((a) => a.mimeType?.startsWith('image/') || a.type?.toUpperCase() === 'IMAGE');
      if (!imageAsset) {
        return { valid: false, error: 'Image asset required', code: 'MEDIA_INVALID' };
      }
      const url = mediaDeliveryService.resolvePublicUrl(imageAsset, request.workspaceId);
      // Only validate URL if the asset is resolvable (canonical mass_ asset).
      // Non-canonical assets (pre-Phase 3K) have no hosted URL but are still accepted.
      if (url) {
        if (url.includes('\\') || /[a-z]:\\/i.test(url)) {
          return { valid: false, error: 'Local filesystem path in media URL', code: 'MEDIA_INVALID' };
        }
        try {
          const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
          if (!response.data || response.data.byteLength === 0) {
            return { valid: false, error: 'Hosted media returned empty body', code: 'MEDIA_INVALID' };
          }
        } catch {
          return { valid: false, error: 'Hosted media URL not retrievable', code: 'MEDIA_INVALID' };
        }
      }
    }
    return { valid: true };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    mockPublishCallLog.push(request);
    const validation = await this.validatePublication(request);
    if (!validation.valid) {
      return {
        success: false,
        providerKey: this.providerKey,
        errorCode: validation.code ?? 'MEDIA_INVALID',
        errorMessage: validation.error,
      };
    }
    if (mockPublishShouldFail) {
      return {
        success: false,
        providerKey: this.providerKey,
        errorCode: 'PUBLISH_FAILED',
        errorMessage: mockPublishFailureMessage,
      };
    }
    return {
      success: true,
      providerKey: this.providerKey,
      externalPublishId: `mock_${request.scheduleId}`,
      externalUrl: `https://mock.example/p/${request.scheduleId}`,
      publishedAt: new Date().toISOString(),
    };
  }
}

export const mockPublishingAdapter = new MockPublishingAdapter();
