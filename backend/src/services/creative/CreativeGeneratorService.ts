import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import type { AIProvider } from '../../integrations/contracts/AIProvider';
import type {
  CampaignCreativeSummary,
  CreativeApproval,
  CreativeArtifact,
  CreativeArtifactStatus,
  CreativeContent,
  CreativeQualityResult,
} from '../../types/creativeArtifact';
import type { ContentDeliverable } from '../../types/contentPlan';
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

interface CreativeRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  source_content_plan_id: string;
  source_content_plan_version: number;
  content_key: string;
  deliverable_id: string;
  version: number;
  status: string;
  is_current: number;
  channel: string;
  content_type: string;
  format: string;
  title: string | null;
  content: string;
  quality: string;
  created_at: string;
  updated_at: string;
}

export type CreativeServiceError = { error: string; code: string };

function mapRow(row: CreativeRow): CreativeArtifact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    sourceContentPlanId: row.source_content_plan_id,
    sourceContentPlanVersion: row.source_content_plan_version,
    contentKey: row.content_key,
    deliverableId: row.deliverable_id,
    version: row.version,
    channel: row.channel as CreativeArtifact['channel'],
    contentType: row.content_type as CreativeArtifact['contentType'],
    format: row.format as CreativeArtifact['format'],
    title: row.title ?? undefined,
    content: JSON.parse(row.content) as CreativeContent,
    quality: JSON.parse(row.quality) as CreativeQualityResult,
    status: row.status as CreativeArtifactStatus,
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

class CreativeGeneratorService {
  constructor(private readonly aiFactory: () => AIProvider | null = getAIProvider) {}

  getCurrent(campaignId: string, contentKey: string): CreativeArtifact | null {
    const row = db.prepare(`
      SELECT * FROM creative_artifacts
      WHERE campaign_id = ? AND content_key = ? AND is_current = 1
      ORDER BY version DESC LIMIT 1
    `).get(campaignId, contentKey) as CreativeRow | undefined;
    return row ? mapRow(row) : null;
  }

  getById(artifactId: string, campaignId: string): CreativeArtifact | null {
    const row = db.prepare('SELECT * FROM creative_artifacts WHERE id = ? AND campaign_id = ?')
      .get(artifactId, campaignId) as CreativeRow | undefined;
    return row ? mapRow(row) : null;
  }

  getAllVersions(campaignId: string, contentKey: string): CreativeArtifact[] {
    const rows = db.prepare(`
      SELECT * FROM creative_artifacts
      WHERE campaign_id = ? AND content_key = ?
      ORDER BY version DESC
    `).all(campaignId, contentKey) as CreativeRow[];
    return rows.map(mapRow);
  }

