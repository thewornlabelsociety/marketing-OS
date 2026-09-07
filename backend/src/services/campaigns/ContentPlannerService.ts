import { randomUUID } from 'crypto';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import type { AIProvider } from '../../integrations/contracts/AIProvider';
import type { ContentPlan, ContentPlanApproval } from '../../types/contentPlan';
import {
  createCoreRepositoriesWithClient,
  getCoreRepositories,
} from '../../db/core/createCoreRepositories';
import type { CoreDomainRepositories } from '../../db/core/coreDomainTypes';
import { withPostgresTransaction } from '../../db/core/withPostgresTransaction';
import { type CampaignPlan } from './CampaignPlannerService';
import { contentPlanningContextBuilder, type ContentPlanningContext } from './ContentPlanningContextBuilder';
import {
  type IncomingContentPlanBody,
  validateAndNormalizeContentPlan,
} from './ContentPlanValidator';

function buildSystemPrompt(isRevision: boolean): string {
  return `You are a marketing content planner. Convert an approved campaign strategy into a structured Content Plan.

CRITICAL RULES:
1. Consume ONLY the approved CampaignPlan provided. Do not invent a new strategy.
2. Create strategic content CONCEPTS first. Deliverables are channel adaptations of those concepts.
3. Related pieces (carousel, Reel, newsletter) that share a message MUST share the same sourceConceptId (the concept contentKey).
4. Translate the approved content mix into concrete deliverables — not vague prose.
5. Every deliverable must have purpose and objectiveRole explaining how it serves the campaign objective.
6. Sequence the campaign into phases that fit the objective. Do not force unused phases.
7. Use canonical values:
   channels: INSTAGRAM, FACEBOOK, TIKTOK, LINKEDIN, EMAIL, WEBSITE
   contentType: STATIC_POST, CAROUSEL, STORY, SHORT_VIDEO, LONG_VIDEO, NEWSLETTER, EMAIL, ARTICLE, LANDING_PAGE, DOCUMENT, OTHER
   format: SQUARE_1_1, PORTRAIT_4_5, VERTICAL_9_16, LANDSCAPE_16_9, NEWSLETTER, DOCUMENT_CAROUSEL, TEXT_POST, ARTICLE, LANDING_PAGE
8. Honor ChannelCapabilityRegistry — never assign impossible combinations (no EMAIL+STORY, no TIKTOK+NEWSLETTER, no INSTAGRAM+NEWSLETTER).
9. Assign stable contentKey values (e.g. product-proof, launch-carousel-01).
10. Identify asset requirements. Do NOT create assets, captions, scripts, email bodies, subject lines, or finished creative.
11. Do not write carousel slide copy, Story copy, Reel scripts, or newsletter copy.
${isRevision ? '12. TARGETED REVISION: Preserve unchanged concepts and deliverables including their contentKey values. Only change what the request requires. Remove deliverables that the request drops. Do not regenerate identifiers for unaffected items.' : ''}

RESPOND WITH VALID JSON ONLY.`;
}

