import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import { campaignContextBuilder, type CampaignContext } from './CampaignContextBuilder';

export interface CampaignChannelRecommendation {
  channel: string;
  role: string;
  rationale: string;
}

export interface CampaignContentRecommendation {
  contentType: string;
  channel: string;
  format: string;
  quantity: number;
  purpose: string;
}

export interface CampaignPlan {
  id: string;
  campaignId: string;
  workspaceId: string;
  version: number;
  status: string;
  isCurrent: boolean;
  strategy: {
    campaignAngle: string;
    coreMessage: string;
    proposition: string;
    audienceFocus: string;
  };
  hooks: {
    primary: string;
    supporting: string[];
  };
  proofPoints: string[];
  callToAction: {
    primary: string;
    alternatives: string[];
  };
  channels: CampaignChannelRecommendation[];
  contentMix: CampaignContentRecommendation[];
  cadence: {
    summary: string;
    duration: string | null;
  };
  creativeDirection: {
    visualDirection: string;
    photographyDirection: string | null;
    videoDirection: string | null;
    copyDirection: string;
  };
  measurement: {
    objective: string;
    primaryKpi: string;
    supportingKpis: string[];
    conversionEvent: string | null;
  };
  rationale: {
    summary: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface PlanRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  version: number;
  status: string;
  is_current: number;
  strategy_campaign_angle: string | null;
  strategy_core_message: string | null;
  strategy_proposition: string | null;
  strategy_audience_focus: string | null;
  hooks: string;
  proof_points: string;
  cta_primary: string | null;
  cta_alternatives: string;
  channels: string;
  content_mix: string;
  cadence_summary: string | null;
  cadence_duration: string | null;
  creative_visual_direction: string | null;
  creative_photography_direction: string | null;
  creative_video_direction: string | null;
  creative_copy_direction: string | null;
  measurement_objective: string | null;
  measurement_primary_kpi: string | null;
  measurement_supporting_kpis: string;
  measurement_conversion_event: string | null;
  rationale_summary: string | null;
  created_at: string;
  updated_at: string;
}

function mapPlanRow(r: PlanRow): CampaignPlan {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    workspaceId: r.workspace_id,
    version: r.version,
    status: r.status,
    isCurrent: r.is_current === 1,
    strategy: {
      campaignAngle: r.strategy_campaign_angle ?? '',
      coreMessage:   r.strategy_core_message   ?? '',
      proposition:   r.strategy_proposition    ?? '',
      audienceFocus: r.strategy_audience_focus ?? '',
    },
    hooks: JSON.parse(r.hooks || '{"primary":"","supporting":[]}') as CampaignPlan['hooks'],
    proofPoints: JSON.parse(r.proof_points || '[]') as string[],
    callToAction: {
      primary:      r.cta_primary      ?? '',
      alternatives: JSON.parse(r.cta_alternatives || '[]') as string[],
    },
    channels:   JSON.parse(r.channels   || '[]') as CampaignChannelRecommendation[],
    contentMix: JSON.parse(r.content_mix || '[]') as CampaignContentRecommendation[],
    cadence: {
      summary:  r.cadence_summary  ?? '',
      duration: r.cadence_duration ?? null,
    },
    creativeDirection: {
      visualDirection:       r.creative_visual_direction       ?? '',
      photographyDirection:  r.creative_photography_direction  ?? null,
      videoDirection:        r.creative_video_direction        ?? null,
      copyDirection:         r.creative_copy_direction         ?? '',
    },
    measurement: {
      objective:        r.measurement_objective    ?? '',
      primaryKpi:       r.measurement_primary_kpi  ?? '',
      supportingKpis:   JSON.parse(r.measurement_supporting_kpis || '[]') as string[],
      conversionEvent:  r.measurement_conversion_event ?? null,
    },
    rationale: {
      summary: r.rationale_summary ?? '',
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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
    ...(brand.language.bannedWords   ?? []),
    ...(brand.language.bannedPhrases ?? []),
  ].filter(Boolean);

  const lines: string[] = [
    '=== WORKSPACE ===',
    `Name: ${ctx.workspace.name}`,
    '',
    '=== BRAND IDENTITY ===',
    brand.identity.description ? `Description: ${brand.identity.description}` : '',
    brand.identity.market      ? `Market: ${brand.identity.market}` : '',
    '',
    '=== TARGET AUDIENCE ===',
    brand.audience.primaryAudience ? `Who: ${brand.audience.primaryAudience}` : '',
    brand.audience.problems?.length ? `Problems: ${brand.audience.problems.join(', ')}` : '',
    brand.audience.desires?.length  ? `Desires: ${brand.audience.desires.join(', ')}` : '',
    brand.audience.needs?.length    ? `Needs: ${brand.audience.needs.join(', ')}` : '',
    '',
    '=== BRAND PERSONALITY ===',
    brand.personality.archetype  ? `Archetype: ${brand.personality.archetype}` : '',
    brand.personality.traits?.length ? `Traits: ${brand.personality.traits.join(', ')}` : '',
    brand.personality.principles?.length ? `Principles: ${brand.personality.principles.join(', ')}` : '',
    '',
    '=== BRAND LANGUAGE ===',
    brand.language.preferredWords?.length   ? `Preferred words: ${brand.language.preferredWords.join(', ')}` : '',
    brand.language.preferredPhrases?.length ? `Preferred phrases: ${brand.language.preferredPhrases.join(', ')}` : '',
    bannedLanguage.length ? `BANNED — never use: ${bannedLanguage.join(', ')}` : '',
    brand.language.ctaStyle  ? `CTA style: ${brand.language.ctaStyle}` : '',
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
    if (ctx.brief.sourceSummary)       lines.push(`Source: ${ctx.brief.sourceSummary}`);
    if (ctx.brief.objectiveSummary)    lines.push(`Objective context: ${ctx.brief.objectiveSummary}`);
    if (ctx.brief.audienceDescription) lines.push(`Audience: ${ctx.brief.audienceDescription}`);
    if (ctx.brief.audienceProblem)     lines.push(`Audience problem: ${ctx.brief.audienceProblem}`);
    if (ctx.brief.audienceDesire)      lines.push(`Audience desire: ${ctx.brief.audienceDesire}`);
    if (ctx.brief.proposition)         lines.push(`Proposition: ${ctx.brief.proposition}`);
    if (ctx.brief.offerDescription)    lines.push(`Offer: ${ctx.brief.offerDescription}`);
    if (ctx.brief.offerValue)          lines.push(`Offer value: ${ctx.brief.offerValue}`);
    if (ctx.brief.offerUrgency)        lines.push(`Urgency: ${ctx.brief.offerUrgency}`);
    if (ctx.brief.timingStartDate)     lines.push(`Start date: ${ctx.brief.timingStartDate}`);
    if (ctx.brief.timingEndDate)       lines.push(`End date: ${ctx.brief.timingEndDate}`);
    if (ctx.brief.keyDetails.length)   lines.push(`Key details: ${ctx.brief.keyDetails.join(', ')}`);
    if (ctx.brief.additionalContext)   lines.push(`Additional context: ${ctx.brief.additionalContext}`);
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

function storePlan(campaignId: string, workspaceId: string, version: number, data: Record<string, unknown>): PlanRow {
  const id = `plan_${randomUUID()}`;
  const now = new Date().toISOString();

  const strategy = (data.strategy ?? {}) as Record<string, unknown>;
  const hooks     = (data.hooks    ?? { primary: '', supporting: [] }) as object;
  const cta       = (data.callToAction ?? {}) as Record<string, unknown>;
  const cadence   = (data.cadence      ?? {}) as Record<string, unknown>;
  const creative  = (data.creativeDirection ?? {}) as Record<string, unknown>;
  const measurement = (data.measurement ?? {}) as Record<string, unknown>;
  const rationale   = (data.rationale   ?? {}) as Record<string, unknown>;

  db.prepare(`
    INSERT INTO campaign_plans
      (id, campaign_id, workspace_id, version, status, is_current,
       strategy_campaign_angle, strategy_core_message, strategy_proposition, strategy_audience_focus,
       hooks, proof_points, cta_primary, cta_alternatives,
       channels, content_mix,
       cadence_summary, cadence_duration,
       creative_visual_direction, creative_photography_direction,
       creative_video_direction, creative_copy_direction,
       measurement_objective, measurement_primary_kpi, measurement_supporting_kpis, measurement_conversion_event,
       rationale_summary,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, 'READY_FOR_REVIEW', 1,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?,
            ?, ?)
  `).run(
    id, campaignId, workspaceId, version,
    (strategy.campaignAngle as string | null) ?? null,
    (strategy.coreMessage   as string | null) ?? null,
    (strategy.proposition   as string | null) ?? null,
    (strategy.audienceFocus as string | null) ?? null,
    JSON.stringify(hooks),
    JSON.stringify(data.proofPoints ?? []),
    (cta.primary as string | null) ?? null,
    JSON.stringify(cta.alternatives ?? []),
    JSON.stringify(data.channels   ?? []),
    JSON.stringify(data.contentMix ?? []),
    (cadence.summary  as string | null) ?? null,
    (cadence.duration as string | null) ?? null,
    (creative.visualDirection      as string | null) ?? null,
    (creative.photographyDirection as string | null) ?? null,
    (creative.videoDirection       as string | null) ?? null,
    (creative.copyDirection        as string | null) ?? null,
    (measurement.objective       as string | null) ?? null,
    (measurement.primaryKpi      as string | null) ?? null,
    JSON.stringify(measurement.supportingKpis ?? []),
    (measurement.conversionEvent as string | null) ?? null,
    (rationale.summary as string | null) ?? null,
    now, now,
  );

  return db.prepare('SELECT * FROM campaign_plans WHERE id = ?').get(id) as PlanRow;
}

class CampaignPlannerService {
  isAvailable(): boolean {
    return aiEnv.isConfigured;
  }

  getCurrentPlan(campaignId: string): CampaignPlan | null {
    const row = db
      .prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1')
      .get(campaignId) as PlanRow | undefined;
    return row ? mapPlanRow(row) : null;
  }

  getAllVersions(campaignId: string): CampaignPlan[] {
    const rows = db
      .prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? ORDER BY version DESC')
      .all(campaignId) as PlanRow[];
    return rows.map(mapPlanRow);
  }

  async generate(campaignId: string): Promise<{ plan: CampaignPlan } | { error: string }> {
    const ai = getAIProvider();
    if (!ai) {
      return { error: 'AI planning is not configured. Add AI_PROVIDER and the corresponding API key to .env to enable campaign planning.' };
    }

    const ctx = campaignContextBuilder.build(campaignId);
    if (!ctx) return { error: 'Campaign not found' };

    // Determine next version number
    const existing = db
      .prepare('SELECT MAX(version) as max_v FROM campaign_plans WHERE campaign_id = ?')
      .get(campaignId) as { max_v: number | null };
    const nextVersion = (existing.max_v ?? 0) + 1;

    // Mark all current plans as not current
    db.prepare('UPDATE campaign_plans SET is_current = 0 WHERE campaign_id = ?').run(campaignId);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(ctx, false),
        userPrompt:   buildUserPrompt(ctx),
        model: aiEnv.campaignModel,
        maxTokens: 4096,
      });

      const data = parsePlanJson(rawJson);
      const row  = storePlan(campaignId, ctx.workspace.id, nextVersion, data);

      // Advance campaign status to READY_FOR_REVIEW
      db.prepare(`UPDATE campaigns SET status = 'READY_FOR_REVIEW', updated_at = ? WHERE id = ? AND status = 'DRAFTING'`)
        .run(new Date().toISOString(), campaignId);

      return { plan: mapPlanRow(row) };
    } catch (err) {
      // Restore previous current plan on failure
      db.prepare('UPDATE campaign_plans SET is_current = 1 WHERE campaign_id = ? AND version = (SELECT MAX(version) FROM campaign_plans WHERE campaign_id = ? AND id != (SELECT id FROM campaign_plans WHERE campaign_id = ? ORDER BY version DESC LIMIT 1))')
        .run(campaignId, campaignId, campaignId);
      const prevRow = db.prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? ORDER BY version DESC LIMIT 1').get(campaignId) as PlanRow | undefined;
      if (prevRow) db.prepare('UPDATE campaign_plans SET is_current = 1 WHERE id = ?').run(prevRow.id);

      const message = err instanceof Error ? err.message : String(err);
      return { error: `Campaign planning could not be completed. Your campaign is safe. (${message})` };
    }
  }

