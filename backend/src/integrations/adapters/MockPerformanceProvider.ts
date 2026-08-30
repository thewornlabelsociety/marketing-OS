import type { MarketingChannel } from '../../types/channels';
import type {
  FetchPerformanceRequest,
  PerformanceProvider,
  ProviderPerformanceResult,
} from '../../integrations/contracts/PerformanceProvider';

export const mockPerformanceData = new Map<string, ProviderPerformanceResult>();

export class MockPerformanceProvider implements PerformanceProvider {
  providerKey = 'mock';

  supports(_channel: MarketingChannel): boolean {
    return true;
  }

  async fetchPerformance(request: FetchPerformanceRequest): Promise<ProviderPerformanceResult> {
    const key = `${request.workspaceId}:${request.campaignId}`;
    return mockPerformanceData.get(key) ?? { providerKey: this.providerKey, items: [] };
  }
}

export const mockPerformanceProvider = new MockPerformanceProvider();

export function resetMockPerformanceState(): void {
  mockPerformanceData.clear();
}

export function setMockPerformanceData(
  workspaceId: string,
  campaignId: string,
  result: ProviderPerformanceResult
): void {
  mockPerformanceData.set(`${workspaceId}:${campaignId}`, result);
}