function buildUserPrompt(ctx: ContentPlanningContext, revisionRequest?: string, currentPlan?: ContentPlan | null): string {
  const { campaignContext, approvedPlan, capabilities } = ctx;
  const lines: string[] = [
    '=== OBJECTIVE ===',
    `${campaignContext.objective.name} (${campaignContext.objective.objectiveType})`,
    `Primary KPI: ${campaignContext.objective.primaryKpi}`,
    '',
    '=== APPROVED CAMPAIGN PLAN (exact version — do not substitute a newer plan) ===',
    `sourcePlanId: ${approvedPlan.id}`,
    `sourcePlanVersion: ${approvedPlan.version}`,
    JSON.stringify({
      strategy: approvedPlan.strategy,
      hooks: approvedPlan.hooks,
      proofPoints: approvedPlan.proofPoints,
      callToAction: approvedPlan.callToAction,
      channels: approvedPlan.channels,
      contentMix: approvedPlan.contentMix,
      cadence: approvedPlan.cadence,
      creativeDirection: approvedPlan.creativeDirection,
      measurement: approvedPlan.measurement,
    }, null, 2),
    '',
    '=== CHANNEL CAPABILITIES ===',
    JSON.stringify(capabilities.map((c) => ({
      channel: c.channel,
      contentTypes: c.supportedContentTypes,
      formats: c.supportedFormats,
      devices: c.supportedDevices,
    }))),
    '',
    '=== WHAT WE ARE MARKETING ===',
    `${campaignContext.campaign.sourceType}: ${campaignContext.campaign.sourceTitle}`,
    campaignContext.campaign.sourceDescription ? campaignContext.campaign.sourceDescription : '',
    '',
  ];

  if (currentPlan) {
    lines.push('=== CURRENT CONTENT PLAN (preserve unaffected contentKeys and structure) ===');
    lines.push(JSON.stringify({
      version: currentPlan.version,
      summary: currentPlan.summary,
      concepts: currentPlan.concepts,
      deliverables: currentPlan.deliverables,
      cadence: currentPlan.cadence,
    }, null, 2));
    lines.push('');
  }

  if (revisionRequest) {
    lines.push('=== REVISION REQUEST ===');
    lines.push(revisionRequest);
    lines.push('');
  }

  lines.push(`=== REQUIRED JSON ===
{
  "sourcePlanId": "${approvedPlan.id}",
  "sourcePlanVersion": ${approvedPlan.version},
  "summary": {
    "campaignNarrative": "...",
    "customerJourney": "...",
    "contentStrategy": "..."
  },
  "cadence": {
    "phases": [{ "key": "introduce", "name": "Introduce", "order": 1, "purpose": "..." }],
    "notes": "..."
  },
  "concepts": [
    {
      "contentKey": "product-proof",
      "name": "Product Proof",
      "strategicPurpose": "...",
      "coreMessage": "...",
      "proofPoints": [],
      "sequenceRole": "Prove"
    }
  ],
  "deliverables": [
    {
      "contentKey": "launch-carousel-01",
      "title": "...",
      "purpose": "...",
      "campaignRole": "...",
      "journeyStage": "Consideration",
      "channel": "INSTAGRAM",
      "contentType": "CAROUSEL",
      "format": "PORTRAIT_4_5",
      "deviceTargets": ["mobile"],
      "objectiveRole": "...",
      "primaryMessage": "...",
      "supportingMessages": [],
      "hookDirection": "...",
      "ctaRole": "...",
      "proofPoints": [],
      "creativeDirection": "...",
      "assetRequirements": [{ "type": "PRODUCT_PHOTO", "description": "3 product photographs", "required": true, "quantity": 3 }],
      "sourceConceptId": "product-proof",
      "sequence": 1,
      "timing": { "phase": "Prove", "relativeOrder": 1 }
    }
  ]
}`);

  return lines.filter(Boolean).join('\n');
}

function parseJson(raw: string): IncomingContentPlanBody {
  return JSON.parse(raw) as IncomingContentPlanBody;
}

type NormalizedPlanBody = Omit<
  ContentPlan,
  'id' | 'workspaceId' | 'campaignId' | 'version' | 'status' | 'isCurrent' | 'createdAt' | 'updatedAt'
>;

export type ContentPlanServiceError = { error: string; code: string };

class ContentPlannerService {
  constructor(
    private readonly aiFactory: () => AIProvider | null = getAIProvider,
    private readonly reposFactory: () => CoreDomainRepositories = getCoreRepositories,
  ) {}

  private get repos(): CoreDomainRepositories {
    return this.reposFactory();
  }

  async getCurrent(campaignId: string): Promise<ContentPlan | null> {
    return this.repos.contentPlanning.plan.findCurrentByCampaignId(campaignId);
  }