  async revise(campaignId: string, revisionRequest: string): Promise<{ plan: CampaignPlan } | { error: string }> {
    const ai = getAIProvider();
    if (!ai) return { error: 'AI planning is not configured.' };

    const ctx = campaignContextBuilder.build(campaignId);
    if (!ctx) return { error: 'Campaign not found' };

    const currentPlan = this.getCurrentPlan(campaignId);
    if (!currentPlan) return { error: 'No plan exists to revise. Generate a plan first.' };

    const fromPlanId      = currentPlan.id;
    const fromPlanVersion = currentPlan.version;
    const nextVersion     = fromPlanVersion + 1;

    // Store revision request
    const revId = `rev_${randomUUID()}`;
    const now   = new Date().toISOString();
    db.prepare(`
      INSERT INTO revision_requests
        (id, campaign_id, workspace_id, from_plan_id, from_plan_version, request_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)
    `).run(revId, campaignId, ctx.workspace.id, fromPlanId, fromPlanVersion, revisionRequest, now, now);

    // Update campaign status to REVISING
    db.prepare(`UPDATE campaigns SET status = 'REVISING', updated_at = ? WHERE id = ?`)
      .run(now, campaignId);

    // Deactivate current plan
    db.prepare('UPDATE campaign_plans SET is_current = 0 WHERE campaign_id = ?').run(campaignId);

    try {
      const rawJson = await ai.generateStructured({
        systemPrompt: buildSystemPrompt(ctx, true),
        userPrompt:   buildUserPrompt(ctx, revisionRequest),
        model: aiEnv.revisionModel,
        maxTokens: 4096,
      });

      const data = parsePlanJson(rawJson);
      const row  = storePlan(campaignId, ctx.workspace.id, nextVersion, data);

      // Update revision request status
      db.prepare('UPDATE revision_requests SET status = \'APPLIED\', updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), revId);

      // Advance campaign status
      db.prepare(`UPDATE campaigns SET status = 'READY_FOR_APPROVAL', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), campaignId);

      return { plan: mapPlanRow(row) };
    } catch (err) {
      // Restore previous plan
      db.prepare('UPDATE campaign_plans SET is_current = 1 WHERE id = ?').run(fromPlanId);
      db.prepare('UPDATE revision_requests SET status = \'FAILED\', updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), revId);
      db.prepare(`UPDATE campaigns SET status = 'READY_FOR_REVIEW', updated_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), campaignId);

      const message = err instanceof Error ? err.message : String(err);
      return { error: `Campaign revision could not be completed. Your plan is safe. (${message})` };
    }
  }

