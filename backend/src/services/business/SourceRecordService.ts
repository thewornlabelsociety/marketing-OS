import { db } from '../../db/database';

interface SourceRow { [key: string]: unknown }
function map(row: SourceRow) {
  return {
    id: row.id, workspaceId: row.workspace_id, integrationId: row.integration_id, sourceType: row.source_type,
    externalId: row.external_id, title: row.title, subtitle: row.subtitle, description: row.description,
    imageUrls: JSON.parse(String(row.image_urls ?? '[]')), priceAmount: row.price_amount,
    priceCurrency: row.price_currency, availability: row.availability, occurredAt: row.occurred_at,
    sourceUpdatedAt: row.source_updated_at, attributes: JSON.parse(String(row.payload ?? '{}')),
    lastSyncedAt: row.last_synced_at, usageStatus: row.usage_status ?? 'NEVER_FEATURED',
    usageCount: Number(row.usage_count ?? 0),
  };
}

const USAGE_SQL = `CASE
  WHEN SUM(CASE WHEN sc.status = 'PUBLISHED' THEN 1 ELSE 0 END) > 0 THEN 'PUBLISHED'
  WHEN SUM(CASE WHEN sc.status IN ('SCHEDULED','READY','PUBLISHING','BLOCKED') THEN 1 ELSE 0 END) > 0 THEN 'SCHEDULED'
  WHEN COUNT(csl.creative_artifact_id) > 0 THEN 'USED_IN_DRAFT'
  ELSE 'NEVER_FEATURED' END`;

export class SourceRecordService {
  list(workspaceId: string, filter = 'all') {
    const conditions = ['sr.workspace_id = ?'];
    const params: unknown[] = [workspaceId];
    if (filter === 'sold') conditions.push("sr.availability IN ('SOLD','UNAVAILABLE')");
    else if (filter !== 'featured') conditions.push("sr.availability = 'AVAILABLE'");
    if (filter === 'today') conditions.push("datetime(sr.occurred_at) >= datetime('now','start of day')");
    if (filter === 'week') conditions.push("datetime(sr.occurred_at) >= datetime('now','-7 days')");
    const having = filter === 'not_featured' ? `HAVING ${USAGE_SQL} = 'NEVER_FEATURED'`
      : filter === 'featured' ? `HAVING ${USAGE_SQL} <> 'NEVER_FEATURED'` : '';
    const rows = db.prepare(`SELECT sr.*, COUNT(DISTINCT csl.creative_artifact_id) usage_count, ${USAGE_SQL} usage_status
      FROM source_records sr LEFT JOIN creative_source_links csl ON csl.source_record_id = sr.id
      LEFT JOIN creative_artifacts ca ON ca.id = csl.creative_artifact_id AND ca.workspace_id = sr.workspace_id
      LEFT JOIN scheduled_content_items sc ON sc.source_creative_artifact_id = ca.id AND sc.workspace_id = sr.workspace_id
      WHERE ${conditions.join(' AND ')} GROUP BY sr.id ${having}
      ORDER BY COALESCE(sr.occurred_at, sr.created_at) DESC`).all(...params) as SourceRow[];
    return rows.map(map);
  }

  usage(sourceId: string, workspaceId: string) {
    if (!db.prepare('SELECT id FROM source_records WHERE id = ? AND workspace_id = ?').get(sourceId, workspaceId)) return null;
    return db.prepare(`SELECT ca.id creativeArtifactId, ca.title, ca.content_key contentKey, ca.status creativeStatus,
        c.id campaignId, c.name campaignName, sc.id scheduleId, sc.status scheduleStatus,
        sc.scheduled_for scheduledFor, sc.published_at publishedAt
      FROM creative_source_links csl JOIN creative_artifacts ca ON ca.id = csl.creative_artifact_id
      JOIN campaigns c ON c.id = ca.campaign_id LEFT JOIN scheduled_content_items sc ON sc.source_creative_artifact_id = ca.id
      WHERE csl.source_record_id = ? AND ca.workspace_id = ?
      ORDER BY COALESCE(sc.published_at, sc.scheduled_for, ca.created_at) DESC`).all(sourceId, workspaceId);
  }
}
export const sourceRecordService = new SourceRecordService();
