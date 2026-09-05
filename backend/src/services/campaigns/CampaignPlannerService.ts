import { randomUUID } from 'crypto';
import { aiEnv } from '../../config/aiEnvironment';
import {
  createCoreRepositoriesWithClient,
  getCoreRepositories,
} from '../../db/core/createCoreRepositories';
import type { CoreDomainRepositories } from '../../db/core/coreDomainTypes';
import { withPostgresTransaction } from '../../db/core/withPostgresTransaction';
import type {
  CampaignChannelRecommendation,
  CampaignContentRecommendation,
  CampaignPlan,
} from '../../db/core/planningDomainTypes';
export type { CampaignChannelRecommendation, CampaignContentRecommendation, CampaignPlan };
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import type { AIProvider } from '../../integrations/contracts/AIProvider';
import { campaignContextBuilder, CampaignContextBuilder, type CampaignContext } from './CampaignContextBuilder';

function buildSystemPrompt(ctx: CampaignContext, isRevision: boolean): string {
  const objectiveGuidance: Record<string, string> = {
    SALES: `This is a SALES campaign. Emphasize: conversion-focused messaging, compelling value proposition, social proof, clear purchase CTA, urgency where genuine, measurement by conversions and revenue. The hook should compel action. Content mix should prioritize content that drives purchase decisions. Channel selection should favour platforms strong at driving clicks-to-purchase.`,

    AWARENESS: `This is an AWARENESS campaign. Emphasize: reach and memorability over conversion, broad creative storytelling, shareability, emotional resonance, brand distinctiveness. Measurement is by reach, impressions, and new followers — NOT conversions. CTAs should build curiosity, not demand immediate purchase. Content should be visually striking and inherently shareable.`,

    LEAD_GENERATION: `This is a LEAD GENERATION campaign. Emphasize: value exchange (what does the audience get for their contact info?), lead capture mechanism, qualifying signals, cost per lead measurement. CTA must reference the lead magnet or offer. Content should establish trust before asking for contact details.`,

    EVENT_PROMOTION: `This is an EVENT PROMOTION campaign. Emphasize: urgency (the event has a fixed date), attendance intent, RSVP/ticket conversion. The date MUST appear prominently in strategy and CTAs. Content cadence should build toward the event date with clear "last chance" moments near the end.`,

    ENGAGEMENT: `This is an ENGAGEMENT campaign. Emphasize: conversation starters, audience participation, saves and shares over clicks, community building. CTAs should invite responses, polls, or interaction. Measurement is by engagement rate, comments, shares, saves — not conversions.`,

    LAUNCH: `This is a PRODUCT/SERVICE LAUNCH campaign. Emphasize: building anticipation, announcement moment, early adopter positioning, post-launch social proof. Content should tease before launch, announce clearly, then follow up with proof. CTA evolves from "find out more" to "buy/try now" as the campaign progresses.`,

    EMAIL_LIST_GROWTH: `This is an EMAIL LIST GROWTH campaign. Emphasize: the value of subscribing, what they'll get, proof of content quality. Lead magnet or incentive should be central. CTA must be to sign up. Measurement is new subscribers and cost per subscriber.`,

    CUSTOMER_RETENTION: `This is a CUSTOMER RETENTION campaign. Emphasize: loyalty, repeat purchase incentive, existing customer recognition, continued value. Channels that reach existing customers (email, SMS) are highest priority. Measurement is repeat purchases and churn reduction.`,

    RE_ENGAGEMENT: `This is a RE-ENGAGEMENT campaign. Emphasize: what's new or changed, why now, a reason to return. The tone must acknowledge absence without guilt. Channel selection should include email and targeted social. Measurement is reactivated customers.`,

    EDUCATION: `This is an EDUCATION campaign. Emphasize: teaching something genuinely useful, building trust and authority, content completion, shareable learning. CTAs should encourage saves, shares, and follow for more. Measurement is content completions, saves, and watch time.`,

    COMMUNITY_GROWTH: `This is a COMMUNITY GROWTH campaign. Emphasize: what the community stands for, why followers should join, social proof of community size/quality, personality that makes following feel worthwhile. Measurement is new followers and engagement rate.`,

    INVENTORY_CLEARANCE: `This is an INVENTORY CLEARANCE campaign. Emphasize: genuine urgency (limited stock), value/savings, speed of decision. "While stocks last" is honest context. Measurement is units sold and revenue from the clearance batch. Do not overpromise. Do not manufacture false urgency — if the deadline is real, use it.`,
  };

  const guidance = objectiveGuidance[ctx.objective.objectiveType] ?? `This campaign has objective type: ${ctx.objective.objectiveType}. Plan accordingly.`;

  return `You are a strategic marketing planner. Your job is to produce a structured campaign plan as a JSON object.

OBJECTIVE GUIDANCE:
${guidance}

CRITICAL RULES:
1. The objective type MUST materially shape the strategy — angle, hook, CTA, content mix, channels, and measurement must all reflect this objective, not be generic.
2. Respect all brand language rules. NEVER use banned words or phrases. Actively incorporate preferred language and CTA style.
3. Honour the brand personality and tone — do not produce generic marketing speak if the brand has a distinctive voice.
4. Channel recommendations must have a rationale. Only recommend channels appropriate for this objective and audience.
5. Content mix is planning only — do NOT write actual captions, copy, or creative.
6. Be specific and actionable, not vague.
${isRevision ? '7. IMPORTANT: This is a TARGETED REVISION. Preserve all sections not mentioned in the revision request. Only change what was explicitly asked.' : ''}

RESPOND WITH VALID JSON ONLY. No markdown, no commentary, just the JSON object.`;
}