  approvePlan(campaignId: string, planId: string): { error?: string } {
    const plan = db.prepare('SELECT * FROM campaign_plans WHERE id = ? AND campaign_id = ?')
      .get(planId, campaignId) as PlanRow | undefined;

    if (!plan) return { error: 'Plan not found' };

    const now = new Date().toISOString();

    // Upsert approval record
    db.prepare(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        approved_plan_id = excluded.approved_plan_id,
        approved_version = excluded.approved_version,
        approved_at = excluded.approved_at
    `).run(`approval_${randomUUID()}`, campaignId, plan.workspace_id, planId, plan.version, now, now);

    // Update plan status
    db.prepare('UPDATE campaign_plans SET status = \'APPROVED\', updated_at = ? WHERE id = ?')
      .run(now, planId);

    // Advance campaign lifecycle
    db.prepare(`UPDATE campaigns SET status = 'APPROVED', updated_at = ? WHERE id = ?`)
      .run(now, campaignId);

    return {};
  }

  getApproval(campaignId: string): { approvedPlanId: string; approvedVersion: number; approvedAt: string } | null {
    const row = db
      .prepare('SELECT * FROM plan_approvals WHERE campaign_id = ?')
      .get(campaignId) as { approved_plan_id: string; approved_version: number; approved_at: string } | undefined;
    if (!row) return null;
    return { approvedPlanId: row.approved_plan_id, approvedVersion: row.approved_version, approvedAt: row.approved_at };
  }
}

export const campaignPlannerService = new CampaignPlannerService();
