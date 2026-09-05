import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import type { AIProvider } from '../../integrations/contracts/AIProvider';
import type { ContentPlan, ContentPlanApproval } from '../../types/contentPlan';
import { campaignPlannerService, type CampaignPlan } from './CampaignPlannerService';
import { contentPlanningContextBuilder, type ContentPlanningContext } from './ContentPlanningContextBuilder';
import {
  type IncomingContentPlanBody,
  ensureContentPlanBodyIds,
  validateAndNormalizeContentPlan,
} from './ContentPlanValidator';

interface ContentPlanRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  source_plan_id: string;
  source_plan_version: number;
  version: number;
  status: string;
  is_current: number;
  body: string;
  created_at: string;
  updated_at: string;
}

function parseBody(row: ContentPlanRow): Pick<ContentPlan, 'summary' | 'concepts' | 'deliverables' | 'cadence'> {
  const body = JSON.parse(row.body) as Pick<ContentPlan, 'summary' | 'concepts' | 'deliverables' | 'cadence'>;
  const withIds = ensureContentPlanBodyIds({
    concepts: body.concepts ?? [],
    deliverables: body.deliverables ?? [],
  });
  return {
    summary: body.summary,
    concepts: withIds.concepts,
    deliverables: withIds.deliverables,
    cadence: body.cadence ?? { phases: [] },
  };
}

