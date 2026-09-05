import type { CampaignPlan } from './CampaignPlannerService';
import type { ChannelCapability } from '../../types/channels';
import type { CampaignContext } from './CampaignContextBuilder';
import { campaignContextBuilder } from './CampaignContextBuilder';
import { listChannelCapabilities } from '../channels/ChannelCapabilityRegistry';

export interface ApprovedPlanSlice {
  id: string;
  version: number;
  strategy: CampaignPlan['strategy'];
  hooks: CampaignPlan['hooks'];
  proofPoints: string[];
  callToAction: CampaignPlan['callToAction'];
  channels: CampaignPlan['channels'];
  contentMix: CampaignPlan['contentMix'];
  cadence: CampaignPlan['cadence'];
  creativeDirection: CampaignPlan['creativeDirection'];
  measurement: CampaignPlan['measurement'];
}

export interface ContentPlanningContext {
  campaignContext: CampaignContext;
  approvedPlan: ApprovedPlanSlice;
  capabilities: ChannelCapability[];
}

export class ContentPlanningContextBuilder {
  async build(campaignId: string, approvedPlan: CampaignPlan): Promise<ContentPlanningContext | null> {
    const campaignContext = await campaignContextBuilder.build(campaignId);
    if (!campaignContext) return null;

    return {
      campaignContext,
      approvedPlan: {
        id: approvedPlan.id,
        version: approvedPlan.version,
        strategy: approvedPlan.strategy,
        hooks: approvedPlan.hooks,
        proofPoints: approvedPlan.proofPoints,
        callToAction: approvedPlan.callToAction,
        channels: approvedPlan.channels,
        contentMix: approvedPlan.contentMix,
        cadence: approvedPlan.cadence,
        creativeDirection: approvedPlan.creativeDirection,
        measurement: approvedPlan.measurement,
      },
      capabilities: listChannelCapabilities(),
    };
  }
}

export const contentPlanningContextBuilder = new ContentPlanningContextBuilder();
