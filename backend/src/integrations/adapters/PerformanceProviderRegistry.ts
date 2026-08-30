import type { MarketingChannel } from '../../types/channels';
import type { PerformanceProvider } from '../../integrations/contracts/PerformanceProvider';
import { mockPerformanceProvider } from './MockPerformanceProvider';

export class PerformanceProviderRegistry {
  private static providers = new Map<string, PerformanceProvider>();

  static register(provider: PerformanceProvider): void {
    this.providers.set(provider.providerKey, provider);
  }

  static get(providerKey: string): PerformanceProvider | null {
    return this.providers.get(providerKey) ?? null;
  }

  static findForChannel(channel: MarketingChannel): PerformanceProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.supports(channel)) return provider;
    }
    return null;
  }

  static list(): PerformanceProvider[] {
    return [...this.providers.values()];
  }

  static clearForTests(): void {
    this.providers.clear();
  }

  static resetForTests(): void {
    this.providers.clear();
    this.register(mockPerformanceProvider);
  }
}

PerformanceProviderRegistry.register(mockPerformanceProvider);
