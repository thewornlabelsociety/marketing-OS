import type { CampaignContext } from '../campaigns/CampaignContextBuilder';
import type { CampaignPlan } from '../campaigns/CampaignPlannerService';
import type { ContentConcept, ContentDeliverable, ContentPlan } from '../../types/contentPlan';
import type { ChannelCapability } from '../../types/channels';
import { campaignContextBuilder } from '../campaigns/CampaignContextBuilder';
import { campaignPlannerService } from '../campaigns/CampaignPlannerService';
import { contentPlannerService } from '../campaigns/ContentPlannerService';
import { getChannelCapability } from '../channels/ChannelCapabilityRegistry';

export interface CreativeGenerationContext {
  campaignContext: CampaignContext;
  approvedCampaignPlan: CampaignPlan;
  approvedContentPlan: ContentPlan;
  deliverable: ContentDeliverable;
  sourceConcept: ContentConcept | null;
  channelCapability: ChannelCapability;
  userPreferences: string[];
  marketLearnings: string[];
}

export class CreativeGenerationContextBuilder {
  build(campaignId: string, contentKey: string): CreativeGenerationContext | { error: string; code: string } {
    const contentPlanResult = contentPlannerService.resolveApprovedContentPlan(campaignId);
    if ('error' in contentPlanResult) {
      return { error: contentPlanResult.error, code: contentPlanResult.code };
    }

    const approvedContentPlan = contentPlanResult.plan;
    const deliverable = approvedContentPlan.deliverables.find((d) => d.contentKey === contentKey);
    if (!deliverable) {
      return { error: `Deliverable ${contentKey} is not in the approved Content Plan.`, code: 'INVALID_CONTENT_KEY' };
    }

    const campaignContext = campaignContextBuilder.build(campaignId);
    if (!campaignContext) {
      return { error: 'Campaign not found', code: 'NOT_FOUND' };
    }

    const approvedCampaignPlan = campaignPlannerService.getApprovedPlan(campaignId);
    if (!approvedCampaignPlan) {
      return { error: 'Approved campaign strategy not found', code: 'STRATEGY_NOT_APPROVED' };
    }

    const sourceConcept = approvedContentPlan.concepts.find(
      (c) => c.id === deliverable.sourceConceptId || c.contentKey === deliverable.sourceConceptId,
    ) ?? null;

    return {
      campaignContext,
      approvedCampaignPlan,
      approvedContentPlan,
      deliverable,
      sourceConcept,
      channelCapability: getChannelCapability(deliverable.channel),
      userPreferences: campaignContext.learnings.userPreferences,
      marketLearnings: campaignContext.learnings.marketPerformance,
    };
  }
}

export const creativeGenerationContextBuilder = new CreativeGenerationContextBuilder();
