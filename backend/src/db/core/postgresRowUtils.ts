import type { CampaignRow, EntityRow, ObjectiveRow } from '../../types';

export function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value ?? '');
}

export function mapPostgresEntityRow(row: Record<string, unknown>): EntityRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name),
    slug: String(row.slug),
    brand_kit: String(row.brand_kit ?? '{}'),
    api_keys: String(row.api_keys ?? '{}'),
    is_archived: Number(row.is_archived ?? 0),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

export function mapPostgresObjectiveRow(row: Record<string, unknown>): ObjectiveRow {
  return {
    id: String(row.id),
    workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    objective_type: String(row.objective_type),
    primary_kpi: String(row.primary_kpi),
    supporting_kpis: String(row.supporting_kpis ?? '[]'),
    conversion_event: row.conversion_event == null ? null : String(row.conversion_event),
    success_criteria: row.success_criteria == null ? null : String(row.success_criteria),
    default_channels: String(row.default_channels ?? '[]'),
    is_system: Number(row.is_system ?? 0),
    is_active: Number(row.is_active ?? 1),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

export function mapPostgresCampaignRow(row: Record<string, unknown>): CampaignRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    objective_id: String(row.objective_id),
    name: String(row.name),
    status: String(row.status),
    source_type: String(row.source_type),
    source_id: row.source_id == null ? null : String(row.source_id),
    source_title: String(row.source_title),
    source_description: row.source_description == null ? null : String(row.source_description),
    source_metadata: String(row.source_metadata ?? '{}'),
    brief: row.brief == null ? null : String(row.brief),
    channels: String(row.channels ?? '[]'),
    cancellation_reason: row.cancellation_reason == null ? null : String(row.cancellation_reason),
    scheduled_at: row.scheduled_at == null ? null : normalizeTimestamp(row.scheduled_at),
    published_at: row.published_at == null ? null : normalizeTimestamp(row.published_at),
    completed_at: row.completed_at == null ? null : normalizeTimestamp(row.completed_at),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
    objective_name: row.objective_name == null ? undefined : String(row.objective_name),
    objective_primary_kpi: row.objective_primary_kpi == null ? undefined : String(row.objective_primary_kpi),
  };
}
