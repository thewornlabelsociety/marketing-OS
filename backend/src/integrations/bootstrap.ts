import { PublishingProviderRegistry } from './adapters/PublishingProviderRegistry';
import { PerformanceProviderRegistry } from './adapters/PerformanceProviderRegistry';
import { metaPublishingProvider } from './meta/MetaPublishingProvider';
import { metaPerformanceProvider } from './meta/MetaPerformanceProvider';

PublishingProviderRegistry.register(metaPublishingProvider);
PerformanceProviderRegistry.register(metaPerformanceProvider);
