import { db } from '../../db/database';
import { learningService } from '../performance/LearningService';
import { blueprintService } from '../library/BlueprintService';
import type { CampaignRow, EntityRow, ObjectiveRow } from '../../types';

export interface CampaignContext {
  workspace: {
    id: string;
    name: string;
  };
  brand: {
    identity: {
      name?: string;
      description?: string;
      website?: string;
      market?: string;
    };
    audience: {
      primaryAudience?: string;
      needs?: string[];
      problems?: string[];
      desires?: string[];
    };
    personality: {
      archetype?: string;
      traits?: string[];
      principles?: string[];
      tone?: {
        warmToCool?: number;
        playfulToSerious?: number;
        boldToRestrained?: number;
        conversationalToFormal?: number;
      };
    };
    language: {
      preferredWords?: string[];
      bannedWords?: string[];
      preferredPhrases?: string[];
      bannedPhrases?: string[];
      ctaStyle?: string;
      exampleCopy?: string;
    };
    visual: {
      palette?: string[];
      fonts?: string[];
      visualStyleNotes?: string;
      imageStyleNotes?: string;
    };
    marketing: {
      defaultChannels?: string[];
      contentPillars?: string[];
      primaryGoals?: string[];
    };
  };
  campaign: {
    id: string;
    name: string;
    sourceType: string;
    sourceTitle: string;
    sourceDescription: string | null;
  };
  objective: {
    id: string;
    name: string;
    objectiveType: string;
    description: string | null;
    primaryKpi: string;
    supportingKpis: string[];
    conversionEvent: string | null;
    successCriteria: string | null;
  };
  brief: {
    sourceSummary: string | null;
    objectiveSummary: string | null;
    audienceDescription: string | null;
    audienceProblem: string | null;
    audienceDesire: string | null;
    proposition: string | null;
    keyDetails: string[];
    offerDescription: string | null;
    offerValue: string | null;
    offerUrgency: string | null;
    timingStartDate: string | null;
    timingEndDate: string | null;
    timingImportantDates: string[];
    constraints: string[];
    additionalContext: string | null;
  } | null;
  learnings: {
    marketPerformance: string[];
    userPreferences: string[];
  };
  blueprint?: {
    id: string;
    version: number;
    name: string;
    strategicPattern: Record<string, unknown>;
    contentPattern: unknown[];
    channelPattern: string[];
    cadencePattern?: string;
    evidenceSummary: Record<string, unknown>;
    learnedWhy: string[];
  };
}

interface BriefRow {
  source_summary: string | null;
  objective_summary: string | null;
  audience_description: string | null;
  audience_problem: string | null;
  audience_desire: string | null;
  proposition: string | null;
  key_details: string;
  offer_description: string | null;
  offer_value: string | null;
  offer_urgency: string | null;
  timing_start_date: string | null;
  timing_end_date: string | null;
  timing_important_dates: string;
  constraints: string;
  additional_context: string | null;
}

/**
 * CampaignContextBuilder assembles a clean planning object from database records.
 * CampaignPlannerService must use this — it must not query arbitrary tables itself.
 */
