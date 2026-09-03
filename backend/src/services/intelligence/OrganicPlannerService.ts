import { db } from '../../db/database';
import type { MarketingScope, ChannelKey } from '../../types/marketing';
import { channelStrategyService } from './ChannelStrategyService';
import { DEFAULT_SCHEDULE_TIMEZONE } from '../publishing/publishingUtils';

// ─── Public types ─────────────────────────────────────────────────────────────

export type OrganicContentClass =
  | 'FOUNDER' | 'EDITORIAL' | 'SHOP' | 'MARKETPLACE' | 'PRODUCT' | 'BRAND' | 'OTHER';

export type OrganicItemState =
  | 'PUBLISHED' | 'SCHEDULED' | 'PREPARED_CREATIVE' | 'PROPOSED_IDEA';

export type OrganicSignalType =
  | 'PRODUCT_HEAVY_RUN' | 'FOUNDER_GAP' | 'EDITORIAL_GAP'
  | 'REPEATED_DIRECTION' | 'BACK_TO_BACK_CAROUSELS'
  | 'NO_UPCOMING_CONTENT' | 'LONG_POSTING_GAP' | 'CHANNEL_DISABLED';

export interface OrganicPlanItem {
  id: string;
  state: OrganicItemState;
  channel: string;
  classification: OrganicContentClass;
  marketingScopes: MarketingScope[];
  title: string | null;
  contentType: string | null;
  creativeDirection: string | null;
  effectiveTimestamp: string | null;
  mediaAssetId: string | null;
  imageUrls: string[];
  artifactId: string | null;
  scheduleId: string | null;
  recommendationId: string | null;
  campaignId: string | null;
  sourceProductIds: string[];
  hook: string | null;
  angle: string | null;
  recommendationType: string | null;
}

export interface OrganicPlanSignal {
  type: OrganicSignalType;
  severity: 'INFO' | 'WARNING';
  message: string;
  gapDays?: number;
}

export interface OrganicChannelIntelligence {
  channel: string;
  enabled: boolean;
  recentClassifications: OrganicContentClass[];
  upcomingClassifications: OrganicContentClass[];
  preparedClassifications: OrganicContentClass[];
  scheduledDensity: number;
  activeSignalTypes: string[];
  largestGapDays: number | null;
  hasUpcomingContent: boolean;
}

export interface OrganicIntelligenceSummary {
  primaryChannel: string;
  channels: OrganicChannelIntelligence[];
  computedAt: string;
}

export interface OrganicPlanResult {
  channel: string;
  channelStrategy: {
    enabled: boolean;
    priority: 'PRIMARY' | 'SECONDARY' | 'EXPERIMENTAL' | null;
  };
  currentFeed: OrganicPlanItem[];
  plannedFeed: OrganicPlanItem[];
  readyToPlace: OrganicPlanItem[];
  proposedNext: OrganicPlanItem[];
  signals: OrganicPlanSignal[];
  summary: {
    publishedCount: number;
    scheduledCount: number;
    preparedCount: number;
    proposedCount: number;
    largestGapDays: number | null;
    hasUpcomingContent: boolean;
  };
}

// ─── Internal DB row types ────────────────────────────────────────────────────

interface ArtifactScheduleRow {
  schedule_id: string;
  campaign_id: string | null;
  channel: string;
  published_at: string | null;
  scheduled_for: string | null;
  artifact_id: string | null;
  content_type: string | null;
  marketing_scope: string | null;
  creative_direction: string | null;
  media_asset_id: string | null;
  title: string | null;
}

interface PreparedRow {
  artifact_id: string;
  campaign_id: string;
  content_type: string | null;
  marketing_scope: string | null;
  creative_direction: string | null;
  media_asset_id: string | null;
  title: string | null;
  recommendation_id: string | null;
}

interface ProposedRow {
  id: string;
  primary_channel: string;
  secondary_channels_json: string;
  recommendation_type: string;
  content_type: string | null;
  marketing_scopes_json: string;
  source_product_ids_json: string;
  hook: string | null;
  angle: string | null;
  title: string;
  priority: number;
}

interface SourceLinkRow {
  creative_artifact_id: string;
  source_record_id: string;
  image_urls: string;
}

