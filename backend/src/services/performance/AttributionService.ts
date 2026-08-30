import type { AttributionResult } from '../../types/performance';

export class AttributionService {
  static buildAttribution(input: {
    model: AttributionResult['model'];
    campaignId?: string;
    contentKey?: string;
    scheduleId?: string;
    evidence?: string[];
  }): AttributionResult {
    const confidenceMap: Record<AttributionResult['model'], AttributionResult['confidence']> = {
      DIRECT: 'HIGH',
      TRACKED_LINK: 'HIGH',
      PROMO_CODE: 'MEDIUM',
      PROVIDER_REPORTED: 'MEDIUM',
      MANUAL: 'MEDIUM',
      UNATTRIBUTED: 'UNKNOWN',
    };

    return {
      model: input.model,
      campaignId: input.campaignId,
      contentKey: input.contentKey,
      scheduleId: input.scheduleId,
      confidence: confidenceMap[input.model],
      evidence: input.evidence,
    };
  }
}
