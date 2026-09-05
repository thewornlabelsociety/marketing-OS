import type { AIProvider } from '../../integrations/contracts/AIProvider';

export const MOCK_PLAN_JSON = JSON.stringify({
  strategy: {
    campaignAngle: 'PG-3B verification angle',
    coreMessage: 'Core verification message',
    proposition: 'Verification proposition',
    audienceFocus: 'Verification audience',
  },
  hooks: { primary: 'Primary hook', supporting: ['Supporting hook'] },
  proofPoints: ['Proof point one'],
  callToAction: { primary: 'Shop now', alternatives: ['Learn more'] },
  channels: [{ channel: 'instagram_feed', role: 'primary', rationale: 'Reach target audience' }],
  contentMix: [{
    contentType: 'carousel',
    channel: 'instagram_feed',
    format: '4:5',
    quantity: 1,
    purpose: 'Drive awareness',
  }],
  cadence: { summary: 'Three posts per week', duration: '2 weeks' },
  creativeDirection: {
    visualDirection: 'Bold and clean',
    photographyDirection: null,
    videoDirection: null,
    copyDirection: 'Direct and confident',
  },
  measurement: {
    objective: 'Drive conversions',
    primaryKpi: 'conversions',
    supportingKpis: ['clicks'],
    conversionEvent: null,
  },
  rationale: { summary: 'Deterministic PG-3B mock plan' },
});

export class MockAIProvider implements AIProvider {
  constructor(private readonly mode: 'success' | 'fail' = 'success') {}

  async generateStructured(): Promise<string> {
    if (this.mode === 'fail') {
      throw new Error('PG-3B mock AI failure');
    }
    return MOCK_PLAN_JSON;
  }

  async generateTracked() {
    const content = await this.generateStructured();
    return {
      content,
      usage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
    };
  }
}

export function createMockAIProvider(mode: 'success' | 'fail' = 'success'): AIProvider {
  return new MockAIProvider(mode);
}
