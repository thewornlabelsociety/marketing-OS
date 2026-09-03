import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiOrchestrator } from './AIOrchestrator';
import { aiEnv } from '../../config/aiEnvironment';
import { recommendationContextAssembler } from './RecommendationContextAssembler';
import type {
  MarketingRecommendation,
  MarketingRecommendationRow,
  RecommendationContext,
  RecommendationGenerationResult,
  RecommendationType,
  RecommendationContentType,
  RecommendationCreativeDirection,
} from '../../types/marketingRecommendations';
import type { MarketingAIBrief, MarketingScope, ChannelKey } from '../../types/marketing';

// ─── Expiry windows ───────────────────────────────────────────────────────────

const EXPIRY_DAYS: Record<string, number> = {
  FEATURE_NEW_ARRIVALS: 7,
  FEATURE_CURRENT_STOCK: 7,
  SALE_EDIT: 7,
  REACTIVATE_UNFEATURED: 7,
  AMPLIFY_HIGH_PERFORMER: 7,
  FOUNDER_CONTENT: 7,
  EDITORIAL_CONTENT: 7,
  LOCAL_SHOP_CONTENT: 7,
  FILL_CALENDAR_GAP: 3,
  REDUCE_POSTING_FREQUENCY: 1,
};

// ─── ISO helpers ─────────────────────────────────────────────────────────────

function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

function computeFingerprint(
  workspaceId: string,
  type: RecommendationType,
  marketingScopes: MarketingScope[],
  contentType: string | null | undefined,
  sourceProductIds: string[],
): string {
  const isWeekly = ['FOUNDER_CONTENT', 'EDITORIAL_CONTENT', 'LOCAL_SHOP_CONTENT'].includes(type);
  const isDaily = type === 'REDUCE_POSTING_FREQUENCY';

  let key: string;
  if (isDaily) {
    key = `${workspaceId}:${type}:${isoDay()}`;
  } else if (isWeekly) {
    key = `${workspaceId}:${type}:${contentType ?? ''}:${isoWeek()}`;
  } else {
    key = [
      workspaceId,
      type,
      [...marketingScopes].sort().join(','),
      contentType ?? '',
      [...sourceProductIds].sort().join(','),
    ].join(':');
  }
  return createHash('sha256').update(key).digest('hex');
}

// ─── DB mapping ──────────────────────────────────────────────────────────────

function rowToPublic(row: MarketingRecommendationRow): MarketingRecommendation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fingerprint: row.fingerprint,
    status: row.status as MarketingRecommendation['status'],
    recommendationType: row.recommendation_type as RecommendationType,
    generationSource: row.generation_source as MarketingRecommendation['generationSource'],
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    priority: row.priority,
    confidence: row.confidence ?? undefined,
    marketingScopes: JSON.parse(row.marketing_scopes_json || '[]') as MarketingScope[],
    objectiveId: row.objective_id,
    primaryChannel: row.primary_channel as ChannelKey,
    secondaryChannels: JSON.parse(row.secondary_channels_json || '[]') as ChannelKey[],
    contentType: row.content_type as RecommendationContentType | null,
    creativeDirection: row.creative_direction as RecommendationCreativeDirection | null,
    sourceProductIds: JSON.parse(row.source_product_ids_json || '[]') as string[],
    sourceSellerIds: JSON.parse(row.source_seller_ids_json || '[]') as string[],
    hook: row.hook,
    angle: row.angle,
    cta: row.cta,
    talkingPoints: row.talking_points_json ? JSON.parse(row.talking_points_json) as string[] : null,
    suggestedDurationSeconds: row.suggested_duration_seconds,
    acceptedCampaignId: row.accepted_campaign_id,
    acceptedArtifactId: row.accepted_artifact_id,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    dismissedAt: row.dismissed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── AI prompt builder ────────────────────────────────────────────────────────