interface MediaAssetIdRow { id: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJsonArray(json: string | null): string[] {
  try {
    const arr = JSON.parse(json ?? '[]');
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch { return []; }
}

function parseSingleScope(scope: string | null): MarketingScope[] {
  if (!scope) return [];
  return [scope as MarketingScope];
}

function parseScopes(json: string | null): MarketingScope[] {
  return parseJsonArray(json) as MarketingScope[];
}

/** Calendar-day gap using the workspace timezone (DST-safe via Intl). */
export function calendarDayGap(startIso: string, endIso: string, timezone: string): number {
  // 'sv-SE' locale yields YYYY-MM-DD, avoiding DST hour-shift distortion
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, dateStyle: 'short' });
  const startDay = fmt.format(new Date(startIso));
  const endDay = fmt.format(new Date(endIso));
  return Math.round((Date.parse(endDay) - Date.parse(startDay)) / 86400000);
}

export function classifyOrganicContent(item: {
  marketingScopes: MarketingScope[];
  contentType: string | null;
  recommendationType: string | null;
  sourceProductIds: string[];
}): OrganicContentClass {
  const { marketingScopes: scopes, contentType, recommendationType: recType, sourceProductIds } = item;
  const hasSources = sourceProductIds.length > 0;
  const hasShop = scopes.some(s => s === 'SHOP' || s === 'SHOP_MARKETPLACE');
  const hasMarketplace = scopes.some(s => s === 'MARKETPLACE' || s === 'SHOP_MARKETPLACE');

  // 1. FOUNDER — highest precedence
  if (scopes.includes('FOUNDER') || contentType === 'TALKING_POINTS' || recType === 'FOUNDER_CONTENT')
    return 'FOUNDER';

  // 2. EDITORIAL
  if (scopes.includes('EDITORIAL') || recType === 'EDITORIAL_CONTENT') return 'EDITORIAL';

  // 3. MARKETPLACE (marketplace scope + product source evidence)
  if (hasMarketplace && hasSources) return 'MARKETPLACE';

  // 4. SHOP (shop scope present, no stronger product/marketplace evidence)
  if (hasShop && !hasSources) return 'SHOP';

  // 5. PRODUCT (explicit product evidence)
  if (hasSources) return 'PRODUCT';
  if (recType && ['FEATURE_NEW_ARRIVALS', 'FEATURE_CURRENT_STOCK', 'SALE_EDIT',
    'REACTIVATE_UNFEATURED', 'AMPLIFY_HIGH_PERFORMER'].includes(recType)) return 'PRODUCT';

  // 6. BRAND
  if (scopes.includes('BRAND')) return 'BRAND';

  // 7. OTHER — null scope, FILL_CALENDAR_GAP without evidence, LOCAL_SHOP_CONTENT, etc.
  return 'OTHER';
}

const MAX_GAP_DAYS = 3;
const CAROUSEL_TYPES = new Set(['CAROUSEL', 'MULTI_IMAGE']);
const UPCOMING_HORIZON_DAYS = 14;

// ─── Service ──────────────────────────────────────────────────────────────────

class OrganicPlannerService {

  // Fetch source record links and image URLs for a set of artifact IDs, workspace-safe.
  private fetchSourceData(
    workspaceId: string,
    artifactIds: string[],
  ): Map<string, { sourceProductIds: string[]; imageUrls: string[] }> {
    const result = new Map<string, { sourceProductIds: string[]; imageUrls: string[] }>();
    if (artifactIds.length === 0) return result;

    const placeholders = artifactIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT csl.creative_artifact_id, csl.source_record_id, sr.image_urls
      FROM creative_source_links csl
      JOIN source_records sr ON sr.id = csl.source_record_id AND sr.workspace_id = ?
      WHERE csl.creative_artifact_id IN (${placeholders})
    `).all(workspaceId, ...artifactIds) as SourceLinkRow[];

    for (const row of rows) {
      if (!result.has(row.creative_artifact_id)) {
        result.set(row.creative_artifact_id, { sourceProductIds: [], imageUrls: [] });
      }
      const entry = result.get(row.creative_artifact_id)!;
      if (!entry.sourceProductIds.includes(row.source_record_id)) {
        entry.sourceProductIds.push(row.source_record_id);
      }
      try {
        const urls = JSON.parse(row.image_urls || '[]') as string[];
        for (const u of urls) {
          if (u && entry.imageUrls.length < 3 && !entry.imageUrls.includes(u)) {
            entry.imageUrls.push(u);
          }
        }
      } catch { /* ignore */ }
    }
    return result;
  }

  // Resolve media asset ID — direct link first, then linked asset table (workspace-safe).
  private resolveMediaAssetId(
    artifactId: string | null,
    workspaceId: string,
    directId: string | null,
  ): string | null {
    if (directId) return directId;
    if (!artifactId) return null;
    const row = db.prepare(`
      SELECT id FROM media_assets
      WHERE creative_artifact_id = ? AND workspace_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(artifactId, workspaceId) as MediaAssetIdRow | undefined;
    return row?.id ?? null;
  }