function buildUserPrompt(ctx: CampaignContext, revisionRequest?: string): string {
  const brand = ctx.brand;
  const bannedLanguage = [
    ...(brand.language.bannedWords ?? []),
    ...(brand.language.bannedPhrases ?? []),
  ].filter(Boolean);

  const lines: string[] = [
    '=== WORKSPACE ===',
    `Name: ${ctx.workspace.name}`,
    '',
    '=== BRAND IDENTITY ===',
    brand.identity.description ? `Description: ${brand.identity.description}` : '',
    brand.identity.market ? `Market: ${brand.identity.market}` : '',
    '',
    '=== TARGET AUDIENCE ===',
    brand.audience.primaryAudience ? `Who: ${brand.audience.primaryAudience}` : '',
    brand.audience.problems?.length ? `Problems: ${brand.audience.problems.join(', ')}` : '',
    brand.audience.desires?.length ? `Desires: ${brand.audience.desires.join(', ')}` : '',
    brand.audience.needs?.length ? `Needs: ${brand.audience.needs.join(', ')}` : '',
    '',
    '=== BRAND PERSONALITY ===',
    brand.personality.archetype ? `Archetype: ${brand.personality.archetype}` : '',
    brand.personality.traits?.length ? `Traits: ${brand.personality.traits.join(', ')}` : '',
    brand.personality.principles?.length ? `Principles: ${brand.personality.principles.join(', ')}` : '',
    '',
    '=== BRAND LANGUAGE ===',
    brand.language.preferredWords?.length ? `Preferred words: ${brand.language.preferredWords.join(', ')}` : '',
    brand.language.preferredPhrases?.length ? `Preferred phrases: ${brand.language.preferredPhrases.join(', ')}` : '',
    bannedLanguage.length ? `BANNED — never use: ${bannedLanguage.join(', ')}` : '',
    brand.language.ctaStyle ? `CTA style: ${brand.language.ctaStyle}` : '',
    brand.language.exampleCopy ? `Example voice: "${brand.language.exampleCopy}"` : '',
    '',
    '=== WHAT WE ARE MARKETING ===',
    `Type: ${ctx.campaign.sourceType}`,
    `Title: ${ctx.campaign.sourceTitle}`,
    ctx.campaign.sourceDescription ? `Details: ${ctx.campaign.sourceDescription}` : '',
    '',
    '=== CAMPAIGN OBJECTIVE ===',
    `Objective: ${ctx.objective.name} (${ctx.objective.objectiveType})`,
    ctx.objective.description ? `Description: ${ctx.objective.description}` : '',
    `Primary KPI: ${ctx.objective.primaryKpi}`,
    ctx.objective.supportingKpis.length ? `Supporting KPIs: ${ctx.objective.supportingKpis.join(', ')}` : '',
    ctx.objective.conversionEvent ? `Conversion event: ${ctx.objective.conversionEvent}` : '',
    '',
  ];

  if (ctx.brief) {
    lines.push('=== CAMPAIGN BRIEF ===');
    if (ctx.brief.sourceSummary) lines.push(`Source: ${ctx.brief.sourceSummary}`);
    if (ctx.brief.objectiveSummary) lines.push(`Objective context: ${ctx.brief.objectiveSummary}`);
    if (ctx.brief.audienceDescription) lines.push(`Audience: ${ctx.brief.audienceDescription}`);
    if (ctx.brief.audienceProblem) lines.push(`Audience problem: ${ctx.brief.audienceProblem}`);
    if (ctx.brief.audienceDesire) lines.push(`Audience desire: ${ctx.brief.audienceDesire}`);
    if (ctx.brief.proposition) lines.push(`Proposition: ${ctx.brief.proposition}`);
    if (ctx.brief.offerDescription) lines.push(`Offer: ${ctx.brief.offerDescription}`);
    if (ctx.brief.offerValue) lines.push(`Offer value: ${ctx.brief.offerValue}`);
    if (ctx.brief.offerUrgency) lines.push(`Urgency: ${ctx.brief.offerUrgency}`);
    if (ctx.brief.timingStartDate) lines.push(`Start date: ${ctx.brief.timingStartDate}`);
    if (ctx.brief.timingEndDate) lines.push(`End date: ${ctx.brief.timingEndDate}`);
    if (ctx.brief.keyDetails.length) lines.push(`Key details: ${ctx.brief.keyDetails.join(', ')}`);
    if (ctx.brief.additionalContext) lines.push(`Additional context: ${ctx.brief.additionalContext}`);
    lines.push('');
  }

  if (ctx.learnings.marketPerformance.length) {
    lines.push('=== PERFORMANCE LEARNINGS ===');
    ctx.learnings.marketPerformance.forEach((l) => lines.push(`- ${l}`));
    lines.push('');
  }

  if (ctx.learnings.userPreferences.length) {
    lines.push('=== USER PREFERENCES ===');
    ctx.learnings.userPreferences.forEach((l) => lines.push(`- ${l}`));
    lines.push('');
  }

  if (brand.marketing.contentPillars?.length) {
    lines.push('=== CONTENT PILLARS ===');
    lines.push(brand.marketing.contentPillars.join(', '));
    lines.push('');
  }

  if (revisionRequest) {
    lines.push('=== REVISION REQUEST ===');
    lines.push(revisionRequest);
    lines.push('');
    lines.push('Produce a revised plan. ONLY change what the revision request specifies. Preserve everything else.');
    lines.push('');
  }

  lines.push('=== REQUIRED JSON STRUCTURE ===');
  lines.push(`Produce a JSON object with exactly this structure:
{
  "strategy": {
    "campaignAngle": "The specific angle or approach for this campaign",
    "coreMessage": "The single core message the campaign communicates",
    "proposition": "The value proposition to the audience",
    "audienceFocus": "Who specifically this campaign is targeting and why"
  },
  "hooks": {
    "primary": "The primary hook — the most compelling opening line or concept",
    "supporting": ["Alternative hook 1", "Alternative hook 2"]
  },
  "proofPoints": ["Proof point 1", "Proof point 2"],
  "callToAction": {
    "primary": "Primary CTA text",
    "alternatives": ["Alt CTA 1", "Alt CTA 2"]
  },
  "channels": [
    { "channel": "instagram_feed", "role": "primary", "rationale": "Why this channel for this objective" }
  ],
  "contentMix": [
    { "contentType": "carousel", "channel": "instagram_feed", "format": "4:5", "quantity": 2, "purpose": "What this content achieves" }
  ],
  "cadence": {
    "summary": "Posting cadence description",
    "duration": "2 weeks"
  },
  "creativeDirection": {
    "visualDirection": "Visual style and aesthetic guidance",
    "photographyDirection": "Photography guidance or null",
    "videoDirection": "Video guidance or null",
    "copyDirection": "Copy tone, style and approach"
  },
  "measurement": {
    "objective": "What success looks like for this campaign",
    "primaryKpi": "${ctx.objective.primaryKpi}",
    "supportingKpis": ${JSON.stringify(ctx.objective.supportingKpis)},
    "conversionEvent": ${ctx.objective.conversionEvent ? `"${ctx.objective.conversionEvent}"` : 'null'}
  },
  "rationale": {
    "summary": "Brief explanation of the strategic decisions made and why they fit this objective and brand"
  }
}`);

  return lines.filter((l) => l !== undefined).join('\n');
}

function parsePlanJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('AI returned invalid JSON — plan could not be parsed');
  }
}

export class CampaignPlannerService {
  constructor(
    private readonly aiFactory: () => AIProvider | null = getAIProvider,
    private readonly reposFactory: () => CoreDomainRepositories = getCoreRepositories,
    private readonly contextBuilder: CampaignContextBuilder = campaignContextBuilder,
  ) {}

  private get repos() {
    return this.reposFactory();
  }

  isAvailable(): boolean {
    return aiEnv.isConfigured;
  }

  async getCurrentPlan(campaignId: string): Promise<CampaignPlan | null> {
    return this.repos.planning.plan.getCurrent(campaignId);
  }

  async getAllVersions(campaignId: string): Promise<CampaignPlan[]> {
    return this.repos.planning.plan.listVersions(campaignId);
  }

  async getPlanById(planId: string, campaignId: string): Promise<CampaignPlan | null> {
    return this.repos.planning.plan.getById(planId, campaignId);
  }

  async getApprovedPlan(campaignId: string): Promise<CampaignPlan | null> {
    const approval = await this.getApproval(campaignId);
    if (!approval) return null;
    const plan = await this.getPlanById(approval.approvedPlanId, campaignId);
    if (!plan) return null;
    if (plan.version !== approval.approvedVersion) return null;
    return plan;
  }

