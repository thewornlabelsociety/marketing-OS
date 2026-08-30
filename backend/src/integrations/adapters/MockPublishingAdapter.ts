import type { MarketingChannel } from '../../types/channels';
import type { DestinationValidationResult, PublishRequest, PublishResult } from '../../types/publishing';
import type { PublishingProvider } from '../contracts/PublishingProvider';

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
    return { valid: true };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    mockPublishCallLog.push(request);
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