  async getById(contentPlanId: string, campaignId: string): Promise<ContentPlan | null> {
    return this.repos.contentPlanning.plan.findById(contentPlanId, campaignId);
  }

  async getAllVersions(campaignId: string): Promise<ContentPlan[]> {
    return this.repos.contentPlanning.plan.listByCampaignId(campaignId);
  }

  async getApproval(campaignId: string): Promise<ContentPlanApproval | null> {
    return this.repos.contentPlanning.approval.findByCampaignId(campaignId);
  }

  async resolveApprovedStrategy(campaignId: string): Promise<{ plan: CampaignPlan } | ContentPlanServiceError> {
    const approval = await this.repos.planning.approval.findByCampaignId(campaignId);
    if (!approval) {
      return { error: 'Approve the campaign strategy before creating the content plan.', code: 'STRATEGY_NOT_APPROVED' };
    }
    const plan = await this.repos.planning.plan.getById(approval.approvedPlanId, campaignId);
    if (!plan || plan.version !== approval.approvedVersion) {
      return { error: 'Approve the campaign strategy before creating the content plan.', code: 'STRATEGY_NOT_APPROVED' };
    }
    return { plan };
  }

  async getApprovedContentPlan(campaignId: string): Promise<ContentPlan | null> {
    const approval = await this.getApproval(campaignId);
    if (!approval) return null;
    const plan = await this.getById(approval.contentPlanId, campaignId);
    if (!plan) return null;
    if (plan.version !== approval.contentPlanVersion) return null;
    return plan;
  }