  private buildItem(
    state: OrganicItemState,
    id: string,
    channel: string,
    scopes: MarketingScope[],
    contentType: string | null,
    recType: string | null,
    creativeDirection: string | null,
    title: string | null,
    effectiveTimestamp: string | null,
    mediaAssetId: string | null,
    imageUrls: string[],
    artifactId: string | null,
    scheduleId: string | null,
    recommendationId: string | null,
    campaignId: string | null,
    sourceProductIds: string[],
    hook: string | null,
    angle: string | null,
  ): OrganicPlanItem {
    return {
      id,
      state,
      channel,
      classification: classifyOrganicContent({ marketingScopes: scopes, contentType, recommendationType: recType, sourceProductIds }),
      marketingScopes: scopes,
      title,
      contentType,
      creativeDirection,
      effectiveTimestamp,
      mediaAssetId,
      imageUrls,
      artifactId,
      scheduleId,
      recommendationId,
      campaignId,
      sourceProductIds,
      hook,
      angle,
      recommendationType: recType,
    };
  }

  getPublishedItems(workspaceId: string, channel: string, lookBackDays: number): OrganicPlanItem[] {
    const since = new Date(Date.now() - lookBackDays * 86400000).toISOString();
    const rows = db.prepare(`
      SELECT
        sci.id AS schedule_id,
        sci.campaign_id,
        sci.channel,
        sci.published_at,
        NULL AS scheduled_for,
        sci.source_creative_artifact_id AS artifact_id,
        ca.content_type,
        ca.marketing_scope,
        ca.creative_direction,
        ca.media_asset_id,
        ca.title
      FROM scheduled_content_items sci
      LEFT JOIN creative_artifacts ca
        ON ca.id = sci.source_creative_artifact_id AND ca.workspace_id = sci.workspace_id
      WHERE sci.workspace_id = ?
        AND UPPER(sci.channel) = UPPER(?)
        AND sci.status = 'PUBLISHED'
        AND sci.published_at >= ?
      ORDER BY sci.published_at DESC
      LIMIT 60
    `).all(workspaceId, channel, since) as ArtifactScheduleRow[];

    const artifactIds = rows.map(r => r.artifact_id).filter(Boolean) as string[];
    const sourceData = this.fetchSourceData(workspaceId, artifactIds);

    return rows.map(row => {
      const sd = sourceData.get(row.artifact_id ?? '') ?? { sourceProductIds: [], imageUrls: [] };
      const scopes = parseSingleScope(row.marketing_scope);
      const mediaAssetId = this.resolveMediaAssetId(row.artifact_id, workspaceId, row.media_asset_id);
      return this.buildItem('PUBLISHED', row.schedule_id, channel.toLowerCase(),
        scopes, row.content_type, null, row.creative_direction, row.title,
        row.published_at, mediaAssetId, sd.imageUrls,
        row.artifact_id, row.schedule_id, null, row.campaign_id, sd.sourceProductIds, null, null);
    });
  }

  getScheduledItems(workspaceId: string, channel: string): OrganicPlanItem[] {
    const rows = db.prepare(`
      SELECT
        sci.id AS schedule_id,
        sci.campaign_id,
        sci.channel,
        NULL AS published_at,
        sci.scheduled_for,
        sci.source_creative_artifact_id AS artifact_id,
        ca.content_type,
        ca.marketing_scope,
        ca.creative_direction,
        ca.media_asset_id,
        ca.title
      FROM scheduled_content_items sci
      LEFT JOIN creative_artifacts ca
        ON ca.id = sci.source_creative_artifact_id AND ca.workspace_id = sci.workspace_id
      WHERE sci.workspace_id = ?
        AND UPPER(sci.channel) = UPPER(?)
        AND sci.status IN ('SCHEDULED','READY','PUBLISHING','BLOCKED')
        AND sci.scheduled_for IS NOT NULL
      ORDER BY sci.scheduled_for ASC
      LIMIT 60
    `).all(workspaceId, channel) as ArtifactScheduleRow[];

    const artifactIds = rows.map(r => r.artifact_id).filter(Boolean) as string[];
    const sourceData = this.fetchSourceData(workspaceId, artifactIds);

    return rows.map(row => {
      const sd = sourceData.get(row.artifact_id ?? '') ?? { sourceProductIds: [], imageUrls: [] };
      const scopes = parseSingleScope(row.marketing_scope);
      const mediaAssetId = this.resolveMediaAssetId(row.artifact_id, workspaceId, row.media_asset_id);
      return this.buildItem('SCHEDULED', row.schedule_id, channel.toLowerCase(),
        scopes, row.content_type, null, row.creative_direction, row.title,
        row.scheduled_for, mediaAssetId, sd.imageUrls,
        row.artifact_id, row.schedule_id, null, row.campaign_id, sd.sourceProductIds, null, null);
    });
  }