  async generate(campaignId: string): Promise<{ plan: CampaignPlan } | { error: string }> {
    const ai = this.aiFactory();
    if (!ai) {
      return { error: 'AI planning is not configured. Add AI_PROVIDER and the corresponding API key to .env to enable campaign planning.' };
    }

    const ctx = await this.contextBuilder.build(campaignId);
    if (!ctx) return { error: 'Campaign not found' };

    const repos = this.repos;
    const maxVersion = await repos.planning.plan.getMaxVersion(campaignId);
    const nextVersion = maxVersion + 1;

    if (repos.driver === 'postgres') {
      try {
        const rawJson = await ai.generateStructured({
          systemPrompt: buildSystemPrompt(ctx, false),
          userPrompt: buildUserPrompt(ctx),
          model: aiEnv.campaignModel,
          maxTokens: 4096,
        });
        const data = parsePlanJson(rawJson);
        const now = new Date().toISOString();
        const plan = await withPostgresTransaction(async (client) => {
          const txRepos = createCoreRepositoriesWithClient(client);
          await txRepos.planning.plan.markAllNonCurrent(campaignId);
          const inserted = await txRepos.planning.plan.insert({
            id: `plan_${randomUUID()}`,
            campaignId,
            workspaceId: ctx.workspace.id,
            version: nextVersion,
            status: 'READY_FOR_REVIEW',
            isCurrent: true,
            data,
            createdAt: now,
            updatedAt: now,
          });
          await txRepos.campaign.updateStatus(campaignId, 'READY_FOR_REVIEW', now, { onlyIfStatus: 'DRAFTING' });
          return inserted;
        });
        return { plan };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Campaign planning could not be completed. Your campaign is safe. (${message})` };
      }
    }

    const previousCurrent = await repos.planning.plan.getCurrent(campaignId);
    await repos.planning.plan.markAllNonCurrent(campaignId);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(ctx, false),
        userPrompt: buildUserPrompt(ctx),
        model: aiEnv.campaignModel,
        maxTokens: 4096,
      });

      const data = parsePlanJson(rawJson);
      const now = new Date().toISOString();
      const plan = await repos.planning.plan.insert({
        id: `plan_${randomUUID()}`,
        campaignId,
        workspaceId: ctx.workspace.id,
        version: nextVersion,
        status: 'READY_FOR_REVIEW',
        isCurrent: true,
        data,
        createdAt: now,
        updatedAt: now,
      });

      await repos.campaign.updateStatus(campaignId, 'READY_FOR_REVIEW', now, { onlyIfStatus: 'DRAFTING' });

      return { plan };
    } catch (err) {
      if (previousCurrent) {
        await repos.planning.plan.markCurrent(previousCurrent.id);
      }
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Campaign planning could not be completed. Your campaign is safe. (${message})` };
    }
  }

