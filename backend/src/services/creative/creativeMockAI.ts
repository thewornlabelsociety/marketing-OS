import type { AIProvider } from '../../integrations/contracts/AIProvider';

const MOCK_CAROUSEL_JSON = JSON.stringify({
  kind: 'CAROUSEL',
  caption: 'Mock creative caption for verification testing.',
  slides: [
    { slideNumber: 1, headline: 'Test Slide 1', body: 'First slide body copy.' },
    { slideNumber: 2, headline: 'Test Slide 2', body: 'Second slide body copy.' },
  ],
  cta: 'Learn More',
});

export type MockCreativeAIMode = 'success' | 'fail';

export class MockCreativeAIProvider implements AIProvider {
  constructor(private readonly mode: MockCreativeAIMode = 'success') {}

  async generateStructured(_options: Parameters<AIProvider['generateStructured']>[0]): Promise<string> {
    if (this.mode === 'fail') {
      throw new Error('MockCreativeAIProvider: injected failure');
    }
    return MOCK_CAROUSEL_JSON;
  }

  async generateTracked(_options: Parameters<AIProvider['generateTracked']>[0]): Promise<import('../../types/marketing').AIGenerationResult> {
    if (this.mode === 'fail') {
      throw new Error('MockCreativeAIProvider: injected failure');
    }
    return { content: MOCK_CAROUSEL_JSON, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }
}

export function createMockCreativeAIProvider(mode: MockCreativeAIMode = 'success'): MockCreativeAIProvider {
  return new MockCreativeAIProvider(mode);
}
