// IntegrationRegistry holds the registered provider adapters for each category.
// Provider-specific logic belongs in the adapter, never in core services.
export class IntegrationRegistry {
  private static readonly publishers = new Map<string, unknown>();
  private static readonly advertisers = new Map<string, unknown>();
  private static readonly analytics = new Map<string, unknown>();

  static register(category: string, provider: string, adapter: unknown): void {
    if (category === 'PUBLISHING') this.publishers.set(provider, adapter);
    else if (category === 'ADVERTISING') this.advertisers.set(provider, adapter);
    else if (category === 'ANALYTICS') this.analytics.set(provider, adapter);
  }
}