function buildBrief(workspaceId: string, ctx: RecommendationContext): MarketingAIBrief {
  const candidateProducts = [
    ...ctx.inventory.newArrivals,
    ...ctx.inventory.currentStock,
    ...ctx.inventory.saleItems,
    ...ctx.inventory.unfeaturedItems,
  ];
  // Deduplicate candidate IDs
  const seenIds = new Set<string>();
  const uniqueCandidates = candidateProducts.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  const candidateLines = uniqueCandidates.map(p =>
    `  - ID:${p.id} | ${p.title}${p.brand ? ` (${p.brand})` : ''}${p.price != null ? ` | ${p.currency ?? 'NZD'}${p.price}` : ''} | bucket:${p.marketingBucket ?? 'unknown'} | featured:${p.usageStatus}`
  ).join('\n');

  const systemPrompt = `You are the marketing expert for ${ctx.workspaceName}.
Your role: recommend what content to create next based on inventory, calendar, and business context.
Generate 1–3 recommendations. Return ONLY a valid JSON array.
Never invent product IDs — use only the candidate IDs provided.
All channels must be from: instagram, facebook, email, tiktok, sms, website, marketplace.
All scopes must be from: BRAND, SHOP, MARKETPLACE, SHOP_MARKETPLACE, FOUNDER, EDITORIAL.
All recommendation types must be one of:
  FEATURE_NEW_ARRIVALS, FEATURE_CURRENT_STOCK, SALE_EDIT, REACTIVATE_UNFEATURED,
  AMPLIFY_HIGH_PERFORMER, FOUNDER_CONTENT, EDITORIAL_CONTENT, LOCAL_SHOP_CONTENT,
  FILL_CALENDAR_GAP, REDUCE_POSTING_FREQUENCY.
Content types: STATIC_POST, CAROUSEL, STORY, EMAIL, TALKING_POINTS.
Creative directions: EDITORIAL, PRODUCT_LED, MINIMAL, or null.

JSON schema for each recommendation:
{
  "recommendation_type": "string",
  "title": "string",
  "summary": "string — one sentence",
  "rationale": "string — 2-3 sentences",
  "priority": integer 0-100,
  "confidence": float 0-1,
  "marketing_scopes": ["string"],
  "primary_channel": "string",
  "secondary_channels": ["string"],
  "content_type": "string",
  "creative_direction": "string or null",
  "source_product_ids": ["<id from candidate list only>"],
  "hook": "string or null",
  "angle": "string or null",
  "cta": "string or null",
  "talking_points": ["string"] or null,
  "suggested_duration_seconds": integer or null
}`;

  const perfLines: string[] = [];
  if (ctx.highPerformingCampaign) {
    perfLines.push(`A recent campaign is HIGH_PERFORMING (KPI: ${ctx.highPerformingCampaign.kpi}). Consider adapting a proven approach.`);
  }
  if (ctx.recentUnderperformingCampaign) {
    perfLines.push(`A recent campaign is UNDERPERFORMING. Consider variety — founder or editorial content.`);
  }

  const dismissalLines = ctx.recentDismissals.length > 0
    ? `Recently dismissed: ${ctx.recentDismissals.map(d => `${d.type} (${d.count}x)`).join(', ')}. Avoid repeating these where possible.`
    : '';

  const userPrompt = `=== BUSINESS CONTEXT ===
Workspace: ${ctx.workspaceName}
Objective: ${ctx.activeObjective ? `${ctx.activeObjective.name} (${ctx.activeObjective.objectiveType}) — KPI: ${ctx.activeObjective.primaryKpi}` : 'No objective configured'}
Primary channel: ${ctx.channels.primary}
Secondary channels: ${ctx.channels.secondary.join(', ') || 'none'}

=== BRAND KNOWLEDGE ===
${JSON.stringify(ctx.brandKnowledge, null, 2)}

=== INVENTORY ===
New arrivals (< 7 days): ${ctx.inventory.newArrivals.length} items
Current stock (7–28 days): ${ctx.inventory.currentStock.length} items
Sale items (> 28 days): ${ctx.inventory.saleItems.length} items
Never-featured available: ${ctx.inventory.unfeaturedItems.length} items

Candidate products (use only these IDs):
${candidateLines || '  (none available)'}

=== CALENDAR ===
Scheduled today: ${ctx.calendar.scheduledToday}
Scheduled this week: ${ctx.calendar.scheduledThisWeek}
Channels scheduled this week: ${ctx.calendar.channelsScheduledThisWeek.join(', ') || 'none'}
Days with no content in next 7: ${ctx.calendar.nextEmptyDayOffsets.length > 0 ? ctx.calendar.nextEmptyDayOffsets.join(', ') : 'none — calendar looks full'}

=== RECENT CONTENT (last 14 days) ===
Product posts: ${ctx.recentContent.productPostCount}
Founder posts: ${ctx.recentContent.founderPostCount}
Editorial posts: ${ctx.recentContent.editorialPostCount}
Recently featured product IDs: ${ctx.recentContent.recentlyFeaturedProductIds.slice(0, 10).join(', ') || 'none'}

=== PERFORMANCE ===
${perfLines.join('\n') || 'No reliable performance data yet.'}

=== OPERATOR FEEDBACK ===
${dismissalLines || 'No recent dismissals.'}

Generate recommendations now. Return ONLY the JSON array.`;

  return {
    workspaceId,
    taskType: 'MARKETING_RECOMMENDATION',
    scope: 'SHOP',
    knowledgeDomains: ['BRAND_CORE', 'AUDIENCE', 'VOICE', 'CONTENT_PILLARS', 'CHANNEL_STRATEGY'],
    systemPrompt,
    userPrompt,
    model: aiEnv.campaignModel,
    maxTokens: 3000,
  };
}