function mapRow(row: ContentPlanRow): ContentPlan {
  const body = parseBody(row);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    sourcePlanId: row.source_plan_id,
    sourcePlanVersion: row.source_plan_version,
    version: row.version,
    summary: body.summary,
    concepts: body.concepts,
    deliverables: body.deliverables,
    cadence: body.cadence,
    status: row.status as ContentPlan['status'],
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export type ContentPlanServiceError = { error: string; code: string };

class ContentPlannerService {
  constructor(private readonly aiFactory: () => AIProvider | null = getAIProvider) {}

  getCurrent(campaignId: string): ContentPlan | null {
    const row = db
      .prepare('SELECT * FROM content_plans WHERE campaign_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1')
      .get(campaignId) as ContentPlanRow | undefined;
    return row ? mapRow(row) : null;
  }

  getById(contentPlanId: string, campaignId: string): ContentPlan | null {
    const row = db
      .prepare('SELECT * FROM content_plans WHERE id = ? AND campaign_id = ?')
      .get(contentPlanId, campaignId) as ContentPlanRow | undefined;
    return row ? mapRow(row) : null;
  }

  getAllVersions(campaignId: string): ContentPlan[] {
    const rows = db
      .prepare('SELECT * FROM content_plans WHERE campaign_id = ? ORDER BY version DESC')
      .all(campaignId) as ContentPlanRow[];
    return rows.map(mapRow);
  }

  getApproval(campaignId: string): ContentPlanApproval | null {
    const row = db
      .prepare('SELECT * FROM content_plan_approvals WHERE campaign_id = ?')
      .get(campaignId) as {
        campaign_id: string;
        content_plan_id: string;
        content_plan_version: number;
        approved_at: string;
      } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentPlanId: row.content_plan_id,
      contentPlanVersion: row.content_plan_version,
      approvedAt: row.approved_at,
    };
  }

  async resolveApprovedStrategy(campaignId: string): Promise<{ plan: CampaignPlan } | ContentPlanServiceError> {
    const approved = await campaignPlannerService.getApprovedPlan(campaignId);
    if (!approved) {
      return { error: 'Approve the campaign strategy before creating the content plan.', code: 'STRATEGY_NOT_APPROVED' };
    }
    return { plan: approved };
  }

  getApprovedContentPlan(campaignId: string): ContentPlan | null {
    const approval = this.getApproval(campaignId);
    if (!approval) return null;
    const plan = this.getById(approval.contentPlanId, campaignId);
    if (!plan) return null;
    if (plan.version !== approval.contentPlanVersion) return null;
    return plan;
  }

  resolveApprovedContentPlan(campaignId: string): { plan: ContentPlan } | ContentPlanServiceError {
    const approved = this.getApprovedContentPlan(campaignId);
    if (!approved) {
      return { error: 'Approve the Content Plan before generating creative.', code: 'CONTENT_PLAN_NOT_APPROVED' };
    }
    return { plan: approved };
  }

  private persistVersion(
    campaignId: string,
    workspaceId: string,
    version: number,
    status: ContentPlan['status'],
    normalized: Omit<ContentPlan, 'id' | 'workspaceId' | 'campaignId' | 'version' | 'status' | 'isCurrent' | 'createdAt' | 'updatedAt'>,
  ): ContentPlan {
    const id = `cplan_${randomUUID()}`;
    const now = new Date().toISOString();
    const body = JSON.stringify({
      summary: normalized.summary,
      concepts: normalized.concepts,
      deliverables: normalized.deliverables,
      cadence: normalized.cadence,
    });

    const tx = db.transaction(() => {
      db.prepare('UPDATE content_plans SET is_current = 0 WHERE campaign_id = ?').run(campaignId);
      db.prepare(`
        INSERT INTO content_plans
          (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        id,
        workspaceId,
        campaignId,
        normalized.sourcePlanId,
        normalized.sourcePlanVersion,
        version,
        status,
        body,
        now,
        now,
      );
    });
    tx();

    return this.getById(id, campaignId)!;
  }

  private nextVersion(campaignId: string): number {
    const row = db
      .prepare('SELECT MAX(version) as max_v FROM content_plans WHERE campaign_id = ?')
      .get(campaignId) as { max_v: number | null };
    return (row.max_v ?? 0) + 1;
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

    const previous = this.getCurrent(campaignId);
    const validated = validateAndNormalizeContentPlan({
      body,
      expectedSourcePlanId: strategy.plan.id,
      expectedSourcePlanVersion: strategy.plan.version,
      previous,
    });

    if ('errors' in validated) {
      return { error: `Content plan is invalid and was not saved. ${validated.errors.join('; ')}`, code: 'VALIDATION_FAILED' };
    }

    const version = this.nextVersion(campaignId);
    const plan = this.persistVersion(
      campaignId,
      ctx.campaignContext.workspace.id,
      version,
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

    const existing = this.getCurrent(campaignId);

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
        db.prepare('UPDATE content_plans SET is_current = 1 WHERE id = ?').run(existing.id);
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

    const current = this.getCurrent(campaignId);
    if (!current) return { error: 'No content plan exists to revise.', code: 'NO_CONTENT_PLAN' };

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const revId = `cprev_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_plan_revision_requests
        (id, workspace_id, campaign_id, from_content_plan_id, from_content_plan_version, request_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)
    `).run(revId, ctx.campaignContext.workspace.id, campaignId, current.id, current.version, requestText, now, now);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(true),
        userPrompt: buildUserPrompt(ctx, requestText, current),
        model: aiEnv.revisionModel,
        maxTokens: 8192,
      });
      const data = parseJson(rawJson);
      const result = await this.persistFromStructured(campaignId, data);
      if ('error' in result) {
        db.prepare(`UPDATE content_plan_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), revId);
        return result;
      }

      db.prepare(`
        UPDATE content_plan_revision_requests
        SET status = 'APPLIED', resulting_content_plan_id = ?, resulting_content_plan_version = ?, updated_at = ?
        WHERE id = ?
      `).run(result.plan.id, result.plan.version, new Date().toISOString(), revId);

      db.prepare(`UPDATE content_plans SET status = 'READY_FOR_REVIEW', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), result.plan.id);

      return result;
    } catch (err) {
      db.prepare(`UPDATE content_plan_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), revId);
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Content plan revision could not be completed. Version ${current.version} is unchanged. (${message})`, code: 'REVISION_FAILED' };
    }
  }

  async reviseFromStructured(
    campaignId: string,
    requestText: string,
    body: IncomingContentPlanBody,
  ): Promise<{ plan: ContentPlan } | ContentPlanServiceError> {
    const current = this.getCurrent(campaignId);
    if (!current) return { error: 'No content plan exists to revise.', code: 'NO_CONTENT_PLAN' };

    const strategy = await this.resolveApprovedStrategy(campaignId);
    if ('error' in strategy) return strategy;

    const ctx = await contentPlanningContextBuilder.build(campaignId, strategy.plan);
    if (!ctx) return { error: 'Campaign not found', code: 'NOT_FOUND' };

    const revId = `cprev_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_plan_revision_requests
        (id, workspace_id, campaign_id, from_content_plan_id, from_content_plan_version, request_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)
    `).run(revId, ctx.campaignContext.workspace.id, campaignId, current.id, current.version, requestText, now, now);

    const result = await this.persistFromStructured(campaignId, body);
    if ('error' in result) {
      db.prepare(`UPDATE content_plan_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), revId);
      return result;
    }

    db.prepare(`
      UPDATE content_plan_revision_requests
      SET status = 'APPLIED', resulting_content_plan_id = ?, resulting_content_plan_version = ?, updated_at = ?
      WHERE id = ?
    `).run(result.plan.id, result.plan.version, new Date().toISOString(), revId);

    return result;
  }

  approve(campaignId: string, contentPlanId: string): { error?: string; code?: string } {
    const plan = this.getById(contentPlanId, campaignId);
    if (!plan) return { error: 'Content plan not found', code: 'NOT_FOUND' };

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_plan_approvals
        (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        content_plan_id = excluded.content_plan_id,
        content_plan_version = excluded.content_plan_version,
        approved_at = excluded.approved_at
    `).run(`cp_approval_${randomUUID()}`, campaignId, plan.workspaceId, plan.id, plan.version, now, now);

    db.prepare(`UPDATE content_plans SET status = 'APPROVED', updated_at = ? WHERE id = ?`).run(now, plan.id);

    return {};
  }
}

export const contentPlannerService = new ContentPlannerService();
export { ContentPlannerService };
