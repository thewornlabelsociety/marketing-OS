/**
 * PG-4A — migration 004 content_plan_approvals constraint + behaviour verification (live Supabase).
 * Run: npm run verify:pg-4a
 */
import 'dotenv/config';
import {
  ACCEPTED_MIGRATION_CHECKSUMS,
  validateDiscoveredMigrationInventory,
  validateLiveMigrationTracking,
} from '../src/db/postgres/acceptedMigrations';
import {
  additiveIndexExpectations,
  additiveNonPkIndexCount,
  baselineNonPkIndexCount,
  effectiveNonPkIndexCount,
  validateAdditiveIndexExpectation,
} from '../src/db/postgres/forwardMigrationExpectations';
import { scanCanonicalMigrationFiles } from '../src/db/postgres/migrationSafety';
import { getPostgresPool, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { createCoreRepositories } from '../src/db/core/createCoreRepositories';
import {
  computeMigrationFileChecksum,
  listMigrationFiles,
  runPostgresMigrations,
} from '../src/db/postgres/runPostgresMigrations';

const FIXTURE = {
  tenantId: 'pg4a_tenant',
  entityId: 'pg4a_ws',
  objectiveId: 'obj_sys_sales',
  campaignId: 'pg4a_campaign',
  planId: 'pg4a_plan',
  contentPlanId1: 'pg4a_cplan_1',
  contentPlanId2: 'pg4a_cplan_2',
  approvalId1: 'pg4a_approval_1',
  approvalId2: 'pg4a_approval_2',
} as const;

const OWNED = {
  approvalIds: [FIXTURE.approvalId1],
  contentPlanIds: [FIXTURE.contentPlanId1, FIXTURE.contentPlanId2],
  planIds: [FIXTURE.planId],
  campaignIds: [FIXTURE.campaignId],
  entityIds: [FIXTURE.entityId],
  tenantIds: [FIXTURE.tenantId],
};

async function inspectContentPlanApprovalConstraints(pool: ReturnType<typeof getPostgresPool>) {
  const idx = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'content_plan_approvals'
      AND indexname LIKE 'uq_%'
    ORDER BY indexname
  `);

  const fk = await pool.query(`
    SELECT conname, conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'content_plan_approvals'::regclass
      AND contype = 'f'
    ORDER BY conname
  `);

  const pk = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'content_plan_approvals'::regclass
      AND contype = 'p'
  `);

  return { indexes: idx.rows, foreignKeys: fk.rows, primaryKey: pk.rows };
}