  getPreparedItems(workspaceId: string, channel: string): OrganicPlanItem[] {
    const rows = db.prepare(`
      SELECT
        ca.id AS artifact_id,
        ca.campaign_id,
        ca.content_type,
        ca.marketing_scope,
        ca.creative_direction,
        ca.media_asset_id,
        ca.title,
        c.recommendation_id
      FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      INNER JOIN campaigns c ON c.id = ca.campaign_id AND c.workspace_id = ca.workspace_id
      WHERE ca.workspace_id = ?
        AND UPPER(ca.channel) = UPPER(?)
        AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id
            AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED','FAILED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci2
          WHERE sci2.campaign_id = ca.campaign_id
            AND sci2.content_key = ca.content_key
            AND sci2.status = 'FAILED'
            AND EXISTS (
              SELECT 1 FROM publish_attempts pa
              WHERE pa.schedule_id = sci2.id AND pa.status = 'UNKNOWN'
            )
        )
      LIMIT 30
    `).all(workspaceId, channel) as PreparedRow[];

    const artifactIds = rows.map(r => r.artifact_id);
    const sourceData = this.fetchSourceData(workspaceId, artifactIds);

    return rows.map(row => {
      const sd = sourceData.get(row.artifact_id) ?? { sourceProductIds: [], imageUrls: [] };
      const scopes = parseSingleScope(row.marketing_scope);
      const mediaAssetId = this.resolveMediaAssetId(row.artifact_id, workspaceId, row.media_asset_id);
      return this.buildItem('PREPARED_CREATIVE', row.artifact_id, channel.toLowerCase(),
        scopes, row.content_type, null, row.creative_direction, row.title,
        null, mediaAssetId, sd.imageUrls,
        row.artifact_id, null, row.recommendation_id, row.campaign_id, sd.sourceProductIds, null, null);
    });
  }

  getProposedItems(workspaceId: string, channel: string): OrganicPlanItem[] {
    const channelLower = channel.toLowerCase();
    const rows = db.prepare(`
      SELECT
        id, primary_channel, secondary_channels_json,
        recommendation_type, content_type, marketing_scopes_json,
        source_product_ids_json, hook, angle, title, priority
      FROM marketing_recommendations
      WHERE workspace_id = ?
        AND status = 'NEW'
        AND recommendation_type != 'REDUCE_POSTING_FREQUENCY'
      ORDER BY priority ASC, created_at DESC
      LIMIT 20
    `).all(workspaceId) as ProposedRow[];

    return rows
      .filter(row => {
        if (row.primary_channel === channelLower) return true;
        const secondary = parseJsonArray(row.secondary_channels_json);
        return secondary.includes(channelLower);
      })
      .map(row => {
        const scopes = parseScopes(row.marketing_scopes_json);
        const sourceProductIds = parseJsonArray(row.source_product_ids_json);
        return this.buildItem('PROPOSED_IDEA', row.id, channelLower,
          scopes, row.content_type, row.recommendation_type, null, row.title,
          null, null, [],
          null, null, row.id, null, sourceProductIds, row.hook, row.angle);
      });
  }

  private computeLargestGap(items: OrganicPlanItem[], timezone: string): number | null {
    const dated = items
      .filter(i => i.effectiveTimestamp)
      .sort((a, b) => a.effectiveTimestamp!.localeCompare(b.effectiveTimestamp!));
    let largest: number | null = null;
    for (let i = 1; i < dated.length; i++) {
      const gap = calendarDayGap(dated[i - 1].effectiveTimestamp!, dated[i].effectiveTimestamp!, timezone);
      if (largest === null || gap > largest) largest = gap;
    }
    return largest;
  }

