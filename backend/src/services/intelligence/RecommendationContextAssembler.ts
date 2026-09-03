import { createHash } from 'crypto';
import { db } from '../../db/database';
import { marketingKnowledgeService } from './MarketingKnowledgeService';
import { channelStrategyService } from './ChannelStrategyService';
import { campaignPerformanceService } from '../performance/CampaignPerformanceService';
import type {
  RecommendationContext,
  RecommendationInventoryItem,
} from '../../types/marketingRecommendations';
import type { ChannelKey } from '../../types/marketing';

interface EntityRow { id: string; name: string }

interface SourceRow {
  id: string;
  title: string;
  price_amount: number | null;
  price_currency: string | null;
  occurred_at: string | null;
  payload: string;
  usage_status: string;
}

interface ScheduledRow {
  id: string;
  scheduled_for: string;
  channel: string;
  status: string;
}

interface RecentArtifactRow {
  id: string;
  marketing_scope: string | null;
  content_type: string;
  created_at: string;
  source_record_ids: string;
}

interface PerfCampaignRow { id: string }

interface DismissalRow {
  recommendation_type: string;
  dismissal_count: number;
}

interface ObjectiveRow {
  id: string;
  name: string;
  objective_type: string;
  primary_kpi: string;
}

const INVENTORY_TOP = 5;

function mapSourceRow(row: SourceRow): RecommendationInventoryItem {
  const payload = JSON.parse(row.payload || '{}') as Record<string, unknown>;
  return {
    id: row.id,
    title: row.title,
    brand: (payload.brand as string | null) ?? null,
    price: row.price_amount,
    currency: row.price_currency,
    marketingBucket: bucketFromOccurredAt(row.occurred_at),
    usageStatus: row.usage_status,
    occurredAt: row.occurred_at,
  };
}

function bucketFromOccurredAt(occurredAt: string | null): 'NEW' | 'CURRENT' | 'SALE' | null {
  if (!occurredAt) return null;
  const ageDays = (Date.now() - new Date(occurredAt).getTime()) / 86400000;
  if (isNaN(ageDays)) return null;
  return ageDays < 7 ? 'NEW' : ageDays < 28 ? 'CURRENT' : 'SALE';
}

function resolveActiveObjective(workspaceId: string): ObjectiveRow | null {
  // 1. Custom workspace objective (most recently created)
  const custom = db.prepare(`
    SELECT id, name, objective_type, primary_kpi FROM objectives
    WHERE workspace_id = ? AND is_active = 1
    ORDER BY created_at DESC LIMIT 1
  `).get(workspaceId) as ObjectiveRow | undefined;
  if (custom) return custom;

  // 2. Most recently used in a campaign for this workspace
  const fromCampaign = db.prepare(`
    SELECT o.id, o.name, o.objective_type, o.primary_kpi
    FROM objectives o
    JOIN campaigns c ON c.objective_id = o.id
    WHERE c.workspace_id = ? AND o.is_active = 1
    ORDER BY c.created_at DESC LIMIT 1
  `).get(workspaceId) as ObjectiveRow | undefined;
  if (fromCampaign) return fromCampaign;

  // 3. Any active system objective
  const system = db.prepare(`
    SELECT id, name, objective_type, primary_kpi FROM objectives
    WHERE workspace_id IS NULL AND is_active = 1
    ORDER BY name ASC LIMIT 1
  `).get() as ObjectiveRow | undefined;
  return system ?? null;
}