  async resolveApprovedContentPlan(campaignId: string): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const approved = await this.getApprovedContentPlan(campaignId);
    if (!approved) {
      return { error: 'Approve the Content Plan before generating creative.', code: 'CONTENT_PLAN_NOT_APPROVED' };
    }
    return { plan: approved };
  }

  private buildPlanInsert(
    campaignId: string,
    workspaceId: string,
    version: number,
    status: ContentPlan['status'],
    normalized: NormalizedPlanBody,
  ) {
    const id = `cplan_${randomUUID()}`;
    const now = new Date().toISOString();
    const body = JSON.stringify({
      summary: normalized.summary,
      concepts: normalized.concepts,
      deliverables: normalized.deliverables,
      cadence: normalized.cadence,
    });
    return {
      id,
      workspaceId,
      campaignId,
      sourcePlanId: normalized.sourcePlanId,
      sourcePlanVersion: normalized.sourcePlanVersion,
      version,
      status,
      body,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async persistVersionWithRepos(
    repos: CoreDomainRepositories,
    campaignId: string,
    workspaceId: string,
    status: ContentPlan['status'],
    normalized: NormalizedPlanBody,
  ): Promise<ContentPlan> {
    const maxVersion = await repos.contentPlanning.plan.maxVersion(campaignId);
    const version = maxVersion + 1;
    const input = this.buildPlanInsert(campaignId, workspaceId, version, status, normalized);

    if (repos.driver === 'postgres') {
      await repos.contentPlanning.plan.clearCurrentForCampaign(campaignId);
      return repos.contentPlanning.plan.insert(input);
    }

    return repos.contentPlanning.plan.replaceCurrentVersion(input);
  }

  private async persistVersion(
    campaignId: string,
    workspaceId: string,
    status: ContentPlan['status'],
    normalized: NormalizedPlanBody,
  ): Promise<ContentPlan> {
    const repos = this.repos;
    if (repos.driver === 'postgres') {
      return withPostgresTransaction(async (client) => {
        const txRepos = createCoreRepositoriesWithClient(client);
        return this.persistVersionWithRepos(txRepos, campaignId, workspaceId, status, normalized);
      });
    }
    return this.persistVersionWithRepos(repos, campaignId, workspaceId, status, normalized);
  }

  async persistFromStructured(
    campaignId: string,
    body: IncomingContentPlanBody,
    options?: { label?: string },
  ): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const strategy = await this.resolveApprovedStrategy(campaignId);
    if ('error' in strategy) return strategy;

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const previous = await this.getCurrent(campaignId);
    const validated = validateAndNormalizeContentPlan({
      body,
      expectedSourcePlanId: strategy.plan.id,
      expectedSourcePlanVersion: strategy.plan.version,
      previous,
    });

    if ('errors' in validated) {
      return { error: `Content plan is invalid and was not saved. ${validated.errors.join('; ')}`, code: 'VALIDATION_FAILED' };
    }

    const plan = await this.persistVersion(
      campaignId,
      ctx.campaignContext.workspace.id,
      'READY_FOR_REVIEW',
      validated.plan,
    );

    if (options?.label) {
      // Fixture persistence is labelled only in caller logs; never mark as AI output.
    }

    return { plan };
  }

  async generate(campaignId: string): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const strategy = await this.resolveApprovedStrategy(campaignId);
    if ('error' in strategy) return strategy;

    const ai = this.aiFactory();
    if (!ai) {
      return {
        error: 'AI planning is not configured. Add AI_PROVIDER and the corresponding API key to .env to enable content planning.',
        code: 'AI_UNAVAILABLE',
      };
    }

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const existing = await this.getCurrent(campaignId);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(false),
        userPrompt: buildUserPrompt(ctx),
        model: aiEnv.campaignModel,
        maxTokens: 8192,
      });
      const data = parseJson(rawJson);
      return await this.persistFromStructured(campaignId, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (existing) {
        await this.repos.contentPlanning.plan.restoreCurrent(existing.id);
      }
      return { error: `Content planning could not be completed. Existing plans are unchanged. (${message})`, code: 'GENERATION_FAILED' };
    }
  }

  async revise(campaignId: string, requestText: string): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const ai = this.aiFactory();
    if (!ai) {
      return { error: 'AI planning is not configured.', code: 'AI_UNAVAILABLE' };
    }

    const strategy = await this.resolveApprovedStrategy(campaignId);
    if ('error' in strategy) return strategy;

    const current = await this.getCurrent(campaignId);
    if (!current) return { error: 'No content plan exists to revise.', code: 'NO_CONTENT_PLAN' };

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const revId = `cprev_${randomUUID()}`;
    const now = new Date().toISOString();
    await this.repos.contentPlanning.revision.insert({
      id: revId,
      workspaceId: ctx.campaignContext.workspace.id,
      campaignId,
      fromContentPlanId: current.id,
      fromContentPlanVersion: current.version,
      requestText,
      status: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    });

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(true),
        userPrompt: buildUserPrompt(ctx, requestText, current),
        model: aiEnv.revisionModel,
        maxTokens: 8192,
      });
      const data = parseJson(rawJson);
      const validated = validateAndNormalizeContentPlan({
        body: data,
        expectedSourcePlanId: strategy.plan.id,
        expectedSourcePlanVersion: strategy.plan.version,
        previous: current,
      });
      if ('errors' in validated) {
        await this.repos.contentPlanning.revision.markFailed(revId, new Date().toISOString());
        return { error: `Content plan is invalid and was not saved. ${validated.errors.join('; ')}`, code: 'VALIDATION_FAILED' };
      }

      const plan = await this.persistRevisionSuccess(
        campaignId,
        ctx.campaignContext.workspace.id,
        revId,
        validated.plan,
      );
      return { plan };
    } catch (err) {
      await this.repos.contentPlanning.revision.markFailed(revId, new Date().toISOString());
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Content plan revision could not be completed. Version ${current.version} is unchanged. (${message})`, code: 'REVISION_FAILED' };
    }
  }

  private async persistRevisionSuccess(
    campaignId: string,
    workspaceId: string,
    revId: string,
    normalized: NormalizedPlanBody,
  ): Promise<ContentPlan> {
    const repos = this.repos;
    const appliedAt = new Date().toISOString();

    if (repos.driver === 'postgres') {
      return withPostgresTransaction(async (client) => {
        const txRepos = createCoreRepositoriesWithClient(client);
        const plan = await this.persistVersionWithRepos(txRepos, campaignId, workspaceId, 'READY_FOR_REVIEW', normalized);
        await txRepos.contentPlanning.revision.markApplied(revId, plan.id, plan.version, appliedAt);
        await txRepos.contentPlanning.plan.updateStatus(plan.id, 'READY_FOR_REVIEW', appliedAt);
        return plan;
      });
    }

    const plan = await this.persistVersionWithRepos(repos, campaignId, workspaceId, 'READY_FOR_REVIEW', normalized);
    await repos.contentPlanning.revision.markApplied(revId, plan.id, plan.version, appliedAt);
    await repos.contentPlanning.plan.updateStatus(plan.id, 'READY_FOR_REVIEW', appliedAt);
    return plan;
  }

  async reviseFromStructured(
    campaignId: string,
    requestText: string,
    body: IncomingContentPlanBody,
  ): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const current = await this.getCurrent(campaignId);
    if (!current) return { error: 'No content plan exists to revise.', code: 'NO_CONTENT_PLAN' };

    const strategy = await this.resolveApprovedStrategy(campaignId);
    if ('error' in strategy) return strategy;

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const revId = `cprev_${randomUUID()}`;
    const now = new Date().toISOString();
    await this.repos.contentPlanning.revision.insert({
      id: revId,
      workspaceId: ctx.campaignContext.workspace.id,
      campaignId,
      fromContentPlanId: current.id,
      fromContentPlanVersion: current.version,
      requestText,
      status: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    });

    const validated = validateAndNormalizeContentPlan({
      body,
      expectedSourcePlanId: strategy.plan.id,
      expectedSourcePlanVersion: strategy.plan.version,
      previous: current,
    });
    if ('errors' in validated) {
      await this.repos.contentPlanning.revision.markFailed(revId, new Date().toISOString());
      return { error: `Content plan is invalid and was not saved. ${validated.errors.join('; ')}`, code: 'VALIDATION_FAILED' };
    }

    try {
      const plan = await this.persistRevisionSuccess(
        campaignId,
        ctx.campaignContext.workspace.id,
        revId,
        validated.plan,
      );
      return { plan };
    } catch {
      await this.repos.contentPlanning.revision.markFailed(revId, new Date().toISOString());
      return { error: 'Content plan revision could not be completed.', code: 'REVISION_FAILED' };
    }
  }

  async approve(campaignId: string, contentPlanId: string): Promise<{ error?: string; code?: string }> {
    const repos = this.repos;
    const plan = await repos.contentPlanning.plan.findById(contentPlanId, campaignId);
    if (!plan) return { error: 'Content plan not found', code: 'NOT_FOUND' };

    const now = new Date().toISOString();
    const upsert = {
      id: `cp_approval_${randomUUID()}`,
      campaignId,
      workspaceId: plan.workspaceId,
      contentPlanId: plan.id,
      contentPlanVersion: plan.version,
      approvedAt: now,
      createdAt: now,
    };

    if (repos.driver === 'postgres') {
      try {
        await withPostgresTransaction(async (client) => {
          const txRepos = createCoreRepositoriesWithClient(client);
          await txRepos.contentPlanning.approval.upsertByCampaignId(upsert);
          await txRepos.contentPlanning.plan.updateStatus(plan.id, 'APPROVED', now);
        });
      } catch {
        return { error: 'Content plan approval could not be completed.', code: 'APPROVAL_FAILED' };
      }
      return {};
    }

    await repos.contentPlanning.approval.upsertByCampaignId(upsert);
    await repos.contentPlanning.plan.updateStatus(plan.id, 'APPROVED', now);
    return {};
  }
}

export const contentPlannerService = new ContentPlannerService();
export { ContentPlannerService };