  private computeSignals(
    recent: OrganicPlanItem[],
    upcoming: OrganicPlanItem[],
    prepared: OrganicPlanItem[],
    channelEnabled: boolean,
    timezone: string,
  ): OrganicPlanSignal[] {
    if (!channelEnabled) {
      return [{ type: 'CHANNEL_DISABLED', severity: 'INFO', message: 'This channel is currently disabled in your channel strategy.' }];
    }

    const signals: OrganicPlanSignal[] = [];
    const nowIso = new Date().toISOString();
    const horizonIso = new Date(Date.now() + UPCOMING_HORIZON_DAYS * 86400000).toISOString();

    // NO_UPCOMING_CONTENT — zero dated scheduled items in next 14 days
    const hasUpcoming = upcoming.some(i => i.effectiveTimestamp && i.effectiveTimestamp >= nowIso && i.effectiveTimestamp <= horizonIso);
    if (!hasUpcoming) {
      signals.push({ type: 'NO_UPCOMING_CONTENT', severity: 'WARNING', message: `Nothing is scheduled for the next ${UPCOMING_HORIZON_DAYS} days on this channel.` });
    }

    // LONG_POSTING_GAP — real intervals between dated published + scheduled items
    const datedItems = [...recent.filter(i => i.effectiveTimestamp), ...upcoming.filter(i => i.effectiveTimestamp)]
      .sort((a, b) => a.effectiveTimestamp!.localeCompare(b.effectiveTimestamp!));
    let largestGap: number | null = null;
    let gapStartIso: string | null = null;
    let gapEndIso: string | null = null;
    for (let i = 1; i < datedItems.length; i++) {
      const gap = calendarDayGap(datedItems[i - 1].effectiveTimestamp!, datedItems[i].effectiveTimestamp!, timezone);
      if (largestGap === null || gap > largestGap) {
        largestGap = gap;
        gapStartIso = datedItems[i - 1].effectiveTimestamp!;
        gapEndIso = datedItems[i].effectiveTimestamp!;
      }
    }
    if (largestGap !== null && largestGap > MAX_GAP_DAYS && gapStartIso && gapEndIso) {
      const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric', timeZone: timezone });
      signals.push({
        type: 'LONG_POSTING_GAP',
        severity: 'WARNING',
        message: `Gap of ${largestGap} days between ${fmt(gapStartIso)} and ${fmt(gapEndIso)}.`,
        gapDays: largestGap,
      });
    }

    const mix = [...recent, ...upcoming, ...prepared];
    if (mix.length === 0) return signals;

    // PRODUCT_HEAVY_RUN — last 5 items all in product-type classifications
    const productTypes = new Set<OrganicContentClass>(['PRODUCT', 'MARKETPLACE', 'SHOP']);
    const last5 = mix.slice(0, 5);
    if (last5.length >= 3 && last5.every(i => productTypes.has(i.classification))) {
      signals.push({ type: 'PRODUCT_HEAVY_RUN', severity: 'INFO', message: 'Recent content has been heavily product-focused.' });
    }

    // FOUNDER_GAP — no FOUNDER classification across RECENT + UPCOMING + PREPARED
    if (!mix.some(i => i.classification === 'FOUNDER')) {
      signals.push({ type: 'FOUNDER_GAP', severity: 'INFO', message: 'No founder content in recent or upcoming posts.' });
    }

    // EDITORIAL_GAP
    if (!mix.some(i => i.classification === 'EDITORIAL')) {
      signals.push({ type: 'EDITORIAL_GAP', severity: 'INFO', message: 'No editorial content in recent or upcoming posts.' });
    }

    // REPEATED_DIRECTION — 3+ consecutive same non-null creative_direction
    let runDir: string | null = null;
    let runCount = 0;
    let emittedDirection = false;
    for (const item of mix) {
      if (!emittedDirection) {
        if (item.creativeDirection && item.creativeDirection === runDir) {
          runCount++;
          if (runCount >= 3) {
            signals.push({ type: 'REPEATED_DIRECTION', severity: 'INFO', message: `${runCount} consecutive posts with ${item.creativeDirection.toLowerCase()} direction.` });
            emittedDirection = true;
          }
        } else {
          runDir = item.creativeDirection;
          runCount = item.creativeDirection ? 1 : 0;
        }
      }
    }

    // BACK_TO_BACK_CAROUSELS — 2+ consecutive carousel-type content
    let carouselRun = 0;
    let emittedCarousel = false;
    for (const item of mix) {
      if (!emittedCarousel) {
        if (item.contentType && CAROUSEL_TYPES.has(item.contentType.toUpperCase())) {
          carouselRun++;
          if (carouselRun >= 2) {
            signals.push({ type: 'BACK_TO_BACK_CAROUSELS', severity: 'INFO', message: 'Two or more consecutive carousel posts.' });
            emittedCarousel = true;
          }
        } else {
          carouselRun = 0;
        }
      }
    }

    return signals;
  }