// ─── AI output validation ────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>([
  'FEATURE_NEW_ARRIVALS','FEATURE_CURRENT_STOCK','SALE_EDIT','REACTIVATE_UNFEATURED',
  'AMPLIFY_HIGH_PERFORMER','FOUNDER_CONTENT','EDITORIAL_CONTENT','LOCAL_SHOP_CONTENT',
  'FILL_CALENDAR_GAP','REDUCE_POSTING_FREQUENCY',
]);
const VALID_CHANNELS = new Set<string>(['instagram','facebook','email','tiktok','sms','website','marketplace']);
const VALID_SCOPES = new Set<string>(['BRAND','SHOP','MARKETPLACE','SHOP_MARKETPLACE','FOUNDER','EDITORIAL']);
const VALID_CONTENT_TYPES = new Set<string>(['STATIC_POST','CAROUSEL','STORY','EMAIL','TALKING_POINTS']);
const VALID_DIRECTIONS = new Set<string>(['EDITORIAL','PRODUCT_LED','MINIMAL']);

function validateAndNormalise(
  raw: unknown,
  ctx: RecommendationContext,
  objectiveId: string | null,
): Omit<MarketingRecommendation, 'id'|'workspaceId'|'fingerprint'|'status'|'generationSource'|'createdAt'|'updatedAt'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const type = r['recommendation_type'];
  if (typeof type !== 'string' || !VALID_TYPES.has(type)) return null;

  const primaryChannel = r['primary_channel'];
  if (typeof primaryChannel !== 'string' || !VALID_CHANNELS.has(primaryChannel)) return null;

  const rawScopes = Array.isArray(r['marketing_scopes']) ? r['marketing_scopes'] : [];
  const marketingScopes = (rawScopes as unknown[]).filter(s => typeof s === 'string' && VALID_SCOPES.has(s)) as MarketingScope[];
  if (marketingScopes.length === 0) marketingScopes.push('SHOP');

  const rawSecondary = Array.isArray(r['secondary_channels']) ? r['secondary_channels'] : [];
  const secondaryChannels = (rawSecondary as unknown[]).filter(s => typeof s === 'string' && VALID_CHANNELS.has(s)) as ChannelKey[];

  const contentType = typeof r['content_type'] === 'string' && VALID_CONTENT_TYPES.has(r['content_type'])
    ? r['content_type'] as RecommendationContentType
    : null;

  const dir = r['creative_direction'];
  const creativeDirection = typeof dir === 'string' && VALID_DIRECTIONS.has(dir)
    ? dir as RecommendationCreativeDirection
    : null;

  // Validate source product IDs against candidate set
  const candidateIdSet = new Set([
    ...ctx.inventory.newArrivals.map(i => i.id),
    ...ctx.inventory.currentStock.map(i => i.id),
    ...ctx.inventory.saleItems.map(i => i.id),
    ...ctx.inventory.unfeaturedItems.map(i => i.id),
  ]);
  const rawProductIds = Array.isArray(r['source_product_ids']) ? r['source_product_ids'] : [];
  const sourceProductIds = (rawProductIds as unknown[]).filter(id => typeof id === 'string' && candidateIdSet.has(id)) as string[];

  // Product-type recommendations need products
  const needsProducts = !['FOUNDER_CONTENT','EDITORIAL_CONTENT','REDUCE_POSTING_FREQUENCY','FILL_CALENDAR_GAP'].includes(type as string);
  if (needsProducts && sourceProductIds.length === 0) return null;

  const title = typeof r['title'] === 'string' && r['title'].trim() ? r['title'] : null;
  if (!title) return null;

  const summary = typeof r['summary'] === 'string' && r['summary'].trim() ? r['summary'] : title;
  const rationale = typeof r['rationale'] === 'string' && r['rationale'].trim() ? r['rationale'] : summary;

  const priority = typeof r['priority'] === 'number' ? Math.max(0, Math.min(100, r['priority'])) : 50;
  const confidence = typeof r['confidence'] === 'number' ? Math.max(0, Math.min(1, r['confidence'])) : undefined;

  const hook = typeof r['hook'] === 'string' ? r['hook'] : null;
  const angle = typeof r['angle'] === 'string' ? r['angle'] : null;
  const cta = typeof r['cta'] === 'string' ? r['cta'] : null;
  const rawTalkingPoints = Array.isArray(r['talking_points']) ? r['talking_points'] : null;
  const talkingPoints = rawTalkingPoints
    ? (rawTalkingPoints as unknown[]).filter(tp => typeof tp === 'string') as string[]
    : null;
  const suggestedDurationSeconds = typeof r['suggested_duration_seconds'] === 'number' ? r['suggested_duration_seconds'] : null;

  // Only AMPLIFY_HIGH_PERFORMER is allowed when a high performer exists
  if (type === 'AMPLIFY_HIGH_PERFORMER' && !ctx.highPerformingCampaign) return null;

  return {
    recommendationType: type as RecommendationType,
    title,
    summary,
    rationale,
    priority,
    confidence,
    marketingScopes,
    objectiveId,
    primaryChannel: primaryChannel as ChannelKey,
    secondaryChannels,
    contentType,
    creativeDirection,
    sourceProductIds,
    sourceSellerIds: [],
    hook,
    angle,
    cta,
    talkingPoints: talkingPoints && talkingPoints.length > 0 ? talkingPoints : null,
    suggestedDurationSeconds,
    acceptedCampaignId: null,
    acceptedArtifactId: null,
    expiresAt: null,
    acceptedAt: null,
    dismissedAt: null,
    completedAt: null,
  };
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function generateRuleBasedRecommendations(ctx: RecommendationContext, objectiveId: string | null): Array<ReturnType<typeof validateAndNormalise>> {
  const results: Array<ReturnType<typeof validateAndNormalise>> = [];

  // Rule 1: REDUCE_POSTING_FREQUENCY — already have enough today
  if (ctx.calendar.scheduledToday >= 3) {
    results.push({
      recommendationType: 'REDUCE_POSTING_FREQUENCY',
      title: "You're covered for today",
      summary: "Plenty of content is already scheduled — no need to publish more today.",
      rationale: `You have ${ctx.calendar.scheduledToday} posts scheduled today. Consistent quality matters more than volume.`,
      priority: 90,
      marketingScopes: ['SHOP'],
      objectiveId,
      primaryChannel: ctx.channels.primary,
      secondaryChannels: [],
      contentType: null,
      creativeDirection: null,
      sourceProductIds: [],
      sourceSellerIds: [],
      hook: null, angle: null, cta: null, talkingPoints: null, suggestedDurationSeconds: null,
      acceptedCampaignId: null, acceptedArtifactId: null,
      expiresAt: null, acceptedAt: null, dismissedAt: null, completedAt: null,
    });
    return results;
  }

  // Rule 2: FEATURE_NEW_ARRIVALS
  if (ctx.inventory.newArrivals.length >= 3 && ctx.calendar.scheduledToday <= 0) {
    const products = ctx.inventory.newArrivals.slice(0, 3);
    results.push({
      recommendationType: 'FEATURE_NEW_ARRIVALS',
      title: `New this week — ${products[0].title}${products.length > 1 ? ` + ${products.length - 1} more` : ''}`,
      summary: "Fresh inventory has arrived and hasn't been featured yet.",
      rationale: `${ctx.inventory.newArrivals.length} new items arrived in the last 7 days. Feature them while they're fresh.`,
      priority: 85,
      marketingScopes: ['SHOP'],
      objectiveId,
      primaryChannel: ctx.channels.primary,
      secondaryChannels: ctx.channels.secondary.slice(0, 1),
      contentType: 'CAROUSEL',
      creativeDirection: 'PRODUCT_LED',
      sourceProductIds: products.map(p => p.id),
      sourceSellerIds: [],
      hook: null, angle: null, cta: 'Shop now — link in bio', talkingPoints: null, suggestedDurationSeconds: null,
      acceptedCampaignId: null, acceptedArtifactId: null,
      expiresAt: null, acceptedAt: null, dismissedAt: null, completedAt: null,
    });
  }

  // Rule 3: FILL_CALENDAR_GAP / REACTIVATE_UNFEATURED
  if (ctx.calendar.nextEmptyDayOffsets.length >= 3 && ctx.inventory.unfeaturedItems.length >= 5) {
    const products = ctx.inventory.unfeaturedItems
      .filter(p => !ctx.recentContent.recentlyFeaturedProductIds.includes(p.id))
      .slice(0, 4);
    if (products.length >= 2) {
      results.push({
        recommendationType: 'FILL_CALENDAR_GAP',
        title: `Fill the gap — ${products.length} pieces haven't been featured yet`,
        summary: "Good inventory is going unnoticed. Give these pieces their moment.",
        rationale: `${ctx.calendar.nextEmptyDayOffsets.length} days this week have no scheduled content, and ${ctx.inventory.unfeaturedItems.length} available items have never been featured.`,
        priority: 75,
        marketingScopes: ['SHOP'],
        objectiveId,
        primaryChannel: ctx.channels.primary,
        secondaryChannels: [],
        contentType: 'CAROUSEL',
        creativeDirection: null,
        sourceProductIds: products.map(p => p.id),
        sourceSellerIds: [],
        hook: null, angle: null, cta: 'Shop the edit', talkingPoints: null, suggestedDurationSeconds: null,
        acceptedCampaignId: null, acceptedArtifactId: null,
        expiresAt: null, acceptedAt: null, dismissedAt: null, completedAt: null,
      });
    }
  }

  // Rule 4: SALE_EDIT
  if (ctx.inventory.saleItems.length >= 3 && results.length < 2) {
    const products = ctx.inventory.saleItems.slice(0, 3);
    results.push({
      recommendationType: 'SALE_EDIT',
      title: `The sale edit — ${products.length} pieces at reduced prices`,
      summary: "Long-running inventory deserves a focused moment in the spotlight.",
      rationale: `${ctx.inventory.saleItems.length} pieces have been in the shop for 28+ days. A curated edit keeps the shop feeling active.`,
      priority: 70,
      marketingScopes: ['SHOP'],
      objectiveId,
      primaryChannel: ctx.channels.primary,
      secondaryChannels: [],
      contentType: 'CAROUSEL',
      creativeDirection: 'PRODUCT_LED',
      sourceProductIds: products.map(p => p.id),
      sourceSellerIds: [],
      hook: null, angle: null, cta: 'Shop the sale edit', talkingPoints: null, suggestedDurationSeconds: null,
      acceptedCampaignId: null, acceptedArtifactId: null,
      expiresAt: null, acceptedAt: null, dismissedAt: null, completedAt: null,
    });
  }

  // Rule 5: FOUNDER_CONTENT — if product-heavy recently
  if (ctx.recentContent.productPostCount >= 4 && ctx.recentContent.founderPostCount === 0 && results.length < 2) {
    results.push({
      recommendationType: 'FOUNDER_CONTENT',
      title: "Your voice — time for a founder perspective",
      summary: "Recent content has been product-heavy. A personal note from you adds balance.",
      rationale: `The last ${ctx.recentContent.productPostCount} posts have all been product-focused. Founder content builds connection and trust.`,
      priority: 65,
      marketingScopes: ['FOUNDER'],
      objectiveId,
      primaryChannel: ctx.channels.primary,
      secondaryChannels: [],
      contentType: 'TALKING_POINTS',
      creativeDirection: null,
      sourceProductIds: [],
      sourceSellerIds: [],
      hook: "Something I've been thinking about lately...",
      angle: "A personal observation about the shop or the season",
      cta: null,
      talkingPoints: [
        "What I've been noticing through the shop this week",
        "A piece that caught my eye and why",
        "A thought on how I shop and style pre-loved",
        "A question for my audience",
      ],
      suggestedDurationSeconds: 45,
      acceptedCampaignId: null, acceptedArtifactId: null,
      expiresAt: null, acceptedAt: null, dismissedAt: null, completedAt: null,
    });
  }

  return results.slice(0, 3);
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const INSERT_SQL = `
  INSERT INTO marketing_recommendations
    (id, workspace_id, fingerprint, status, recommendation_type, generation_source,
     title, summary, rationale, priority, confidence,
     marketing_scopes_json, objective_id, primary_channel, secondary_channels_json,
     content_type, creative_direction, source_product_ids_json, source_seller_ids_json,
     hook, angle, cta, talking_points_json, suggested_duration_seconds,
     expires_at, created_at, updated_at)
  VALUES (?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(workspace_id, fingerprint) DO NOTHING
`;

const REFRESH_EXPIRED_SQL = `
  UPDATE marketing_recommendations
  SET status = 'NEW', title = ?, summary = ?, rationale = ?, priority = ?,
      content_type = ?, creative_direction = ?, source_product_ids_json = ?,
      hook = ?, angle = ?, cta = ?, talking_points_json = ?,
      expires_at = ?, updated_at = ?
  WHERE workspace_id = ? AND fingerprint = ? AND status = 'EXPIRED'
`;

// ─── Service ──────────────────────────────────────────────────────────────────

class MarketingExpertService {
  /** Exposed for testing: builds the AI brief from assembled context. */
  buildBrief(workspaceId: string, ctx: RecommendationContext): MarketingAIBrief {
    return buildBrief(workspaceId, ctx);
  }

  /** List active recommendations for a workspace. */
  listRecommendations(workspaceId: string, status?: string): MarketingRecommendation[] {
    const statuses = status ? [status] : ['NEW', 'ACCEPTED'];
    const placeholders = statuses.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM marketing_recommendations
      WHERE workspace_id = ? AND status IN (${placeholders})
      ORDER BY priority DESC, created_at DESC
    `).all(workspaceId, ...statuses) as MarketingRecommendationRow[];
    return rows.map(rowToPublic);
  }

  /** Dismiss a recommendation. Returns false if not found or wrong workspace. */
  dismissRecommendation(id: string, workspaceId: string): boolean {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE marketing_recommendations
      SET status = 'DISMISSED', dismissed_at = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND status = 'NEW'
    `).run(now, now, id, workspaceId);
    return result.changes > 0;
  }

  /** Expire stale NEW recommendations past their expires_at. Returns count expired. */
  expireStale(workspaceId: string): number {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE marketing_recommendations
      SET status = 'EXPIRED', updated_at = ?
      WHERE workspace_id = ? AND status = 'NEW' AND expires_at IS NOT NULL AND expires_at < ?
    `).run(now, workspaceId, now);
    return result.changes;
  }

  /** Main generation entry point. */
  async generateRecommendations(workspaceId: string): Promise<RecommendationGenerationResult> {
    const expiredCount = this.expireStale(workspaceId);
    const ctx = recommendationContextAssembler.assemble(workspaceId);

    // Check context signature for cache
    const budgetRow = db.prepare(`
      SELECT last_recommendation_context_sig, last_recommendation_generated_at
      FROM workspace_ai_budget WHERE workspace_id = ?
    `).get(workspaceId) as {
      last_recommendation_context_sig: string | null;
      last_recommendation_generated_at: string | null;
    } | undefined;

    const lastSig = budgetRow?.last_recommendation_context_sig ?? null;
    const lastGenAt = budgetRow?.last_recommendation_generated_at
      ? new Date(budgetRow.last_recommendation_generated_at).getTime()
      : 0;
    const oneHourMs = 60 * 60 * 1000;
    const isCached = lastSig === ctx.contextSignature && (Date.now() - lastGenAt) < oneHourMs;

    if (isCached) {
      const existing = this.listRecommendations(workspaceId, 'NEW');
      if (existing.length > 0) {
        const nextAllowedAt = new Date(lastGenAt + oneHourMs).toISOString();
        return {
          recommendations: existing,
          generationSource: existing[0].generationSource,
          createdCount: 0,
          reusedCount: existing.length,
          expiredCount,
          cached: true,
          nextAllowedAt,
        };
      }
    }

    // Generate
    type ValidCandidate = NonNullable<ReturnType<typeof validateAndNormalise>>;
    let rawCandidates: ValidCandidate[] = [];
    let generationSource: 'AI' | 'RULE_BASED' = 'RULE_BASED';

    const objectiveId = ctx.activeObjective?.id ?? null;

    if (aiOrchestrator.isAvailable()) {
      try {
        const brief = buildBrief(workspaceId, ctx);
        const result = await aiOrchestrator.generate(brief);
        const parsed = JSON.parse(result.content) as unknown[];
        rawCandidates = (Array.isArray(parsed) ? parsed : [])
          .map(item => validateAndNormalise(item, ctx, objectiveId))
          .filter((v): v is ValidCandidate => v !== null)
          .slice(0, 3);
        if (rawCandidates.length > 0) generationSource = 'AI';
      } catch (err) {
        console.warn('[MarketingExpertService] AI generation failed, falling back to rules:', (err as Error).message);
      }
    }

    // Fall back to rule-based if needed
    if (rawCandidates.length === 0) {
      rawCandidates = generateRuleBasedRecommendations(ctx, objectiveId)
        .filter((v): v is ValidCandidate => v !== null);
      generationSource = 'RULE_BASED';
    }

    // Persist
    const now = new Date().toISOString();
    let createdCount = 0;
    let reusedCount = 0;

    for (const candidate of rawCandidates) {
      const fp = computeFingerprint(
        workspaceId,
        candidate.recommendationType,
        candidate.marketingScopes,
        candidate.contentType ?? null,
        candidate.sourceProductIds,
      );

      const expiryDays = EXPIRY_DAYS[candidate.recommendationType] ?? 7;
      const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();
      const id = `rec_${randomUUID()}`;

      const existing = db.prepare(`
        SELECT id, status FROM marketing_recommendations WHERE workspace_id = ? AND fingerprint = ?
      `).get(workspaceId, fp) as { id: string; status: string } | undefined;

      if (existing && existing.status === 'EXPIRED') {
        db.prepare(REFRESH_EXPIRED_SQL).run(
          candidate.title, candidate.summary, candidate.rationale, candidate.priority,
          candidate.contentType ?? null, candidate.creativeDirection ?? null,
          JSON.stringify(candidate.sourceProductIds),
          candidate.hook ?? null, candidate.angle ?? null, candidate.cta ?? null,
          candidate.talkingPoints ? JSON.stringify(candidate.talkingPoints) : null,
          expiresAt, now,
          workspaceId, fp,
        );
        reusedCount++;
      } else if (!existing) {
        db.prepare(INSERT_SQL).run(
          id, workspaceId, fp,
          candidate.recommendationType, generationSource,
          candidate.title, candidate.summary, candidate.rationale, candidate.priority,
          candidate.confidence ?? null,
          JSON.stringify(candidate.marketingScopes),
          candidate.objectiveId ?? null,
          candidate.primaryChannel,
          JSON.stringify(candidate.secondaryChannels),
          candidate.contentType ?? null,
          candidate.creativeDirection ?? null,
          JSON.stringify(candidate.sourceProductIds),
          JSON.stringify(candidate.sourceSellerIds),
          candidate.hook ?? null, candidate.angle ?? null, candidate.cta ?? null,
          candidate.talkingPoints ? JSON.stringify(candidate.talkingPoints) : null,
          candidate.suggestedDurationSeconds ?? null,
          expiresAt, now, now,
        );
        createdCount++;
      } else {
        reusedCount++;
      }
    }

    // Update context sig and generation timestamp
    db.prepare(`
      INSERT INTO workspace_ai_budget (id, workspace_id, monthly_limit_usd, alert_threshold_pct,
        last_recommendation_context_sig, last_recommendation_generated_at, created_at, updated_at)
      VALUES (?, ?, 10.0, 80, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        last_recommendation_context_sig = excluded.last_recommendation_context_sig,
        last_recommendation_generated_at = excluded.last_recommendation_generated_at,
        updated_at = excluded.updated_at
    `).run(`aibud_${randomUUID()}`, workspaceId, ctx.contextSignature, now, now, now);

    const recommendations = this.listRecommendations(workspaceId, 'NEW');
    return { recommendations, generationSource, createdCount, reusedCount, expiredCount, cached: false };
  }
}

export const marketingExpertService = new MarketingExpertService();
export { MarketingExpertService, computeFingerprint, buildBrief };
