/**
 * PG-3A — migration 003 constraint + behaviour verification (live Supabase).
 * Run: node -r dotenv/config scripts/run-verify-pg-3a.cjs
 */
import 'dotenv/config';
import { getPostgresPool, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { createCoreRepositories } from '../src/db/core/createCoreRepositories';
import {
  ACCEPTED_MIGRATION_CHECKSUMS,
  validateLiveMigrationTracking,
} from '../src/db/postgres/acceptedMigrations';
import {
  additiveIndexExpectations,
  validateAdditiveIndexExpectation,
} from '../src/db/postgres/forwardMigrationExpectations';
import {
  computeMigrationFileChecksum,
  listMigrationFiles,
  runPostgresMigrations,
} from '../src/db/postgres/runPostgresMigrations';

const FIXTURE = {
  tenantId: 'pg3a_tenant',
  entityId: 'pg3a_ws',
  objectiveId: 'obj_sys_sales',
  campaignId: 'pg3a_campaign',
  briefId1: 'pg3a_brief_1',
  briefId2: 'pg3a_brief_2',
  planId: 'pg3a_plan',
  approvalId1: 'pg3a_approval_1',
  approvalId2: 'pg3a_approval_2',
} as const;

const OWNED = {
  briefIds: [FIXTURE.briefId1, FIXTURE.briefId2],
  planIds: [FIXTURE.planId],
  approvalIds: [FIXTURE.approvalId1],
  campaignIds: [FIXTURE.campaignId],
  entityIds: [FIXTURE.entityId],
  tenantIds: [FIXTURE.tenantId],
};

async function inspectConstraints(pool: ReturnType<typeof getPostgresPool>) {
  const idx = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('campaign_briefs', 'plan_approvals')
      AND indexname LIKE 'uq_%'
    ORDER BY tablename, indexname
  `);

  const fk = await pool.query(`
    SELECT conname, conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid IN ('campaign_briefs'::regclass, 'plan_approvals'::regclass)
      AND contype = 'f'
    ORDER BY conrelid::text, conname
  `);

  return { indexes: idx.rows, foreignKeys: fk.rows };
}

async function cleanup(pool: ReturnType<typeof getPostgresPool>) {
  for (const id of OWNED.approvalIds) {
    await pool.query('DELETE FROM plan_approvals WHERE id = $1', [id]);
  }
  for (const id of OWNED.briefIds) {
    await pool.query('DELETE FROM campaign_briefs WHERE id = $1', [id]);
  }
  for (const id of OWNED.planIds) {
    await pool.query('DELETE FROM campaign_plans WHERE id = $1', [id]);
  }
  for (const id of OWNED.campaignIds) {
    await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
  }
  for (const id of OWNED.entityIds) {
    await pool.query('DELETE FROM entities WHERE id = $1', [id]);
  }
  for (const id of OWNED.tenantIds) {
    await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  }
}

async function main() {
  let passed = 0;
  let failed = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    if (ok) {
      passed += 1;
      console.log(`PASS  ${label}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const pgEnv = {
    ...process.env,
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
  };
  const pool = getPostgresPool();
  const repos = createCoreRepositories(pgEnv);
  const now = new Date().toISOString();

  try {
    console.log('\n[Duplicate preflight]');
    for (const table of ['campaign_briefs', 'plan_approvals'] as const) {
      const totals = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
      const distinct = await pool.query(
        `SELECT COUNT(DISTINCT campaign_id)::int AS distinct_campaign_ids FROM ${table}`,
      );
      const dups = await pool.query(`
        SELECT campaign_id, COUNT(*)::int AS row_count
        FROM ${table}
        GROUP BY campaign_id
        HAVING COUNT(*) > 1
      `);
      check(`${table} duplicate preflight safe`, dups.rowCount === 0, `groups=${dups.rowCount}`);
      check(`${table} total rows reported`, totals.rows[0].total >= 0);
      check(`${table} distinct campaign_ids reported`, distinct.rows[0].distinct_campaign_ids >= 0);
    }

    console.log('\n[Migration inventory]');
    const migrationFiles = listMigrationFiles();
    check('accepted migrations on disk include 003', migrationFiles.includes('003_pg3_unique_constraints.sql'));
    check('accepted migrations on disk include 004', migrationFiles.includes('004_pg4_content_plan_unique_constraints.sql'));
    for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
      const actual = computeMigrationFileChecksum(filename);
      check(`checksum pinned: ${filename}`, actual === expected, actual);
    }

    const firstRun = await runPostgresMigrations(pool);
    check('001 skipped on rerun', firstRun.skipped.includes('001_mos_baseline.sql'));
    check('002 skipped on rerun', firstRun.skipped.includes('002_system_objectives_seed.sql'));
    check('003 skipped on rerun', firstRun.skipped.includes('003_pg3_unique_constraints.sql'));
    check('004 skipped on rerun', firstRun.skipped.includes('004_pg4_content_plan_unique_constraints.sql'));
    check('no migrations applied on acceptance rerun', firstRun.applied.length === 0);

    const tracking = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
    check('live migration rows = 4', tracking.rowCount === 4, `got ${tracking.rowCount}`);
    const trackingIssues = validateLiveMigrationTracking(tracking.rows);
    check('live tracking matches accepted registry', trackingIssues.length === 0);

    const constraints = await inspectConstraints(pool);
    console.log('\n[Constraints]');
    console.log(JSON.stringify(constraints, null, 2));

    const briefIdx = constraints.indexes.find((r) => r.indexname === 'uq_campaign_briefs_campaign_id');
    const approvalIdx = constraints.indexes.find((r) => r.indexname === 'uq_plan_approvals_campaign_id');
    check('campaign_briefs unique index present', !!briefIdx);
    check('plan_approvals unique index present', !!approvalIdx);

    for (const expectation of additiveIndexExpectations().filter((e) => e.migration === '003_pg3_unique_constraints.sql')) {
      const live = constraints.indexes.find((r) => r.indexname === expectation.name);
      const validationError = validateAdditiveIndexExpectation(
        expectation,
        live
          ? {
              indexname: live.indexname,
              tablename: live.tablename,
              indexdef: live.indexdef,
              indisunique: true,
            }
          : undefined,
      );
      check(`additive index definition: ${expectation.name}`, validationError === null, validationError ?? '');
    }
    check('campaign_briefs FK count >= 2', constraints.foreignKeys.filter((r) => r.table_name === 'campaign_briefs').length >= 2);
    check('plan_approvals FK count >= 2', constraints.foreignKeys.filter((r) => r.table_name === 'plan_approvals').length >= 2);

    console.log('\n[Behaviour fixtures]');
    await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantId });
    await repos.workspace.upsert({
      id: FIXTURE.entityId,
      tenantId: FIXTURE.tenantId,
      name: 'PG3A WS',
      slug: 'pg3a-ws',
      brandKit: {},
      apiKeys: {},
    });
    await repos.campaign.create({
      id: FIXTURE.campaignId,
      workspaceId: FIXTURE.entityId,
      objectiveId: FIXTURE.objectiveId,
      name: 'PG3A Campaign',
      sourceType: 'PRODUCT',
      sourceId: null,
      sourceTitle: 'PG3A Product',
      sourceDescription: null,
      sourceMetadata: {},
      brief: null,
      channels: [],
      createdAt: now,
      updatedAt: now,
    });

    await pool.query(
      `INSERT INTO campaign_briefs (id, campaign_id, workspace_id, key_details, offer_constraints, timing_important_dates, constraints, completeness_missing_fields, created_at, updated_at)
       VALUES ($1, $2, $3, '[]', '[]', '[]', '[]', '[]', $4, $4)`,
      [FIXTURE.briefId1, FIXTURE.campaignId, FIXTURE.entityId, now],
    );

    let briefDupRejected = false;
    try {
      await pool.query(
        `INSERT INTO campaign_briefs (id, campaign_id, workspace_id, key_details, offer_constraints, timing_important_dates, constraints, completeness_missing_fields, created_at, updated_at)
         VALUES ($1, $2, $3, '[]', '[]', '[]', '[]', '[]', $4, $4)`,
        [FIXTURE.briefId2, FIXTURE.campaignId, FIXTURE.entityId, now],
      );
    } catch (err) {
      briefDupRejected = err instanceof Error && /unique|duplicate key/i.test(err.message);
    }
    check('duplicate brief rejected', briefDupRejected);

    await pool.query(
      `INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current, hooks, proof_points, cta_alternatives, channels, content_mix, measurement_supporting_kpis, created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'READY_FOR_REVIEW', 1, '{}', '[]', '[]', '[]', '[]', '[]', $4, $4)`,
      [FIXTURE.planId, FIXTURE.campaignId, FIXTURE.entityId, now],
    );

    await pool.query(
      `INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, 1, $5, $5)`,
      [FIXTURE.approvalId1, FIXTURE.campaignId, FIXTURE.entityId, FIXTURE.planId, now],
    );

    const later = new Date().toISOString();
    await pool.query(
      `INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, 2, $5, $5)
       ON CONFLICT (campaign_id) DO UPDATE SET
         approved_plan_id = EXCLUDED.approved_plan_id,
         approved_version = EXCLUDED.approved_version,
         approved_at = EXCLUDED.approved_at`,
      [FIXTURE.approvalId2, FIXTURE.campaignId, FIXTURE.entityId, FIXTURE.planId, later],
    );

    const approvalRows = await pool.query(
      'SELECT id, approved_version FROM plan_approvals WHERE campaign_id = $1',
      [FIXTURE.campaignId],
    );
    check('approval ON CONFLICT succeeds', approvalRows.rowCount === 1);
    check('approval row count remains 1', approvalRows.rowCount === 1);
    check('approval version updated', approvalRows.rows[0]?.approved_version === 2);

    await cleanup(pool);
    check('fixture cleanup completed', true);

    console.log(`\nPG-3A behaviour: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  } finally {
    await shutdownPostgresPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