  getPlan(workspaceId: string, channel: string, lookBackDays = 30): OrganicPlanResult {
    const channelKey = channel.toLowerCase() as ChannelKey;
    const strategy = channelStrategyService.get(workspaceId);
    const cfg = strategy[channelKey];
    const channelEnabled = cfg?.enabled ?? false;
    const timezone = DEFAULT_SCHEDULE_TIMEZONE;

    const published = this.getPublishedItems(workspaceId, channelKey, lookBackDays);
    const scheduled = this.getScheduledItems(workspaceId, channelKey);
    const prepared = channelEnabled ? this.getPreparedItems(workspaceId, channelKey) : [];
    const proposed = channelEnabled ? this.getProposedItems(workspaceId, channelKey) : [];

    // currentFeed: PUBLISHED only, already sorted publishedAt DESC
    const currentFeed = published;

    // plannedFeed: PUBLISHED + SCHEDULED, effectiveTimestamp DESC (newest effective date first)
    const plannedFeed = [...published, ...scheduled].sort((a, b) =>
      (b.effectiveTimestamp ?? '').localeCompare(a.effectiveTimestamp ?? '')
    );

    // Signal windows
    const nowIso = new Date().toISOString();
    const recentCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const recent = published.filter(i => i.effectiveTimestamp && i.effectiveTimestamp >= recentCutoff);
    const upcoming = scheduled.filter(i => i.effectiveTimestamp && i.effectiveTimestamp >= nowIso);

    const signals = this.computeSignals(recent, upcoming, prepared, channelEnabled, timezone);

    const largestGapDays = this.computeLargestGap([...recent, ...upcoming], timezone);

    return {
      channel: channelKey,
      channelStrategy: { enabled: channelEnabled, priority: cfg?.priority ?? null },
      currentFeed,
      plannedFeed,
      readyToPlace: prepared,
      proposedNext: proposed,
      signals,
      summary: {
        publishedCount: published.length,
        scheduledCount: scheduled.length,
        preparedCount: prepared.length,
        proposedCount: proposed.length,
        largestGapDays,
        hasUpcomingContent: upcoming.length > 0,
      },
    };
  }

  getIntelligenceSummary(workspaceId: string): OrganicIntelligenceSummary {
    const strategy = channelStrategyService.get(workspaceId);
    const timezone = DEFAULT_SCHEDULE_TIMEZONE;
    const nowIso = new Date().toISOString();
    const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString();

    const enabledEntries = Object.entries(strategy).filter(([, cfg]) => cfg?.enabled);

    const channels: OrganicChannelIntelligence[] = enabledEntries.map(([channelKey]) => {
      const allPublished = this.getPublishedItems(workspaceId, channelKey, 14);
      const allScheduled = this.getScheduledItems(workspaceId, channelKey);
      const prepared = this.getPreparedItems(workspaceId, channelKey);

      const recent = allPublished.slice(0, 10);
      const upcoming = allScheduled.filter(i => i.effectiveTimestamp && i.effectiveTimestamp >= nowIso);

      const signals = this.computeSignals(recent, upcoming, prepared, true, timezone);
      const largestGapDays = this.computeLargestGap([...recent, ...upcoming], timezone);
      const scheduledDensity = upcoming.filter(i => i.effectiveTimestamp && i.effectiveTimestamp <= sevenDaysOut).length;

      return {
        channel: channelKey,
        enabled: true,
        recentClassifications: recent.map(i => i.classification),
        upcomingClassifications: upcoming.map(i => i.classification),
        preparedClassifications: prepared.map(i => i.classification),
        scheduledDensity,
        activeSignalTypes: signals.map(s => s.type),
        largestGapDays,
        hasUpcomingContent: upcoming.length > 0,
      };
    });

    const primaryEntry = Object.entries(strategy).find(([, cfg]) => cfg?.priority === 'PRIMARY');
    const primaryChannel = primaryEntry?.[0] ?? enabledEntries[0]?.[0] ?? 'instagram';

    return { primaryChannel, channels, computedAt: new Date().toISOString() };
  }
}

export const organicPlannerService = new OrganicPlannerService();
export { OrganicPlannerService };