function listInventory(workspaceId: string, filter: string, limit: number): RecommendationInventoryItem[] {
  const conditions = [`sr.workspace_id = ?`, `sr.availability = 'AVAILABLE'`];
  const params: unknown[] = [workspaceId];

  if (filter === 'new_arrivals') {
    conditions.push(`sr.occurred_at IS NOT NULL`);
    conditions.push(`(julianday('now') - julianday(sr.occurred_at)) < 7`);
  } else if (filter === 'current') {
    conditions.push(`sr.occurred_at IS NOT NULL`);
    conditions.push(`(julianday('now') - julianday(sr.occurred_at)) >= 7`);
    conditions.push(`(julianday('now') - julianday(sr.occurred_at)) < 28`);
  } else if (filter === 'sale') {
    conditions.push(`sr.occurred_at IS NOT NULL`);
    conditions.push(`(julianday('now') - julianday(sr.occurred_at)) >= 28`);
  }

  const USAGE_SQL = `CASE
    WHEN SUM(CASE WHEN sc.status = 'PUBLISHED' THEN 1 ELSE 0 END) > 0 THEN 'PUBLISHED'
    WHEN SUM(CASE WHEN sc.status IN ('SCHEDULED','READY','PUBLISHING','BLOCKED') THEN 1 ELSE 0 END) > 0 THEN 'SCHEDULED'
    WHEN COUNT(csl.creative_artifact_id) > 0 THEN 'USED_IN_DRAFT'
    ELSE 'NEVER_FEATURED' END`;

  const having = filter === 'not_featured' ? `HAVING ${USAGE_SQL} = 'NEVER_FEATURED'` : '';

  const rows = db.prepare(`
    SELECT sr.id, sr.title, sr.price_amount, sr.price_currency, sr.occurred_at, sr.payload,
      ${USAGE_SQL} usage_status
    FROM source_records sr
    LEFT JOIN creative_source_links csl ON csl.source_record_id = sr.id
    LEFT JOIN creative_artifacts ca ON ca.id = csl.creative_artifact_id AND ca.workspace_id = sr.workspace_id
    LEFT JOIN scheduled_content_items sc ON sc.source_creative_artifact_id = ca.id AND sc.workspace_id = sr.workspace_id
    WHERE ${conditions.join(' AND ')}
    GROUP BY sr.id ${having}
    ORDER BY COALESCE(sr.occurred_at, sr.created_at) DESC
    LIMIT ?
  `).all(...params, limit) as SourceRow[];

  return rows.map(mapSourceRow);
}

