import type { AIProvider } from '../../integrations/contracts/AIProvider';

/** Deterministic content-plan JSON for PG-4B verification — not live AI output. */
export const MOCK_CONTENT_PLAN_JSON = JSON.stringify({
  summary: {
    campaignNarrative: 'PG-4B verification narrative',
    customerJourney: 'Awareness → Consideration → Conversion',
    contentStrategy: 'One core concept adapted across channels',
  },
  cadence: {
    phases: [
      { key: 'introduce', name: 'Introduce', order: 1, purpose: 'Name the problem' },
      { key: 'prove', name: 'Prove', order: 2, purpose: 'Show proof' },
    ],
  },
  concepts: [
    {
      contentKey: 'product-proof',
      name: 'Product Proof',
      strategicPurpose: 'Demonstrate product value',
      coreMessage: 'The product solves the problem.',
      proofPoints: ['Works in real use'],
      sequenceRole: 'Prove',
    },
  ],
  deliverables: [
    {
      contentKey: 'launch-carousel-01',
      title: 'Launch Carousel',
      purpose: 'Structured proof',
      campaignRole: 'Consideration',
      channel: 'INSTAGRAM',
      contentType: 'CAROUSEL',
      format: 'PORTRAIT_4_5',
      deviceTargets: ['mobile'],
      objectiveRole: 'Build belief',
      primaryMessage: 'Proof message',
      supportingMessages: [],
      creativeDirection: 'Portrait carousel',
      assetRequirements: [{ type: 'PRODUCT_PHOTO', description: 'photos', required: true, quantity: 2 }],
      sourceConceptId: 'product-proof',
      sequence: 1,
    },
  ],
});

export const MOCK_CONTENT_PLAN_REVISION_JSON = JSON.stringify({
  summary: {
    campaignNarrative: 'PG-4B revised narrative',
    customerJourney: 'Awareness → Consideration → Conversion',
    contentStrategy: 'Revised strategy without TikTok',
  },
  cadence: {
    phases: [
      { key: 'introduce', name: 'Introduce', order: 1, purpose: 'Name the problem' },
      { key: 'prove', name: 'Prove', order: 2, purpose: 'Show proof' },
    ],
  },
  concepts: [
    {
      contentKey: 'product-proof',
      name: 'Product Proof',
      strategicPurpose: 'Demonstrate product value',
      coreMessage: 'The product solves the problem.',
      proofPoints: ['Works in real use'],
      sequenceRole: 'Prove',
    },
  ],
  deliverables: [
    {
      contentKey: 'launch-carousel-01',
      title: 'Launch Carousel',
      purpose: 'Structured proof',
      campaignRole: 'Consideration',
      channel: 'INSTAGRAM',
      contentType: 'CAROUSEL',
      format: 'PORTRAIT_4_5',
      deviceTargets: ['mobile'],
      objectiveRole: 'Build belief',
      primaryMessage: 'Proof message',
      supportingMessages: [],
      creativeDirection: 'Portrait carousel',
      assetRequirements: [{ type: 'PRODUCT_PHOTO', description: 'photos', required: true, quantity: 2 }],
      sourceConceptId: 'product-proof',
      sequence: 1,
    },
    {
      contentKey: 'launch-reel-01',
      title: 'Launch Reel',
      purpose: 'Motion proof',
      campaignRole: 'Awareness',
      channel: 'INSTAGRAM',
      contentType: 'SHORT_VIDEO',
      format: 'VERTICAL_9_16',
      deviceTargets: ['mobile'],
      objectiveRole: 'Create memorable proof',
      primaryMessage: 'Watch it work',
      supportingMessages: [],
      creativeDirection: 'Vertical reel',
      assetRequirements: [{ type: 'VIDEO', description: 'clip', required: true, quantity: 1 }],
      sourceConceptId: 'product-proof',
      sequence: 2,
    },
  ],
});

export class MockContentPlanAIProvider implements AIProvider {
  constructor(private readonly mode: 'success' | 'revision' | 'fail' = 'success') {}

  async generateStructured(): Promise<string> {
    if (this.mode === 'fail') {
      throw new Error('PG-4B mock AI failure');
    }
    return this.mode === 'revision' ? MOCK_CONTENT_PLAN_REVISION_JSON : MOCK_CONTENT_PLAN_JSON;
  }

  async generateTracked() {
    const content = await this.generateStructured();
    return {
      content,
      usage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
    };
  }
}

export function createMockContentPlanAIProvider(mode: 'success' | 'revision' | 'fail' = 'success'): AIProvider {
  return new MockContentPlanAIProvider(mode);
}
