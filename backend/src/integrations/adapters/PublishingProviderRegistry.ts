import type { MarketingChannel } from '../../types/channels';
import type { PublishingProvider } from '../../integrations/contracts/PublishingProvider';
import { mockPublishingAdapter } from '../../integrations/adapters/MockPublishingAdapter';

export class PublishingProviderRegistry {
  private static providers = new Map<string, PublishingProvider>();

  static register(provider: PublishingProvider): void {
    this.providers.set(provider.providerKey, provider);
  }

  static get(providerKey: string): PublishingProvider | null {
    return this.providers.get(providerKey) ?? null;
  }

  static findForChannel(channel: MarketingChannel): PublishingProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.supports(channel)) return provider;
    }
    return null;
  }

  static list(): PublishingProvider[] {
    return [...this.providers.values()];
  }

  static resetForTests(): void {
    this.providers.clear();
    this.register(mockPublishingAdapter);
  }
}

PublishingProviderRegistry.register(mockPublishingAdapter);