class RecommendationContextAssembler {
  assemble(workspaceId: string): RecommendationContext {
    const entity = db.prepare('SELECT id, name FROM entities WHERE id = ?').get(workspaceId) as EntityRow | undefined;
    const workspaceName = entity?.name ?? workspaceId;

    // Brand knowledge (selective domains)
    const brandKnowledge = marketingKnowledgeService.read(workspaceId, [
      'BRAND_CORE', 'AUDIENCE', 'POSITIONING', 'VOICE',
      'CONTENT_PILLARS', 'MARKETING_RULES', 'CHANNEL_STRATEGY', 'CREATIVE_PREFERENCES',
    ]);

    // Active objective
    const objRow = resolveActiveObjective(workspaceId);
    const activeObjective = objRow
      ? { id: objRow.id, name: objRow.name, objectiveType: objRow.objective_type, primaryKpi: objRow.primary_kpi }
      : null;

    // Inventory signals
    const newArrivals = listInventory(workspaceId, 'new_arrivals', INVENTORY_TOP);
    const currentStock = listInventory(workspaceId, 'current', INVENTORY_TOP);
    const saleItems = listInventory(workspaceId, 'sale', INVENTORY_TOP);
    const unfeaturedItems = listInventory(workspaceId, 'not_featured', INVENTORY_TOP);

    // Calendar signals — next 7 days
    const nowTs = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const endTs = nowTs + sevenDays;

    const scheduledRows = db.prepare(`
      SELECT id, scheduled_for, channel, status
      FROM scheduled_content_items
      WHERE workspace_id = ?
        AND status IN ('SCHEDULED','READY','PUBLISHING')
        AND scheduled_for >= ? AND scheduled_for <= ?
    `).all(workspaceId,
      todayStart.toISOString(),
      new Date(endTs).toISOString(),
    ) as ScheduledRow[];

    const scheduledToday = scheduledRows.filter(r =>
      r.scheduled_for >= todayStart.toISOString() && r.scheduled_for < tomorrowStart.toISOString()
    ).length;

    const channelsScheduledThisWeek = [...new Set(scheduledRows.map(r => r.channel))];

    // Find days in next 7 with no content
    const scheduledByDay = new Set<number>();
    for (const r of scheduledRows) {
      const d = new Date(r.scheduled_for);
      const dayOffset = Math.floor((d.getTime() - todayStart.getTime()) / 86400000);
      scheduledByDay.add(dayOffset);
    }
    const nextEmptyDayOffsets: number[] = [];
    for (let i = 0; i < 7; i++) {
      if (!scheduledByDay.has(i)) nextEmptyDayOffsets.push(i);
    }

    // Channel strategy
    const strategy = channelStrategyService.get(workspaceId);
    const enabledChannels = Object.entries(strategy ?? {})
      .filter(([, cfg]) => cfg?.enabled)
      .sort(([, a], [, b]) => {
        const rank = { PRIMARY: 0, SECONDARY: 1, EXPERIMENTAL: 2 };
        return (rank[a!.priority] ?? 99) - (rank[b!.priority] ?? 99);
      })
      .map(([key]) => key as ChannelKey);

    const primary: ChannelKey = enabledChannels[0] ?? 'instagram';
    const secondary: ChannelKey[] = enabledChannels.slice(1);

    // Recent content — last 14 days
    const recentArtifacts = db.prepare(`
      SELECT ca.id, ca.marketing_scope, ca.content_type, ca.created_at,
        COALESCE(json_group_array(csl.source_record_id), '[]') AS source_record_ids
      FROM campaigns c
      JOIN creative_artifacts ca ON ca.campaign_id = c.id AND ca.workspace_id = c.workspace_id
      LEFT JOIN creative_source_links csl ON csl.creative_artifact_id = ca.id
      WHERE c.workspace_id = ?
        AND ca.created_at >= datetime('now', '-14 days')
      GROUP BY ca.id
      ORDER BY ca.created_at DESC LIMIT 20
    `).all(workspaceId) as RecentArtifactRow[];

    let productPostCount = 0;
    let founderPostCount = 0;
    let editorialPostCount = 0;
    const recentlyFeaturedProductIds: string[] = [];
    const recentScopes: string[] = [];
    const recentContentTypes: string[] = [];

    for (const a of recentArtifacts) {
      const scope = a.marketing_scope ?? '';
      if (scope) recentScopes.push(scope);
      recentContentTypes.push(a.content_type);

      if (scope === 'FOUNDER') founderPostCount++;
      else if (scope === 'EDITORIAL') editorialPostCount++;
      else productPostCount++;

      try {
        const ids = JSON.parse(a.source_record_ids) as string[];
        for (const id of ids) {
          if (id && !recentlyFeaturedProductIds.includes(id)) {
            recentlyFeaturedProductIds.push(id);
          }
        }
      } catch { /* ignore */ }
    }

    // Performance signals — up to 2 recent campaigns
    let highPerformingCampaign: RecommendationContext['highPerformingCampaign'] = null;
    let recentUnderperformingCampaign = false;

    const recentCampaigns = db.prepare(`
      SELECT id FROM campaigns
      WHERE workspace_id = ? AND status NOT IN ('CANCELLED','ARCHIVED','DRAFTING')
      ORDER BY created_at DESC LIMIT 2
    `).all(workspaceId) as PerfCampaignRow[];

    for (const { id } of recentCampaigns) {
      try {
        const perf = campaignPerformanceService.getSummary(id, workspaceId);
        if ('error' in perf) continue;
        if (perf.classification === 'HIGH_PERFORMING' && !highPerformingCampaign) {
          highPerformingCampaign = { id, kpi: perf.primaryKpi ?? 'engagement' };
        } else if (perf.classification === 'BELOW_AVERAGE' || perf.classification === 'AVERAGE') {
          recentUnderperformingCampaign = true;
        }
      } catch { /* performance absence is safe */ }
    }

    // Recent recommendation dismissals (last 30 days)
    const recentDismissals = db.prepare(`
      SELECT recommendation_type, COUNT(*) AS dismissal_count
      FROM marketing_recommendations
      WHERE workspace_id = ? AND status = 'DISMISSED'
        AND dismissed_at >= datetime('now', '-30 days')
      GROUP BY recommendation_type
    `).all(workspaceId) as DismissalRow[];

    // Compute context signature for cache/dedup
    const sigParts = [
      ...newArrivals.map(i => i.id).sort(),
      ...unfeaturedItems.map(i => i.id).sort(),
      ...scheduledRows.map(r => r.id).sort(),
      activeObjective?.id ?? 'none',
    ];
    const contextSignature = createHash('sha256').update(sigParts.join(':')).digest('hex');

    return {
      workspaceId,
      workspaceName,
      brandKnowledge,
      activeObjective,
      inventory: { newArrivals, currentStock, saleItems, unfeaturedItems },
      calendar: {
        scheduledToday,
        scheduledThisWeek: scheduledRows.length,
        channelsScheduledThisWeek,
        nextEmptyDayOffsets,
      },
      channels: { primary, secondary },
      recentContent: {
        productPostCount,
        founderPostCount,
        editorialPostCount,
        recentlyFeaturedProductIds,
        recentScopes,
        recentContentTypes,
      },
      highPerformingCampaign,
      recentUnderperformingCampaign,
      recentDismissals: recentDismissals.map(r => ({ type: r.recommendation_type, count: r.dismissal_count })),
      contextSignature,
    };
  }
}

export const recommendationContextAssembler = new RecommendationContextAssembler();
export { RecommendationContextAssembler };
