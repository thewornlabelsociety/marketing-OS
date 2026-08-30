import type { MarketingChannel } from '../../types/channels';
import type { DestinationValidationResult, PublishRequest, PublishResult } from '../../types/publishing';

export interface PublishingProvider {
  readonly providerKey: string;
  supports(channel: MarketingChannel): boolean;
  validateDestination(destinationId: string, channel: MarketingChannel): Promise<DestinationValidationResult>;
  publish(request: PublishRequest): Promise<PublishResult>;
  getStatus?(externalPublishId: string): Promise<string>;
}
