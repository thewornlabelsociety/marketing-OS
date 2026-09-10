import type { PoolClient } from 'pg';
import { getPostgresPool } from '../postgres/postgresPool';

export interface OwnedFixtureIds {
  tenantIds: readonly string[];
  entityIds: readonly string[];
  objectiveIds: readonly string[];
  campaignIds: readonly string[];
  briefIds?: readonly string[];
  planIds?: readonly string[];
  revisionIds?: readonly string[];
  approvalIds?: readonly string[];
  contentPlanIds?: readonly string[];
  contentPlanRevisionIds?: readonly string[];
  contentPlanApprovalIds?: readonly string[];
  creativeArtifactIds?: readonly string[];
  creativeRevisionIds?: readonly string[];
  creativeApprovalIds?: readonly string[];
}

export interface FixtureCleanupReport {
  removed: Record<string, number>;
  skipped: Record<string, number>;
}

function initCounts(keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

const CREATIVE_TABLES = ['creative_approvals', 'creative_revision_requests', 'creative_artifacts'] as const;
const CONTENT_PLANNING_TABLES = ['content_plan_approvals', 'content_plan_revision_requests', 'content_plans'] as const;
const PLANNING_TABLES = ['plan_approvals', 'revision_requests', 'campaign_plans', 'campaign_briefs'] as const;
const CORE_TABLES = ['campaigns', 'objectives', 'entities', 'tenants'] as const;

/**
 * Delete only explicitly tracked verification fixture IDs (FK-safe order).
 * Never uses prefix predicates.
 */
export async function deleteOwnedPostgresFixtures(
  ids: OwnedFixtureIds,
  client?: PoolClient,
): Promise<FixtureCleanupReport> {
  const removed = initCounts([...CREATIVE_TABLES, ...CONTENT_PLANNING_TABLES, ...PLANNING_TABLES, ...CORE_TABLES]);
  const skipped = initCounts([...CREATIVE_TABLES, ...CONTENT_PLANNING_TABLES, ...PLANNING_TABLES, ...CORE_TABLES]);

  const run = async (c: PoolClient) => {
    const del = async (table: keyof typeof removed, id: string) => {
      const r = await c.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      if ((r.rowCount ?? 0) > 0) removed[table] += 1;
      else skipped[table] += 1;
    };
    const delByCampaign = async (
      table: 'creative_approvals' | 'creative_revision_requests' | 'creative_artifacts' | 'content_plan_approvals' | 'content_plan_revision_requests' | 'content_plans',
      campaignId: string,
    ) => {
      const r = await c.query(`DELETE FROM ${table} WHERE campaign_id = $1`, [campaignId]);
      if ((r.rowCount ?? 0) > 0) removed[table] += r.rowCount!;
      else skipped[table] += 1;
    };

    for (const id of ids.creativeApprovalIds ?? []) await del('creative_approvals', id);
    for (const id of ids.creativeRevisionIds ?? []) await del('creative_revision_requests', id);
    for (const id of ids.creativeArtifactIds ?? []) await del('creative_artifacts', id);
    for (const campaignId of ids.campaignIds) {
      await delByCampaign('creative_approvals', campaignId);
      await delByCampaign('creative_revision_requests', campaignId);
      await delByCampaign('creative_artifacts', campaignId);
    }
    for (const id of ids.contentPlanApprovalIds ?? []) await del('content_plan_approvals', id);
    for (const id of ids.contentPlanRevisionIds ?? []) await del('content_plan_revision_requests', id);
    for (const id of ids.contentPlanIds ?? []) await del('content_plans', id);
    for (const campaignId of ids.campaignIds) {
      await delByCampaign('content_plan_approvals', campaignId);
      await delByCampaign('content_plan_revision_requests', campaignId);
      await delByCampaign('content_plans', campaignId);
    }
    for (const id of ids.approvalIds ?? []) await del('plan_approvals', id);
    for (const id of ids.revisionIds ?? []) await del('revision_requests', id);
    for (const id of ids.planIds ?? []) await del('campaign_plans', id);
    for (const id of ids.briefIds ?? []) await del('campaign_briefs', id);
    for (const id of ids.campaignIds) await del('campaigns', id);
    for (const id of ids.objectiveIds) await del('objectives', id);
    for (const id of ids.entityIds) await del('entities', id);
    for (const id of ids.tenantIds) await del('tenants', id);
  };

  if (client) {
    await run(client);
  } else {
    const pool = getPostgresPool();
    const c = await pool.connect();
    try {
      await run(c);
    } finally {
      c.release();
    }
  }

  return { removed, skipped };
}

/** SQLite verification cleanup — exact IDs only, same FK order. */
export function deleteOwnedSqliteFixtures(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => { changes: number } } },
  ids: OwnedFixtureIds,
): FixtureCleanupReport {
  const removed = initCounts([...CREATIVE_TABLES, ...CONTENT_PLANNING_TABLES, ...PLANNING_TABLES, ...CORE_TABLES]);
  const skipped = initCounts([...CREATIVE_TABLES, ...CONTENT_PLANNING_TABLES, ...PLANNING_TABLES, ...CORE_TABLES]);

  const del = (table: keyof typeof removed, id: string) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (result.changes > 0) removed[table] += 1;
    else skipped[table] += 1;
  };
  const delByCampaign = (
    table: 'creative_approvals' | 'creative_revision_requests' | 'creative_artifacts' | 'content_plan_approvals' | 'content_plan_revision_requests' | 'content_plans',
    campaignId: string,
  ) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(campaignId);
    if (result.changes > 0) removed[table] += result.changes;
    else skipped[table] += 1;
  };

  for (const id of ids.creativeApprovalIds ?? []) del('creative_approvals', id);
  for (const id of ids.creativeRevisionIds ?? []) del('creative_revision_requests', id);
  for (const id of ids.creativeArtifactIds ?? []) del('creative_artifacts', id);
  for (const campaignId of ids.campaignIds) {
    delByCampaign('creative_approvals', campaignId);
    delByCampaign('creative_revision_requests', campaignId);
    delByCampaign('creative_artifacts', campaignId);
  }
  for (const id of ids.contentPlanApprovalIds ?? []) del('content_plan_approvals', id);
  for (const id of ids.contentPlanRevisionIds ?? []) del('content_plan_revision_requests', id);
  for (const id of ids.contentPlanIds ?? []) del('content_plans', id);
  for (const campaignId of ids.campaignIds) {
    delByCampaign('content_plan_approvals', campaignId);
    delByCampaign('content_plan_revision_requests', campaignId);
    delByCampaign('content_plans', campaignId);
  }
  for (const id of ids.approvalIds ?? []) del('plan_approvals', id);
  for (const id of ids.revisionIds ?? []) del('revision_requests', id);
  for (const id of ids.planIds ?? []) del('campaign_plans', id);
  for (const id of ids.briefIds ?? []) del('campaign_briefs', id);
  for (const id of ids.campaignIds) del('campaigns', id);
  for (const id of ids.objectiveIds) del('objectives', id);
  for (const id of ids.entityIds) del('entities', id);
  for (const id of ids.tenantIds) del('tenants', id);

  return { removed, skipped };
}