  getApproval(campaignId: string, contentKey: string): CreativeApproval | null {
    const row = db.prepare(`
      SELECT * FROM creative_approvals WHERE campaign_id = ? AND content_key = ?
    `).get(campaignId, contentKey) as {
      campaign_id: string;
      content_key: string;
      creative_artifact_id: string;
      approved_version: number;
      approved_at: string;
    } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentKey: row.content_key,
      creativeArtifactId: row.creative_artifact_id,
      approvedVersion: row.approved_version,
      approvedAt: row.approved_at,
    };
  }

  isDeliverableApproved(campaignId: string, contentKey: string): boolean {
    const current = this.getCurrent(campaignId, contentKey);
    const approval = this.getApproval(campaignId, contentKey);
    if (!current || !approval) return false;
    return approval.creativeArtifactId === current.id && approval.approvedVersion === current.version;
  }

  getSummary(campaignId: string): CampaignCreativeSummary | CreativeServiceError {
    const planResult = contentPlannerService.resolveApprovedContentPlan(campaignId);
    if ('error' in planResult) return planResult;
    const plan = planResult.plan;

    const deliverables = plan.deliverables.map((deliverable) => {
      const current = this.getCurrent(campaignId, deliverable.contentKey);
      const approved = this.isDeliverableApproved(campaignId, deliverable.contentKey);
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
    });

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

  private nextVersion(campaignId: string, contentKey: string): number {
    const row = db.prepare(`
      SELECT MAX(version) as max_v FROM creative_artifacts WHERE campaign_id = ? AND content_key = ?
    `).get(campaignId, contentKey) as { max_v: number | null };
    return (row.max_v ?? 0) + 1;
  }

  persistFromStructured(
    campaignId: string,
    contentKey: string,
    rawContent: Record<string, unknown>,
    options?: { previous?: CreativeContent | null; targetHint?: string },
  ): { artifact: CreativeArtifact } | CreativeServiceError {
    const ctxResult = creativeGenerationContextBuilder.build(campaignId, contentKey);
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

    const version = this.nextVersion(campaignId, contentKey);
    const id = `cart_${randomUUID()}`;
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE creative_artifacts SET is_current = 0
        WHERE campaign_id = ? AND content_key = ?
      `).run(campaignId, contentKey);

      db.prepare(`
        INSERT INTO creative_artifacts
          (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
           content_key, deliverable_id, version, status, is_current, channel, content_type, format,
           title, content, quality, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'READY_FOR_REVIEW', 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        campaignContext.workspace.id,
        campaignId,
        approvedContentPlan.id,
        approvedContentPlan.version,
        contentKey,
        deliverable.id,
        version,
        deliverable.channel,
        deliverable.contentType,
        deliverable.format,
        deliverable.title,
        JSON.stringify(content),
        JSON.stringify(quality),
        now,
        now,
      );
    });
    tx();

    return { artifact: this.getById(id, campaignId)! };
  }

  async generateOne(campaignId: string, contentKey: string): Promise<{ artifact: CreativeArtifact } | CreativeServiceError> {
    const planResult = contentPlannerService.resolveApprovedContentPlan(campaignId);
    if ('error' in planResult) return planResult;

    const ctxResult = creativeGenerationContextBuilder.build(campaignId, contentKey);
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
      return this.persistFromStructured(campaignId, contentKey, parseJson(rawJson));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Creative generation failed. (${message})`, code: 'GENERATION_FAILED' };
    }
  }

  async generateAllMissing(campaignId: string): Promise<{
    results: { contentKey: string; artifact?: CreativeArtifact; error?: string; code?: string }[];
  } | CreativeServiceError> {
    const summary = this.getSummary(campaignId);
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

    const current = this.getCurrent(campaignId, contentKey);
    if (!current) return { error: 'No creative exists to revise.', code: 'NOT_FOUND' };

    const ctxResult = creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;

    const ai = this.aiFactory();
    if (!ai) return { error: 'AI creative generation is not configured.', code: 'AI_UNAVAILABLE' };

    const revId = `crev_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO creative_revision_requests
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, source_version, request_text, target_hint, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)
    `).run(
      revId,
      ctxResult.campaignContext.workspace.id,
      campaignId,
      contentKey,
      current.id,
      current.version,
      requestText,
      targetHint ?? null,
      now,
      now,
    );

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(true),
        userPrompt: buildUserPrompt(ctxResult, current, requestText, targetHint),
        model: aiEnv.revisionModel,
        maxTokens: 8192,
      });

      const result = this.persistFromStructured(campaignId, contentKey, parseJson(rawJson), {
        previous: current.content,
        targetHint,
      });

      if ('error' in result) {
        db.prepare(`UPDATE creative_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), revId);
        return result;
      }

      db.prepare(`
        UPDATE creative_revision_requests
        SET status = 'APPLIED', resulting_artifact_id = ?, resulting_version = ?, updated_at = ?
        WHERE id = ?
      `).run(result.artifact.id, result.artifact.version, new Date().toISOString(), revId);

      return result;
    } catch (err) {
      db.prepare(`UPDATE creative_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), revId);
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Creative revision failed. (${message})`, code: 'REVISION_FAILED' };
    }
  }

  reviseFromStructured(
    campaignId: string,
    contentKey: string,
    requestText: string,
    rawContent: Record<string, unknown>,
    options?: { targetHint?: string },
  ): { artifact: CreativeArtifact } | CreativeServiceError {
    if (detectPlanningChangeRequest(requestText)) {
      return { error: 'Planning change required.', code: 'PLANNING_CHANGE_REQUIRED' };
    }

    const current = this.getCurrent(campaignId, contentKey);
    if (!current) return { error: 'No creative exists to revise.', code: 'NOT_FOUND' };

    const ctxResult = creativeGenerationContextBuilder.build(campaignId, contentKey);
    if ('error' in ctxResult) return ctxResult;

    const revId = `crev_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO creative_revision_requests
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, source_version, request_text, target_hint, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)
    `).run(
      revId,
      ctxResult.campaignContext.workspace.id,
      campaignId,
      contentKey,
      current.id,
      current.version,
      requestText,
      options?.targetHint ?? null,
      now,
      now,
    );

    const result = this.persistFromStructured(campaignId, contentKey, rawContent, {
      previous: current.content,
      targetHint: options?.targetHint,
    });

    if ('error' in result) {
      db.prepare(`UPDATE creative_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), revId);
      return result;
    }

    db.prepare(`
      UPDATE creative_revision_requests
      SET status = 'APPLIED', resulting_artifact_id = ?, resulting_version = ?, updated_at = ?
      WHERE id = ?
    `).run(result.artifact.id, result.artifact.version, new Date().toISOString(), revId);

    return result;
  }

  approve(campaignId: string, contentKey: string, creativeArtifactId: string): { error?: string; code?: string } {
    const artifact = this.getById(creativeArtifactId, campaignId);
    if (!artifact || artifact.contentKey !== contentKey) {
      return { error: 'Creative artifact not found', code: 'NOT_FOUND' };
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO creative_approvals
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, content_key) DO UPDATE SET
        creative_artifact_id = excluded.creative_artifact_id,
        approved_version = excluded.approved_version,
        approved_at = excluded.approved_at
    `).run(
      `cappr_${randomUUID()}`,
      artifact.workspaceId,
      campaignId,
      contentKey,
      artifact.id,
      artifact.version,
      now,
      now,
    );

    db.prepare(`UPDATE creative_artifacts SET status = 'APPROVED', updated_at = ? WHERE id = ?`).run(now, artifact.id);
    return {};
  }
}

export const creativeGeneratorService = new CreativeGeneratorService();
export { CreativeGeneratorService };