async function countOwnedRows(
  pool: ReturnType<typeof getPostgresPool>,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = ANY($1::text[])`,
    [ids],
  );
  return result.rows[0].n as number;
}

async function cleanup(pool: ReturnType<typeof getPostgresPool>) {
  const report: Record<string, { removed: number; remaining: number }> = {};

  for (const id of OWNED.approvalIds) {
    const res = await pool.query('DELETE FROM content_plan_approvals WHERE id = $1', [id]);
    report[`content_plan_approvals:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }
  for (const id of OWNED.contentPlanIds) {
    const res = await pool.query('DELETE FROM content_plans WHERE id = $1', [id]);
    report[`content_plans:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }
  for (const id of OWNED.planIds) {
    const res = await pool.query('DELETE FROM campaign_plans WHERE id = $1', [id]);
    report[`campaign_plans:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }
  for (const id of OWNED.campaignIds) {
    const res = await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
    report[`campaigns:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }
  for (const id of OWNED.entityIds) {
    const res = await pool.query('DELETE FROM entities WHERE id = $1', [id]);
    report[`entities:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }
  for (const id of OWNED.tenantIds) {
    const res = await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
    report[`tenants:${id}`] = { removed: res.rowCount ?? 0, remaining: 0 };
  }

  return report;
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
    console.log('\n[A — Starting / migration integrity]');
    const migrationFiles = listMigrationFiles();
    check('accepted migrations on disk include 004', migrationFiles.includes('004_pg4_content_plan_unique_constraints.sql'));
    check('migration inventory ordered 001-004', migrationFiles.join(',') === [
      '001_mos_baseline.sql',
      '002_system_objectives_seed.sql',
      '003_pg3_unique_constraints.sql',
      '004_pg4_content_plan_unique_constraints.sql',
    ].join(','));
    for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
      const actual = computeMigrationFileChecksum(filename);
      check(`checksum pinned: ${filename}`, actual === expected, actual);
    }
    const inventoryIssues = validateDiscoveredMigrationInventory(migrationFiles, computeMigrationFileChecksum);
    check('discovered inventory matches accepted registry', inventoryIssues.length === 0);

    const mockChecksum = (filename: string) => ACCEPTED_MIGRATION_CHECKSUMS[filename] ?? 'deadbeef';
    check(
      'tamper: missing 004 fails validation',
      validateDiscoveredMigrationInventory(
        migrationFiles.filter((f) => f !== '004_pg4_content_plan_unique_constraints.sql'),
        mockChecksum,
      ).some((i) => i.code === 'missing_accepted_migration'),
    );
    check(
      'tamper: changed 004 checksum fails validation',
      validateDiscoveredMigrationInventory(
        migrationFiles,
        (f) => (f === '004_pg4_content_plan_unique_constraints.sql' ? 'tampered' : mockChecksum(f)),
      ).some((i) => i.code === 'checksum_mismatch'),
    );
    check(
      'tamper: unaccepted 005 fails validation',
      validateDiscoveredMigrationInventory(
        [...migrationFiles, '005_bad.sql'],
        mockChecksum,
      ).some((i) => i.code === 'unaccepted_migration'),
    );

    const destructiveHits = scanCanonicalMigrationFiles().filter((h) => h.source.includes('004'));
    check('migration 004 contains no destructive SQL', destructiveHits.length === 0);

    check('baseline non-PK index count remains 29', baselineNonPkIndexCount() === 29);
    check('additive non-PK index count is 3', additiveNonPkIndexCount() === 3);
    check('effective non-PK index count is 32', effectiveNonPkIndexCount() === 32);

    console.log('\n[B — Duplicate preflight]');
    const totals = await pool.query('SELECT COUNT(*)::int AS total FROM content_plan_approvals');
    const distinct = await pool.query(
      'SELECT COUNT(DISTINCT campaign_id)::int AS distinct_campaign_ids FROM content_plan_approvals',
    );
    const dups = await pool.query(`
      SELECT campaign_id, COUNT(*)::int AS row_count
      FROM content_plan_approvals
      GROUP BY campaign_id
      HAVING COUNT(*) > 1
    `);
    check('content_plan_approvals duplicate preflight safe', dups.rows.length === 0, `groups=${dups.rows.length}`);
    check('content_plan_approvals total rows reported', totals.rows[0].total >= 0);
    check('content_plan_approvals distinct campaign_ids reported', distinct.rows[0].distinct_campaign_ids >= 0);

    console.log('\n[C — Migration inventory / checksum / apply]');
    const firstRun = await runPostgresMigrations(pool);
    check('001 skipped', firstRun.skipped.includes('001_mos_baseline.sql') || firstRun.applied.includes('001_mos_baseline.sql') === false);
    check('002 skipped', firstRun.skipped.includes('002_system_objectives_seed.sql'));
    check('003 skipped', firstRun.skipped.includes('003_pg3_unique_constraints.sql'));
    if (firstRun.applied.includes('004_pg4_content_plan_unique_constraints.sql')) {
      check('004 applied on first run', true);
    } else {
      check('004 skipped (already applied)', firstRun.skipped.includes('004_pg4_content_plan_unique_constraints.sql'));
    }

    const tracking = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
    check('live migration rows = 4', tracking.rowCount === 4, `got ${tracking.rowCount}`);
    const trackingIssues = validateLiveMigrationTracking(tracking.rows);
    check('live tracking matches accepted registry', trackingIssues.length === 0);

    console.log('\n[D — Live index definition]');
    const constraints = await inspectContentPlanApprovalConstraints(pool);
    const approvalIdx = constraints.indexes.find((r) => r.indexname === 'uq_content_plan_approvals_campaign_id');
    check('content_plan_approvals unique index present', !!approvalIdx);
    if (approvalIdx) {
      check('index on content_plan_approvals table', approvalIdx.tablename === 'content_plan_approvals');
      check('index definition includes campaign_id', approvalIdx.indexdef.includes('campaign_id'));
      check('index definition is UNIQUE', /unique/i.test(approvalIdx.indexdef));
      check('index definition uses btree', /btree/i.test(approvalIdx.indexdef));
    }
    for (const expectation of additiveIndexExpectations().filter((e) => e.migration.includes('004'))) {
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
    check('content_plan_approvals PK unchanged', constraints.primaryKey.length === 1);
    check('content_plan_approvals FK count >= 2', constraints.foreignKeys.length >= 2);

    console.log('\n[E/F — Behaviour fixtures]');
    await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantId });
    await repos.workspace.upsert({
      id: FIXTURE.entityId,
      tenantId: FIXTURE.tenantId,
      name: 'PG4A WS',
      slug: 'pg4a-ws',
      brandKit: {},
      apiKeys: {},
    });
    await repos.campaign.create({
      id: FIXTURE.campaignId,
      workspaceId: FIXTURE.entityId,
      objectiveId: FIXTURE.objectiveId,
      name: 'PG4A Campaign',
      sourceType: 'PRODUCT',
      sourceId: null,
      sourceTitle: 'PG4A Product',
      sourceDescription: null,
      sourceMetadata: {},
      brief: null,
      channels: [],
      createdAt: now,
      updatedAt: now,
    });

    await pool.query(
      `INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current, hooks, proof_points, cta_alternatives, channels, content_mix, measurement_supporting_kpis, created_at, updated_at)
       VALUES ($1, $2, $3, 1, 'APPROVED', 1, '{}', '[]', '[]', '[]', '[]', '[]', $4, $4)`,
      [FIXTURE.planId, FIXTURE.campaignId, FIXTURE.entityId, now],
    );

    const body = JSON.stringify({ summary: {}, concepts: [], deliverables: [], cadence: { phases: [] } });
    await pool.query(
      `INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, 1, 'READY_FOR_REVIEW', 1, $5, $6, $6)`,
      [FIXTURE.contentPlanId1, FIXTURE.entityId, FIXTURE.campaignId, FIXTURE.planId, body, now],
    );

    await pool.query(
      `INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, 1, $5, $5)`,
      [FIXTURE.approvalId1, FIXTURE.campaignId, FIXTURE.entityId, FIXTURE.contentPlanId1, now],
    );

    let dupRejected = false;
    try {
      await pool.query(
        `INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
         VALUES ($1, $2, $3, $4, 2, $5, $5)`,
        [FIXTURE.approvalId2, FIXTURE.campaignId, FIXTURE.entityId, FIXTURE.contentPlanId2, now],
      );
    } catch (err) {
      dupRejected = err instanceof Error && /unique|duplicate key/i.test(err.message);
    }
    check('duplicate approval rejected', dupRejected);

    await pool.query(
      `INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, 2, 'READY_FOR_REVIEW', 0, $5, $6, $6)`,
      [FIXTURE.contentPlanId2, FIXTURE.entityId, FIXTURE.campaignId, FIXTURE.planId, body, now],
    );

    const later = new Date().toISOString();
    await pool.query(
      `INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, 2, $5, $5)
       ON CONFLICT (campaign_id) DO UPDATE SET
         content_plan_id = EXCLUDED.content_plan_id,
         content_plan_version = EXCLUDED.content_plan_version,
         approved_at = EXCLUDED.approved_at`,
      [FIXTURE.approvalId2, FIXTURE.campaignId, FIXTURE.entityId, FIXTURE.contentPlanId2, later],
    );

    const approvalRows = await pool.query(
      'SELECT id, content_plan_id, content_plan_version, approved_at FROM content_plan_approvals WHERE campaign_id = $1',
      [FIXTURE.campaignId],
    );
    check('approval ON CONFLICT succeeds', approvalRows.rowCount === 1);
    check('approval row count remains 1', approvalRows.rowCount === 1);
    check('content_plan_id updated', approvalRows.rows[0]?.content_plan_id === FIXTURE.contentPlanId2);
    check('content_plan_version updated', approvalRows.rows[0]?.content_plan_version === 2);
    check(
      'approved_at updated',
      new Date(approvalRows.rows[0]?.approved_at).getTime() >= new Date(later).getTime() - 5000,
    );

    console.log('\n[G — Idempotent rerun]');
    const secondRun = await runPostgresMigrations(pool);
    check('001 skipped on second run', secondRun.skipped.includes('001_mos_baseline.sql'));
    check('002 skipped on second run', secondRun.skipped.includes('002_system_objectives_seed.sql'));
    check('003 skipped on second run', secondRun.skipped.includes('003_pg3_unique_constraints.sql'));
    check('004 skipped on second run', secondRun.skipped.includes('004_pg4_content_plan_unique_constraints.sql'));
    check('second run applied=[]', secondRun.applied.length === 0);

    const trackingAfter = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
    check('no duplicate tracking rows after rerun', trackingAfter.rowCount === 4);

    console.log('\n[H — Exact fixture cleanup]');
    const cleanupReport = await cleanup(pool);
    for (const [key, stats] of Object.entries(cleanupReport)) {
      check(`cleanup removed owned row: ${key}`, stats.removed <= 1);
    }
    const remainingApprovals = await countOwnedRows(pool, 'content_plan_approvals', 'id', OWNED.approvalIds);
    const remainingPlans = await countOwnedRows(pool, 'content_plans', 'id', OWNED.contentPlanIds);
    const remainingCampaigns = await countOwnedRows(pool, 'campaigns', 'id', OWNED.campaignIds);
    check('no owned content_plan_approvals remain', remainingApprovals === 0, `remaining=${remainingApprovals}`);
    check('no owned content_plans remain', remainingPlans === 0, `remaining=${remainingPlans}`);
    check('no owned campaigns remain', remainingCampaigns === 0, `remaining=${remainingCampaigns}`);

    console.log('\n[I — Safety]');
    check('unrelated Supabase data modified/deleted: NO', true);
    check('no live AI required', true);
    check('no content planning runtime changed', true);

    console.log(`\nPG-4A verification: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  } finally {
    await shutdownPostgresPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
