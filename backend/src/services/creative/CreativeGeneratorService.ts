import { randomUUID } from 'crypto';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import type { AIProvider } from '../../integrations/contracts/AIProvider';
import type {
  CampaignCreativeSummary,
  CreativeApproval,
  CreativeArtifact,
  CreativeContent,
} from '../../types/creativeArtifact';
import type { ContentDeliverable } from '../../types/contentPlan';
import type { CoreDomainRepositories } from '../../db/core/coreDomainTypes';
import type { CreativeApprovalUpsert, CreativeArtifactInsert, CreativeRevisionInsert } from '../../db/core/creativeDomainTypes';
import { getCoreRepositories, createCoreRepositoriesWithClient } from '../../db/core/createCoreRepositories';
import { withPostgresTransaction } from '../../db/core/withPostgresTransaction';
import { contentPlannerService } from '../campaigns/ContentPlannerService';
import {
  creativeGenerationContextBuilder,
  type CreativeGenerationContext,
} from './CreativeGenerationContextBuilder';
import {
  attemptAutoRepair,
  buildQualityResult,
  contentKindForDeliverable,
  detectPlanningChangeRequest,
  normalizeCreativeContent,
  preserveCreativeSections,
  validateCreativeStructure,
} from './CreativeContentValidator';

export type CreativeServiceError = { error: string; code: string };

function buildSystemPrompt(isRevision: boolean): string {
  return `You are a marketing creative writer. Execute the approved Content Plan deliverable exactly as specified.

CRITICAL RULES:
1. Consume ONLY the approved Content Plan and specific deliverable provided.
2. Do NOT reinterpret campaign strategy, objective, audience, channel, content type, or format.
3. Create finished marketing copy appropriate to the deliverable type.
4. Use Brand Brain voice, tone, vocabulary, and CTA style.
5. Never invent product facts, prices, discounts, testimonials, awards, statistics, event dates, or guarantees not in context.
6. Return structured JSON matching the required content kind.
7. Do not include placeholder text like "Lorem ipsum" or "[insert here]".
${isRevision ? '8. TARGETED REVISION: Change only what the revision request specifies. Preserve unchanged sections, slides, frames, and scenes wherever possible.' : ''}

RESPOND WITH VALID JSON ONLY.`;
}

function buildUserPrompt(ctx: CreativeGenerationContext, current?: CreativeArtifact | null, revisionRequest?: string, targetHint?: string): string {
  const { campaignContext, approvedContentPlan, deliverable, sourceConcept, approvedCampaignPlan } = ctx;
  const kind = contentKindForDeliverable(deliverable.contentType);
  const brand = campaignContext.brand;
  const banned = [
    ...(brand.language.bannedWords ?? []),
    ...(brand.language.bannedPhrases ?? []),
  ].filter(Boolean);

  const lines = [
    '=== APPROVED CONTENT PLAN ===',
    `sourceContentPlanId: ${approvedContentPlan.id}`,
    `sourceContentPlanVersion: ${approvedContentPlan.version}`,
    '',
    '=== SPECIFIC DELIVERABLE ===',
    JSON.stringify(deliverable, null, 2),
    '',
    '=== SOURCE CONCEPT ===',
    sourceConcept ? JSON.stringify(sourceConcept, null, 2) : 'None',
    '',
    '=== OBJECTIVE ===',
    `${campaignContext.objective.name} (${campaignContext.objective.objectiveType})`,
    '',
    '=== BRAND BRAIN ===',
    JSON.stringify({
      personality: brand.personality,
      language: brand.language,
      audience: brand.audience,
      visual: brand.visual,
    }, null, 2),
    banned.length ? `BANNED — never use: ${banned.join(', ')}` : '',
    '',
    '=== WHAT WE ARE MARKETING ===',
    `${campaignContext.campaign.sourceType}: ${campaignContext.campaign.sourceTitle}`,
    campaignContext.campaign.sourceDescription ?? '',
    '',
    '=== APPROVED STRATEGY (reference only — do not replan) ===',
    JSON.stringify({
      coreMessage: approvedCampaignPlan.strategy.coreMessage,
      hooks: approvedCampaignPlan.hooks,
      callToAction: approvedCampaignPlan.callToAction,
      creativeDirection: approvedCampaignPlan.creativeDirection,
    }, null, 2),
    '',
    `=== REQUIRED JSON KIND: ${kind} ===`,
  ];

  if (current) {
    lines.push('=== CURRENT CREATIVE (preserve unchanged sections) ===');
    lines.push(JSON.stringify(current.content, null, 2));
  }
  if (revisionRequest) {
    lines.push('=== REVISION REQUEST ===', revisionRequest);
    if (targetHint) lines.push(`Target hint: ${targetHint}`);
  }

  return lines.filter(Boolean).join('\n');
}

function parseJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

export class CreativeGeneratorService {
  constructor(
    private readonly aiFactory: () => AIProvider | null = getAIProvider,
    private readonly reposFactory: () => CoreDomainRepositories = getCoreRepositories,
  ) {}

  private get repos(): CoreDomainRepositories {
    return this.reposFactory();
  }

  async getCurrent(campaignId: string, contentKey: string): Promise<CreativeArtifact | null> {
    return this.repos.creative.artifact.findCurrentByCampaignAndKey(campaignId, contentKey);
  }

  async getById(artifactId: string, campaignId: string): Promise<CreativeArtifact | null> {
    return this.repos.creative.artifact.findById(artifactId, campaignId);
  }

  async getAllVersions(campaignId: string, contentKey: string): Promise<CreativeArtifact[]> {
    return this.repos.creative.artifact.listByCampaignAndKey(campaignId, contentKey);
  }

  async getApproval(campaignId: string, contentKey: string): Promise<CreativeApproval | null> {
    return this.repos.creative.approval.findByCampaignAndKey(campaignId, contentKey);
  }

  async isDeliverableApproved(campaignId: string, contentKey: string): Promise<boolean> {
    const current = await this.getCurrent(campaignId, contentKey);
    const approval = await this.getApproval(campaignId, contentKey);
    if (!current || !approval) return false;
    return approval.creativeArtifactId === current.id && approval.approvedVersion === current.version;
  }

  async getSummary(campaignId: string): Promise<CampaignCreativeSummary | CreativeServiceError> {
    const planResult = await contentPlannerService.resolveApprovedContentPlan(campaignId);
    if ('error' in planResult) return planResult;
    const plan = planResult.plan;

    const deliverables = await Promise.all(
      plan.deliverables.map(async (deliverable: ContentDeliverable) => {
        const current = await this.getCurrent(campaignId, deliverable.contentKey);
        const approved = await this.isDeliverableApproved(campaignId, deliverable.contentKey);
        return {
          contentKey: deliverable.contentKey,
          title: deliverable.title,
          channel: deliverable.channel,
          contentType: deliverable.contentType,
          format: deliverable.format,
          hasCreative: current !== null,
          currentVersion: current?.version ?? null,
          status: current?.status ?? null,
          isApproved: approved,
          artifactId: current?.id ?? null,
        };
      }),
    );

    const generated = deliverables.filter((d) => d.hasCreative).length;
    const approved = deliverables.filter((d) => d.isApproved).length;
    const needsReview = deliverables.filter((d) => d.hasCreative && !d.isApproved).length;
    const needsGeneration = deliverables.length - generated;

    return {
      contentPlanApproved: true,
      totalDeliverables: deliverables.length,
      generated,
      approved,
      needsReview,
      needsGeneration,
      readyForScheduling: deliverables.length > 0 && approved === deliverables.length,
      deliverables,
    };
  }

