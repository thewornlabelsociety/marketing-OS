export interface AdCampaignPayload {
  name: string;
  objective: string;
  budgetCents: number;
  startDate: string;
  endDate: string | null;
  targetAudience: Record<string, unknown>;
  creatives: AdCreative[];
}

export interface AdCreative {
  headline: string;
  body: string;
  assetUrl: string;
  callToAction: string;
  destinationUrl: string;
}

export interface AdCampaignResult {
  externalCampaignId: string;
  externalAdSetId: string;
  status: string;
}

// Anything involving paid ad spend requires explicit approval
export interface AdvertisingProvider {
  readonly provider: string;
  createCampaign(payload: AdCampaignPayload): Promise<AdCampaignResult>;
  pauseCampaign(externalCampaignId: string): Promise<void>;
  getSpend(externalCampaignId: string): Promise<number>;
}
