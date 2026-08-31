import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { MarketingChannel } from '../../types/channels';
import type {
  AttributionResult,
  ConversionEvent,
  ConversionType,
  MeasurementWindow,
  PerformanceMetrics,
  PerformanceObservation,
  PerformanceSource,
} from '../../types/performance';
import { normalizeMetrics } from './metricsUtils';

interface ObservationRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  schedule_id: string | null;
  content_key: string;
  source_creative_artifact_id: string;
  source_creative_version: number;
  channel: string;
  provider_key: string | null;
  destination_id: string | null;
  external_publish_id: string | null;
  media_asset_id: string | null;
  observed_at: string;
  measurement_window: string;
  metrics: string;
  source: string;
  raw_metadata: string | null;
  created_at: string;
}

interface ConversionRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  content_key: string | null;
  schedule_id: string | null;
  conversion_type: string;
  value: number | null;
  currency: string | null;
  external_conversion_id: string | null;
  occurred_at: string;
  attribution_model: string;
  attribution_confidence: string;
  attribution_evidence: string | null;
  source: string;
  metadata: string | null;
  created_at: string;
}

export interface CreateObservationInput {
  workspaceId: string;
  campaignId: string;
  scheduleId?: string;
  contentKey: string;
  sourceCreativeArtifactId: string;
  sourceCreativeVersion: number;
  channel: MarketingChannel;
  providerKey?: string;
  destinationId?: string;
  externalPublishId?: string;
  mediaAssetId?: string;
  observedAt?: string;
  measurementWindow: MeasurementWindow;
  metrics: Record<string, unknown>;
  source: PerformanceSource;
  rawMetadata?: Record<string, unknown>;
}

export interface CreateConversionInput {
  workspaceId: string;
  campaignId: string;
  contentKey?: string;
  scheduleId?: string;
  conversionType: ConversionType;
  value?: number;
  currency?: string;
  externalConversionId?: string;
  occurredAt?: string;
  attribution: AttributionResult;
  source: 'MANUAL' | 'PROVIDER' | 'IMPORT' | 'TRACKING';
  metadata?: Record<string, unknown>;
}

function mapObservationRow(row: ObservationRow): PerformanceObservation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    scheduleId: row.schedule_id ?? undefined,
    contentKey: row.content_key,
    sourceCreativeArtifactId: row.source_creative_artifact_id,
    sourceCreativeVersion: row.source_creative_version,
    channel: row.channel as MarketingChannel,
    providerKey: row.provider_key ?? undefined,
    destinationId: row.destination_id ?? undefined,
    externalPublishId: row.external_publish_id ?? undefined,
    mediaAssetId: row.media_asset_id ?? undefined,
    observedAt: row.observed_at,
    measurementWindow: row.measurement_window as MeasurementWindow,
    metrics: JSON.parse(row.metrics) as PerformanceMetrics,
    source: row.source as PerformanceSource,
    rawMetadata: row.raw_metadata ? JSON.parse(row.raw_metadata) as Record<string, unknown> : undefined,
    createdAt: row.created_at,
  };
}

function mapConversionRow(row: ConversionRow): ConversionEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    contentKey: row.content_key ?? undefined,
    scheduleId: row.schedule_id ?? undefined,
    conversionType: row.conversion_type as ConversionType,
    value: row.value ?? undefined,
    currency: row.currency ?? undefined,
    externalConversionId: row.external_conversion_id ?? undefined,
    occurredAt: row.occurred_at,
    attribution: {
      model: row.attribution_model as AttributionResult['model'],
      campaignId: row.campaign_id,
      contentKey: row.content_key ?? undefined,
      scheduleId: row.schedule_id ?? undefined,
      confidence: row.attribution_confidence as AttributionResult['confidence'],
      evidence: row.attribution_evidence ? JSON.parse(row.attribution_evidence) as string[] : undefined,
    },
    source: row.source as ConversionEvent['source'],
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
    createdAt: row.created_at,
  };
}

export class PerformanceIngestionService {
  createObservation(input: CreateObservationInput): { observation?: PerformanceObservation; error?: string; code?: string } {
    const campaign = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(input.campaignId) as { workspace_id: string } | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== input.workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const { metrics, error } = normalizeMetrics(input.metrics);
    if (error) return { error, code: 'INVALID_METRICS' };

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO performance_observations
        (id, workspace_id, campaign_id, schedule_id, content_key,
         source_creative_artifact_id, source_creative_version, channel,
         provider_key, destination_id, external_publish_id, media_asset_id, observed_at,
         measurement_window, metrics, source, raw_metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.workspaceId,
      input.campaignId,
      input.scheduleId ?? null,
      input.contentKey,
      input.sourceCreativeArtifactId,
      input.sourceCreativeVersion,
      input.channel,
      input.providerKey ?? null,
      input.destinationId ?? null,
      input.externalPublishId ?? null,
      input.mediaAssetId ?? null,
      input.observedAt ?? now,
      input.measurementWindow,
      JSON.stringify(metrics),
      input.source,
      input.rawMetadata ? JSON.stringify(input.rawMetadata) : null,
      now
    );

    const row = db.prepare('SELECT * FROM performance_observations WHERE id = ?').get(id) as ObservationRow;
    return { observation: mapObservationRow(row) };
  }

  listObservations(campaignId: string, workspaceId: string): PerformanceObservation[] | { error: string; code: string } {
    const campaign = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campaignId) as { workspace_id: string } | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const rows = db.prepare(
      'SELECT * FROM performance_observations WHERE campaign_id = ? ORDER BY observed_at DESC'
    ).all(campaignId) as ObservationRow[];
    return rows.map(mapObservationRow);
  }

  createConversion(input: CreateConversionInput): { conversion?: ConversionEvent; error?: string; code?: string } {
    const campaign = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(input.campaignId) as { workspace_id: string } | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== input.workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    if (input.externalConversionId) {
      const existing = db.prepare(
        'SELECT id FROM conversion_events WHERE external_conversion_id = ? AND workspace_id = ?'
      ).get(input.externalConversionId, input.workspaceId) as { id: string } | undefined;
      if (existing) return { conversion: mapConversionRow(db.prepare('SELECT * FROM conversion_events WHERE id = ?').get(existing.id) as ConversionRow) };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversion_events
        (id, workspace_id, campaign_id, content_key, schedule_id, conversion_type,
         value, currency, external_conversion_id, occurred_at,
         attribution_model, attribution_confidence, attribution_evidence,
         source, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.workspaceId,
      input.campaignId,
      input.contentKey ?? null,
      input.scheduleId ?? null,
      input.conversionType,
      input.value ?? null,
      input.currency ?? null,
      input.externalConversionId ?? null,
      input.occurredAt ?? now,
      input.attribution.model,
      input.attribution.confidence,
      input.attribution.evidence ? JSON.stringify(input.attribution.evidence) : null,
      input.source,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now
    );

    const row = db.prepare('SELECT * FROM conversion_events WHERE id = ?').get(id) as ConversionRow;
    return { conversion: mapConversionRow(row) };
  }

  listConversions(campaignId: string, workspaceId: string): ConversionEvent[] | { error: string; code: string } {
    const campaign = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campaignId) as { workspace_id: string } | undefined;
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const rows = db.prepare(
      'SELECT * FROM conversion_events WHERE campaign_id = ? ORDER BY occurred_at DESC'
    ).all(campaignId) as ConversionRow[];
    return rows.map(mapConversionRow);
  }
}

export const performanceIngestionService = new PerformanceIngestionService();