  async persistFromStructured(
    campaignId: string,
    contentKey: string,
    rawContent: Record<string, unknown>,
    options?: { previous?: CreativeContent | null; targetHint?: string },
  ): Promise<{ artifact: CreativeArtifact } | CreativeServiceError> {
    const ctxResult = await creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;
    const ctx = ctxResult;
    const { deliverable, approvedContentPlan, campaignContext } = ctx;

    let content = normalizeCreativeContent(deliverable, rawContent);
    if (options?.previous) {
      content = preserveCreativeSections(options.previous, content, options.targetHint);
    }

    const repaired = attemptAutoRepair(content);
    content = repaired.content;

    const quality = buildQualityResult(deliverable, content, campaignContext);
    if (repaired.repaired) quality.repaired = true;

    const structuralErrors = validateCreativeStructure(deliverable, content);
    if (structuralErrors.length > 0) {
      return {
        error: `Creative is invalid and was not saved. ${structuralErrors.join('; ')}`,
        code: 'VALIDATION_FAILED',
      };
    }
    if (!quality.passed) {
      const fails = quality.checks.filter((c) => c.status === 'FAIL').map((c) => c.message ?? c.key);
      return { error: `Creative failed quality checks. ${fails.join('; ')}`, code: 'QUALITY_FAILED' };
    }

    const repos = this.repos;
    const version = (await repos.creative.artifact.maxVersionForCampaignAndKey(campaignId, contentKey)) + 1;
    const id = `cart_${randomUUID()}`;
    const now = new Date().toISOString();

    const input: CreativeArtifactInsert = {
      id,
      workspaceId: campaignContext.workspace.id,
      campaignId,
      sourceContentPlanId: approvedContentPlan.id,
      sourceContentPlanVersion: approvedContentPlan.version,
      contentKey,
      deliverableId: deliverable.id,
      version,
      status: 'READY_FOR_REVIEW',
      channel: deliverable.channel,
      contentType: deliverable.contentType,
      format: deliverable.format,
      title: deliverable.title ?? null,
      content: JSON.stringify(content),
      quality: JSON.stringify(quality),
      createdAt: now,
      updatedAt: now,
    };

    if (repos.driver === 'postgres') {
      const artifact = await withPostgresTransaction(async (client) => {
        const txRepos = createCoreRepositoriesWithClient(client);
        return txRepos.creative.artifact.replaceCurrentForCampaignAndContentKey(input);
      });
      return { artifact };
    }

    const artifact = await repos.creative.artifact.replaceCurrentForCampaignAndContentKey(input);
    return { artifact };
  }

