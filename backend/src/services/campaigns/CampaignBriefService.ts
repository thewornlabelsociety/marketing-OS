import { randomUUID } from 'crypto';
import type {
  AssembledBrief,
  BriefPatchFields,
  BriefCompletenessStatus,
} from '../../db/core/planningDomainTypes';
export type { AssembledBrief, BriefPatchFields, BriefCompletenessStatus };
import {
  getCoreRepositories,
} from '../../db/core/createCoreRepositories';
import type { CoreDomainRepositories } from '../../db/core/coreDomainTypes';

/**
 * Deterministic completeness check.
 * Does NOT call AI — checks whether materially important facts are missing.
 */
function checkCompleteness(
  sourceType: string,
  brief: Omit<AssembledBrief, 'id' | 'campaignId' | 'workspaceId' | 'completenessStatus' | 'completenessMissingFields' | 'createdAt' | 'updatedAt'>,
): { status: BriefCompletenessStatus; missingFields: string[] } {
  const missing: string[] = [];

  if (sourceType === 'EVENT' && !brief.timingStartDate) {
    missing.push('Event date');
  }

  if (sourceType === 'OFFER' && !brief.offerDescription) {
    missing.push('Offer details');
  }

  if (sourceType === 'ANNOUNCEMENT' && !brief.sourceSummary && !brief.additionalContext) {
    missing.push('Announcement details');
  }

  return {
    status: missing.length === 0 ? 'COMPLETE' : 'NEEDS_INPUT',
    missingFields: missing,
  };
}

export class CampaignBriefService {
  constructor(
    private readonly reposFactory: () => CoreDomainRepositories = getCoreRepositories,
  ) {}

  private get repos() {
    return this.reposFactory();
  }

  /**
   * Assemble (or re-assemble) the brief for a campaign from existing workspace/campaign/objective data.
   * Creates the brief row if it doesn't exist; updates if it does.
   * Does NOT ask the user for information — infers everything possible from stored data.
   */
  async assemble(campaignId: string): Promise<AssembledBrief | null> {
    const campaign = await this.repos.campaign.findById(campaignId);
    if (!campaign) return null;

    const objective = await this.repos.objective.findById(campaign.objective_id);
    if (!objective) return null;

    const entity = await this.repos.workspace.findById(campaign.workspace_id);
    if (!entity) return null;

    let brandKit: Record<string, unknown> = {};
    try { brandKit = JSON.parse(entity.brand_kit) as Record<string, unknown>; } catch { /* empty */ }
    const bb = (brandKit.brandBrain ?? {}) as Record<string, unknown>;
    const bbAudience = (bb.audience ?? {}) as Record<string, unknown>;
    const bbPersonality = (bb.personality ?? {}) as Record<string, unknown>;

    const existing = await this.repos.planning.brief.findByCampaignId(campaignId);

    const sourceSummary = [
      campaign.source_title,
      campaign.source_description,
    ].filter(Boolean).join(' — ') || null;

    const objectiveSummary = [
      objective.name,
      objective.description,
      `Primary KPI: ${objective.primary_kpi}`,
    ].filter(Boolean).join('. ') || null;

    const audienceDescription = existing?.audienceDescription ??
      ((bbAudience.primaryAudience as string | undefined) ?? null);
    const audienceProblem = existing?.audienceProblem ??
      ((bbAudience.problems as string[] | undefined)?.[0] ?? null);
    const audienceDesire = existing?.audienceDesire ??
      ((bbAudience.desires as string[] | undefined)?.[0] ?? null);
    const audienceSegment = existing?.audienceSegment ?? null;

    const timingStartDate = existing?.timingStartDate ?? null;
    const timingEndDate = existing?.timingEndDate ?? null;
    const timingImportantDates = existing?.timingImportantDates ?? [];

    const offerDescription = existing?.offerDescription ?? null;
    const offerValue = existing?.offerValue ?? null;
    const offerUrgency = existing?.offerUrgency ?? null;
    const offerConstraints = existing?.offerConstraints ?? [];

    const keyDetails = existing?.keyDetails ?? [];
    const constraints = existing?.constraints ?? [];
    const additionalContext = existing?.additionalContext ?? null;
    const proposition = existing?.proposition ??
      ((bbPersonality.archetype as string | undefined) ? null : null);

    const briefData = {
      sourceSummary, objectiveSummary,
      audienceDescription, audienceSegment, audienceProblem, audienceDesire,
      proposition, keyDetails,
      offerDescription, offerValue, offerUrgency, offerConstraints,
      timingStartDate, timingEndDate, timingImportantDates,
      constraints, additionalContext,
    };
    const completeness = checkCompleteness(campaign.source_type, briefData);

    const now = new Date().toISOString();
    const upsertInput = {
      campaignId,
      workspaceId: campaign.workspace_id,
      sourceSummary, objectiveSummary,
      audienceDescription, audienceSegment, audienceProblem, audienceDesire,
      proposition, keyDetails,
      offerDescription, offerValue, offerUrgency, offerConstraints,
      timingStartDate, timingEndDate, timingImportantDates,
      constraints, additionalContext,
      completenessStatus: completeness.status,
      completenessMissingFields: completeness.missingFields,
      updatedAt: now,
    };

    if (existing) {
      return this.repos.planning.brief.updateByCampaignId(upsertInput);
    }

    return this.repos.planning.brief.insert({
      ...upsertInput,
      id: `brief_${randomUUID()}`,
      createdAt: now,
    });
  }

  async getForCampaign(campaignId: string): Promise<AssembledBrief | null> {
    return this.repos.planning.brief.findByCampaignId(campaignId);
  }

  /** Patch user-supplied fields (e.g. event date, offer details). Then re-runs completeness. */
  async patch(campaignId: string, fields: BriefPatchFields): Promise<AssembledBrief | null> {
    const existing = await this.repos.planning.brief.findByCampaignId(campaignId);

    if (!existing) {
      await this.assemble(campaignId);
      return this.patch(campaignId, fields);
    }

    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length === 0) return existing;

    const now = new Date().toISOString();
    await this.repos.planning.brief.patchFields(campaignId, fields, now);

    return this.assemble(campaignId);
  }
}

export const campaignBriefService = new CampaignBriefService();