  async revise(campaignId: string, revisionRequest: string): Promise<{ plan: CampaignPlan } | { error: string }> {
    const ai = this.aiFactory();
    if (!ai) return { error: 'AI planning is not configured.' };

    const ctx = await this.contextBuilder.build(campaignId);
    if (!ctx) return { error: 'Campaign not found' };

    const repos = this.repos;
    const currentPlan = await repos.planning.plan.getCurrent(campaignId);
    if (!currentPlan) return { error: 'No plan exists to revise. Generate a plan first.' };

    const fromPlanId = currentPlan.id;
    const fromPlanVersion = currentPlan.version;
    const nextVersion = fromPlanVersion + 1;
    const revId = `rev_${randomUUID()}`;
    const now = new Date().toISOString();

    if (repos.driver === 'postgres') {
      await withPostgresTransaction(async (client) => {
        const txRepos = createCoreRepositoriesWithClient(client);
        await txRepos.planning.revision.create({
          id: revId,
          campaignId,
          workspaceId: ctx.workspace.id,
          fromPlanId,
          fromPlanVersion,
          requestText: revisionRequest,
          status: 'PROCESSING',
          createdAt: now,
          updatedAt: now,
        });
        await txRepos.campaign.updateStatus(campaignId, 'REVISING', now);
        await txRepos.planning.plan.markAllNonCurrent(campaignId);
      });

      try {
        const rawJson = await ai.generateStructured({
          systemPrompt: buildSystemPrompt(ctx, true),
          userPrompt: buildUserPrompt(ctx, revisionRequest),
          model: aiEnv.revisionModel,
          maxTokens: 4096,
        });
        const data = parsePlanJson(rawJson);
        const appliedAt = new Date().toISOString();
        const plan = await withPostgresTransaction(async (client) => {
          const txRepos = createCoreRepositoriesWithClient(client);
          const inserted = await txRepos.planning.plan.insert({
            id: `plan_${randomUUID()}`,
            campaignId,
            workspaceId: ctx.workspace.id,
            version: nextVersion,
            status: 'READY_FOR_REVIEW',
            isCurrent: true,
            data,
            createdAt: appliedAt,
            updatedAt: appliedAt,
          });
          await txRepos.planning.revision.updateStatus(revId, 'APPLIED', appliedAt);
          await txRepos.campaign.updateStatus(campaignId, 'READY_FOR_APPROVAL', appliedAt);
          return inserted;
        });
        return { plan };
      } catch (err) {
        const failedAt = new Date().toISOString();
        await withPostgresTransaction(async (client) => {
          const txRepos = createCoreRepositoriesWithClient(client);
          await txRepos.planning.plan.markCurrent(fromPlanId);
          await txRepos.planning.revision.updateStatus(revId, 'FAILED', failedAt);
          await txRepos.campaign.updateStatus(campaignId, 'READY_FOR_REVIEW', failedAt);
        });
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Campaign revision could not be completed. Your plan is safe. (${message})` };
      }
    }

    await repos.planning.revision.create({
      id: revId,
      campaignId,
      workspaceId: ctx.workspace.id,
      fromPlanId,
      fromPlanVersion,
      requestText: revisionRequest,
      status: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    });
    await repos.campaign.updateStatus(campaignId, 'REVISING', now);
    await repos.planning.plan.markAllNonCurrent(campaignId);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(ctx, true),
        userPrompt: buildUserPrompt(ctx, revisionRequest),
        model: aiEnv.revisionModel,
        maxTokens: 4096,
      });

      const data = parsePlanJson(rawJson);
      const appliedAt = new Date().toISOString();
      const plan = await repos.planning.plan.insert({
        id: `plan_${randomUUID()}`,
        campaignId,
        workspaceId: ctx.workspace.id,
        version: nextVersion,
        status: 'READY_FOR_REVIEW',
        isCurrent: true,
        data,
        createdAt: appliedAt,
        updatedAt: appliedAt,
      });

      await repos.planning.revision.updateStatus(revId, 'APPLIED', appliedAt);
      await repos.campaign.updateStatus(campaignId, 'READY_FOR_APPROVAL', appliedAt);

      return { plan };
    } catch (err) {
      await repos.planning.plan.markCurrent(fromPlanId);
      await repos.planning.revision.updateStatus(revId, 'FAILED', new Date().toISOString());
      await repos.campaign.updateStatus(campaignId, 'READY_FOR_REVIEW', new Date().toISOString());

      const message = err instanceof Error ? err.message : String(err);
      return { error: `Campaign revision could not be completed. Your plan is safe. (${message})` };
    }
  }

  async approvePlan(campaignId: string, planId: string): Promise<{ error?: string }> {
    const repos = this.repos;
    const plan = await repos.planning.plan.getById(planId, campaignId);
    if (!plan) return { error: 'Plan not found' };

    const now = new Date().toISOString();

    if (repos.driver === 'postgres') {
      try {
        await withPostgresTransaction(async (client) => {
          const txRepos = createCoreRepositoriesWithClient(client);
          await txRepos.planning.approval.upsertByCampaignId({
            id: `approval_${randomUUID()}`,
            campaignId,
            workspaceId: plan.workspaceId,
            approvedPlanId: planId,
            approvedVersion: plan.version,
            approvedAt: now,
            createdAt: now,
          });
          await txRepos.planning.plan.updateStatus(planId, 'APPROVED', now);
          await txRepos.campaign.updateStatus(campaignId, 'APPROVED', now);
        });
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    }

    await repos.planning.approval.upsertByCampaignId({
      id: `approval_${randomUUID()}`,
      campaignId,
      workspaceId: plan.workspaceId,
      approvedPlanId: planId,
      approvedVersion: plan.version,
      approvedAt: now,
      createdAt: now,
    });
    await repos.planning.plan.updateStatus(planId, 'APPROVED', now);
    await repos.campaign.updateStatus(campaignId, 'APPROVED', now);

    return {};
  }

  async getApproval(campaignId: string): Promise<{ approvedPlanId: string; approvedVersion: number; approvedAt: string } | null> {
    const row = await this.repos.planning.approval.findByCampaignId(campaignId);
    if (!row) return null;
    return {
      approvedPlanId: row.approvedPlanId,
      approvedVersion: row.approvedVersion,
      approvedAt: row.approvedAt,
    };
  }
}

export const campaignPlannerService = new CampaignPlannerService();