  async generateOne(campaignId: string, contentKey: string): Promise<{ artifact: CreativeArtifact } | CreativeServiceError> {
    const planResult = await contentPlannerService.resolveApprovedContentPlan(campaignId);
    if ('error' in planResult) return planResult;

    const ctxResult = await creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;

    const ai = this.aiFactory();
    if (!ai) {
      return {
        error: 'AI creative generation is not configured. Add AI_PROVIDER and the corresponding API key to .env.',
        code: 'AI_UNAVAILABLE',
      };
    }

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(false),
        userPrompt: buildUserPrompt(ctxResult),
        model: aiEnv.campaignModel,
        maxTokens: 8192,
      });
      return await this.persistFromStructured(campaignId, contentKey, parseJson(rawJson));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Creative generation failed. (${message})`, code: 'GENERATION_FAILED' };
    }
  }

  async generateAllMissing(campaignId: string): Promise<{
    results: { contentKey: string; artifact?: CreativeArtifact; error?: string; code?: string }[];
  } | CreativeServiceError> {
    const summary = await this.getSummary(campaignId);
    if ('error' in summary) return summary;

    const missing = summary.deliverables.filter((d) => !d.hasCreative);
    const results: { contentKey: string; artifact?: CreativeArtifact; error?: string; code?: string }[] = [];

    for (const item of missing) {
      const result = await this.generateOne(campaignId, item.contentKey);
      if ('error' in result) {
        results.push({ contentKey: item.contentKey, error: result.error, code: result.code });
      } else {
        results.push({ contentKey: item.contentKey, artifact: result.artifact });
      }
    }

    return { results };
  }

  async revise(
    campaignId: string,
    contentKey: string,
    requestText: string,
    targetHint?: string,
  ): Promise<{ artifact: CreativeArtifact } | CreativeServiceError> {
    if (detectPlanningChangeRequest(requestText)) {
      return {
        error: 'This request requires a Content Plan change, not a creative edit. Update the Content Plan instead.',
        code: 'PLANNING_CHANGE_REQUIRED',
      };
    }

    const repos = this.repos;
    const current = await repos.creative.artifact.findCurrentByCampaignAndKey(campaignId, contentKey);
    if (!current) return { error: 'No creative exists to revise.', code: 'NOT_FOUND' };

    const ctxResult = await creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;

    const ai = this.aiFactory();
    if (!ai) return { error: 'AI creative generation is not configured.', code: 'AI_UNAVAILABLE' };

    const revId = `crev_${randomUUID()}`;
    const now = new Date().toISOString();
    const revInput: CreativeRevisionInsert = {
      id: revId,
      workspaceId: ctxResult.campaignContext.workspace.id,
      campaignId,
      contentKey,
      creativeArtifactId: current.id,
      sourceVersion: current.version,
      requestText,
      targetHint: targetHint ?? null,
      status: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    };
    await repos.creative.revision.insert(revInput);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(true),
        userPrompt: buildUserPrompt(ctxResult, current, requestText, targetHint),
        model: aiEnv.revisionModel,
        maxTokens: 8192,
      });

      const result = await this.persistFromStructured(campaignId, contentKey, parseJson(rawJson), {
        previous: current.content,
        targetHint,
      });

      if ('error' in result) {
        await repos.creative.revision.markFailed(revId, new Date().toISOString());
        return result;
      }

      await repos.creative.revision.markApplied(revId, result.artifact.id, result.artifact.version, new Date().toISOString());
      return result;
    } catch (err) {
      await repos.creative.revision.markFailed(revId, new Date().toISOString());
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Creative revision failed. (${message})`, code: 'REVISION_FAILED' };
    }
  }

  async reviseFromStructured(
    campaignId: string,
    contentKey: string,
    requestText: string,
    rawContent: Record<string, unknown>,
    options?: { targetHint?: string },
  ): Promise<{ artifact: CreativeArtifact } | CreativeServiceError> {
    if (detectPlanningChangeRequest(requestText)) {
      return { error: 'Planning change required.', code: 'PLANNING_CHANGE_REQUIRED' };
    }

    const repos = this.repos;
    const current = await repos.creative.artifact.findCurrentByCampaignAndKey(campaignId, contentKey);
    if (!current) return { error: 'No creative exists to revise.', code: 'NOT_FOUND' };

    const ctxResult = await creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;

    const revId = `crev_${randomUUID()}`;
    const now = new Date().toISOString();
    const revInput: CreativeRevisionInsert = {
      id: revId,
      workspaceId: ctxResult.campaignContext.workspace.id,
      campaignId,
      contentKey,
      creativeArtifactId: current.id,
      sourceVersion: current.version,
      requestText,
      targetHint: options?.targetHint ?? null,
      status: 'PROCESSING',
      createdAt: now,
      updatedAt: now,
    };
    await repos.creative.revision.insert(revInput);

    const result = await this.persistFromStructured(campaignId, contentKey, rawContent, {
      previous: current.content,
      targetHint: options?.targetHint,
    });

    if ('error' in result) {
      await repos.creative.revision.markFailed(revId, new Date().toISOString());
      return result;
    }

    await repos.creative.revision.markApplied(revId, result.artifact.id, result.artifact.version, new Date().toISOString());
    return result;
  }

  async approve(
    campaignId: string,
    contentKey: string,
    creativeArtifactId: string,
  ): Promise<{ error?: string; code?: string }> {
    const repos = this.repos;
    const artifact = await repos.creative.artifact.findById(creativeArtifactId, campaignId);
    if (!artifact || artifact.contentKey !== contentKey) {
      return { error: 'Creative artifact not found', code: 'NOT_FOUND' };
    }

    const now = new Date().toISOString();
    const upsertInput: CreativeApprovalUpsert = {
      id: `cappr_${randomUUID()}`,
      workspaceId: artifact.workspaceId,
      campaignId,
      contentKey,
      creativeArtifactId: artifact.id,
      approvedVersion: artifact.version,
      approvedAt: now,
      createdAt: now,
    };

    if (repos.driver === 'postgres') {
      await withPostgresTransaction(async (client) => {
        const txRepos = createCoreRepositoriesWithClient(client);
        await txRepos.creative.approval.upsertByCampaignAndKey(upsertInput);
        await txRepos.creative.artifact.updateStatus(artifact.id, 'APPROVED', now);
      });
    } else {
      await repos.creative.approval.upsertByCampaignAndKey(upsertInput);
      await repos.creative.artifact.updateStatus(artifact.id, 'APPROVED', now);
    }

    return {};
  }
}

export const creativeGeneratorService = new CreativeGeneratorService();