export class CampaignContextBuilder {
  build(campaignId: string): CampaignContext | null {
    const campaign = db
      .prepare('SELECT * FROM campaigns WHERE id = ?')
      .get(campaignId) as CampaignRow | undefined;

    if (!campaign) return null;

    const entity = db
      .prepare('SELECT * FROM entities WHERE id = ?')
      .get(campaign.workspace_id) as EntityRow | undefined;

    if (!entity) return null;

    const objective = db
      .prepare('SELECT * FROM objectives WHERE id = ?')
      .get(campaign.objective_id) as ObjectiveRow | undefined;

    if (!objective) return null;

    // Parse brand brain from entity's brand_kit
    let brandKit: Record<string, unknown> = {};
    try { brandKit = JSON.parse(entity.brand_kit) as Record<string, unknown>; } catch { /* empty */ }
    const bb = (brandKit.brandBrain ?? {}) as Record<string, unknown>;

    const identity   = (bb.identity   ?? {}) as Record<string, unknown>;
    const audience   = (bb.audience   ?? {}) as Record<string, unknown>;
    const personality = (bb.personality ?? {}) as Record<string, unknown>;
    const language   = (bb.language   ?? {}) as Record<string, unknown>;
    const visual     = (bb.visual     ?? {}) as Record<string, unknown>;
    const marketing  = (bb.marketing  ?? {}) as Record<string, unknown>;
    const channels = JSON.parse(campaign.channels || '[]') as string[];
    const activeLearnings = learningService.getActiveForContext(entity.id, {
      objectiveType: objective.objective_type,
      channels,
    });

    // Load brief if exists
    const briefRow = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow | undefined;

    const brief: CampaignContext['brief'] = briefRow
      ? {
          sourceSummary: briefRow.source_summary,
          objectiveSummary: briefRow.objective_summary,
          audienceDescription: briefRow.audience_description,
          audienceProblem: briefRow.audience_problem,
          audienceDesire: briefRow.audience_desire,
          proposition: briefRow.proposition,
          keyDetails: JSON.parse(briefRow.key_details || '[]') as string[],
          offerDescription: briefRow.offer_description,
          offerValue: briefRow.offer_value,
          offerUrgency: briefRow.offer_urgency,
          timingStartDate: briefRow.timing_start_date,
          timingEndDate: briefRow.timing_end_date,
          timingImportantDates: JSON.parse(briefRow.timing_important_dates || '[]') as string[],
          constraints: JSON.parse(briefRow.constraints || '[]') as string[],
          additionalContext: briefRow.additional_context,
        }
      : null;

    let blueprint: CampaignContext['blueprint'];
    try {
      const meta = JSON.parse(campaign.source_metadata || '{}') as { blueprintContext?: CampaignContext['blueprint'] };
      if (meta.blueprintContext) blueprint = meta.blueprintContext;
    } catch { /* ignore */ }

    if (!blueprint && (campaign as CampaignRow & { source_blueprint_id?: string }).source_blueprint_id) {
      const bpId = (campaign as CampaignRow & { source_blueprint_id?: string; source_blueprint_version?: number }).source_blueprint_id!;
      const bpVer = (campaign as CampaignRow & { source_blueprint_version?: number }).source_blueprint_version;
      const loaded = blueprintService.get(bpId, entity.id, bpVer);
      if (loaded && !('error' in loaded)) {
        blueprint = {
          id: loaded.id,
          version: bpVer ?? loaded.currentVersion,
          name: loaded.name,
          strategicPattern: loaded.strategicPattern as Record<string, unknown>,
          contentPattern: loaded.contentPattern,
          channelPattern: loaded.channelPattern,
          cadencePattern: loaded.cadencePattern,
          evidenceSummary: loaded.evidenceSummary as unknown as Record<string, unknown>,
          learnedWhy: loaded.learnedWhy,
        };
      }
    }

    return {
      workspace: {
        id: entity.id,
        name: entity.name,
      },
      brand: {
        identity: {
          name:        (identity.name        as string | undefined),
          description: (identity.description as string | undefined),
          website:     (identity.website     as string | undefined),
          market:      (identity.market      as string | undefined),
        },
        audience: {
          primaryAudience: (audience.primaryAudience as string | undefined),
          needs:           (audience.needs           as string[] | undefined),
          problems:        (audience.problems        as string[] | undefined),
          desires:         (audience.desires         as string[] | undefined),
        },
        personality: {
          archetype:   (personality.archetype   as string | undefined),
          traits:      (personality.traits      as string[] | undefined),
          principles:  (personality.principles  as string[] | undefined),
          tone:        (personality.tone        as CampaignContext['brand']['personality']['tone']),
        },
        language: {
          preferredWords:   (language.preferredWords   as string[] | undefined),
          bannedWords:      (language.bannedWords      as string[] | undefined),
          preferredPhrases: (language.preferredPhrases as string[] | undefined),
          bannedPhrases:    (language.bannedPhrases    as string[] | undefined),
          ctaStyle:         (language.ctaStyle         as string | undefined),
          exampleCopy:      (language.exampleCopy      as string | undefined),
        },
        visual: {
          palette:          (visual.palette          as string[] | undefined),
          fonts:            (visual.fonts            as string[] | undefined),
          visualStyleNotes: (visual.visualStyleNotes as string | undefined),
          imageStyleNotes:  (visual.imageStyleNotes  as string | undefined),
        },
        marketing: {
          defaultChannels: (marketing.defaultChannels as string[] | undefined),
          contentPillars:  (marketing.contentPillars  as string[] | undefined),
          primaryGoals:    (marketing.primaryGoals    as string[] | undefined),
        },
      },
      campaign: {
        id:                campaign.id,
        name:              campaign.name,
        sourceType:        campaign.source_type,
        sourceTitle:       campaign.source_title,
        sourceDescription: campaign.source_description ?? null,
      },
      objective: {
        id:              objective.id,
        name:            objective.name,
        objectiveType:   objective.objective_type,
        description:     objective.description ?? null,
        primaryKpi:      objective.primary_kpi,
        supportingKpis:  JSON.parse(objective.supporting_kpis || '[]') as string[],
        conversionEvent: objective.conversion_event ?? null,
        successCriteria: objective.success_criteria ?? null,
      },
      brief,
      learnings: {
        marketPerformance: activeLearnings.marketPerformance,
        userPreferences: activeLearnings.userPreferences,
      },
      blueprint,
    };
  }
}

export const campaignContextBuilder = new CampaignContextBuilder();
