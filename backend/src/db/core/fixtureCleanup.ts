import type { PoolClient } from 'pg';
import { getPostgresPool } from '../postgres/postgresPool';

export interface OwnedFixtureIds {
  tenantIds: readonly string[];
  entityIds: readonly string[];
  objectiveIds: readonly string[];
  campaignIds: readonly string[];
}

export interface FixtureCleanupReport {
  removed: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * Delete only explicitly tracked PG-2 verification fixture IDs (FK-safe order).
 * Never uses prefix predicates.
 */
export async function deleteOwnedPostgresFixtures(
  ids: OwnedFixtureIds,
  client?: PoolClient,
): Promise<FixtureCleanupReport> {
  const removed: Record<string, number> = {
    campaigns: 0,
    objectives: 0,
    entities: 0,
    tenants: 0,
  };
  const skipped: Record<string, number> = {
    campaigns: 0,
    objectives: 0,
    entities: 0,
    tenants: 0,
  };

  const run = async (c: PoolClient) => {
    for (const id of ids.campaignIds) {
      const r = await c.query('DELETE FROM campaigns WHERE id = $1', [id]);
      if ((r.rowCount ?? 0) > 0) removed.campaigns += 1;
      else skipped.campaigns += 1;
    }
    for (const id of ids.objectiveIds) {
      const r = await c.query('DELETE FROM objectives WHERE id = $1', [id]);
      if ((r.rowCount ?? 0) > 0) removed.objectives += 1;
      else skipped.objectives += 1;
    }
    for (const id of ids.entityIds) {
      const r = await c.query('DELETE FROM entities WHERE id = $1', [id]);
      if ((r.rowCount ?? 0) > 0) removed.entities += 1;
      else skipped.entities += 1;
    }
    for (const id of ids.tenantIds) {
      const r = await c.query('DELETE FROM tenants WHERE id = $1', [id]);
      if ((r.rowCount ?? 0) > 0) removed.tenants += 1;
      else skipped.tenants += 1;
    }
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
  const removed: Record<string, number> = {
    campaigns: 0,
    objectives: 0,
    entities: 0,
    tenants: 0,
  };
  const skipped: Record<string, number> = {
    campaigns: 0,
    objectives: 0,
    entities: 0,
    tenants: 0,
  };

  const del = (table: keyof typeof removed, id: string) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (result.changes > 0) removed[table] += 1;
    else skipped[table] += 1;
  };

  for (const id of ids.campaignIds) del('campaigns', id);
  for (const id of ids.objectiveIds) del('objectives', id);
  for (const id of ids.entityIds) del('entities', id);
  for (const id of ids.tenantIds) del('tenants', id);

  return { removed, skipped };
}
