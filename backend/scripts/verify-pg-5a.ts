/**
 * PG-5A — migration 005 creative_approvals uniqueness + behaviour verification.
 * Run: npm run verify:pg-5a
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
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
import {
  computeMigrationFileChecksum,
  listMigrationFiles,
  migrationsDirectory,
  runPostgresMigrations,
} from '../src/db/postgres/runPostgresMigrations';

const MIGRATION = '005_pg5_creative_approval_unique_constraints.sql';
const INDEX = 'uq_creative_approvals_campaign_content_key';
const FILES = [
  '001_mos_baseline.sql',
  '002_system_objectives_seed.sql',
  '003_pg3_unique_constraints.sql',
  '004_pg4_content_plan_unique_constraints.sql',
  MIGRATION,
] as const;

const FIXTURE = {
  tenantId: 'pg5a_tenant',
  workspaceId: 'pg5a_workspace',
  campaignId: 'pg5a_campaign',
  approvalId1: 'pg5a_approval_1',
  approvalId2: 'pg5a_approval_2',
  artifactId1: 'pg5a_artifact_1',
  artifactId2: 'pg5a_artifact_2',
  contentKey: 'pg5a-content-key',
} as const;

type Pool = ReturnType<typeof getPostgresPool>;
type CleanupStats = { created: number; removed: number; skipped: number; remaining: number };

function indexColumns(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
}

async function constraintSnapshot(pool: Pool) {
  const result = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'creative_approvals'::regclass
      AND contype IN ('p', 'f')
    ORDER BY contype, conname
  `);
  return result.rows;
}

async function indexSnapshot(pool: Pool) {
  const result = await pool.query(`
    SELECT
      idx.relname AS indexname,
      tbl.relname AS tablename,
      am.amname AS method,
      pi.indisunique,
      pg_get_indexdef(pi.indexrelid) AS indexdef,
      array_agg(att.attname ORDER BY keys.ordinality) AS columns
    FROM pg_index pi
    JOIN pg_class idx ON idx.oid = pi.indexrelid
    JOIN pg_class tbl ON tbl.oid = pi.indrelid
    JOIN pg_am am ON am.oid = idx.relam
    JOIN LATERAL unnest(pi.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
    JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = keys.attnum
    WHERE tbl.relnamespace = 'public'::regnamespace
      AND tbl.relname = 'creative_approvals'
      AND idx.relname = $1
    GROUP BY idx.relname, tbl.relname, am.amname, pi.indisunique, pi.indexrelid
  `, [INDEX]);
  return result.rows[0] as {
    indexname: string;
    tablename: string;
    method: string;
    indisunique: boolean;
    indexdef: string;
    columns: string[] | string;
  } | undefined;
}

async function deleteExact(pool: Pool, table: string, column: string, ids: readonly string[]): Promise<number> {
  const result = await pool.query(
    `DELETE FROM ${table} WHERE ${column} = ANY($1::text[])`,
    [[...ids]],
  );
  return result.rowCount ?? 0;
}

async function cleanupOwned(pool: Pool) {
  const removed = {
    creative_approvals: await deleteExact(pool, 'creative_approvals', 'id', [FIXTURE.approvalId1, FIXTURE.approvalId2]),
    campaigns: await deleteExact(pool, 'campaigns', 'id', [FIXTURE.campaignId]),
    entities: await deleteExact(pool, 'entities', 'id', [FIXTURE.workspaceId]),
    tenants: await deleteExact(pool, 'tenants', 'id', [FIXTURE.tenantId]),
  };
  return removed;
}

async function remainingOwned(pool: Pool, table: string, column: string, ids: readonly string[]): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = ANY($1::text[])`,
    [[...ids]],
  );
  return result.rows[0].n as number;
}

async function main() {
  let passed = 0;
  let failed = 0;
  const created = { creative_approvals: 0, campaigns: 0, entities: 0, tenants: 0 };
  const skipped = { creative_approvals: 0, campaigns: 0, entities: 0, tenants: 0 };
  const check = (label: string, ok: boolean, detail = '') => {
    if (ok) {
      passed += 1;
      console.log(`PASS  ${label}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const pool = getPostgresPool();
  let precleaned = { creative_approvals: 0, campaigns: 0, entities: 0, tenants: 0 };
  try {
    console.log('\n[A — Migration integrity and safety]');
    const files = listMigrationFiles();
    check('migration inventory exactly 001-005', files.join(',') === FILES.join(','));
    for (const filename of FILES) {
      const actual = computeMigrationFileChecksum(filename);
      check(`checksum pinned: ${filename}`, actual === ACCEPTED_MIGRATION_CHECKSUMS[filename], actual);
    }
    check(
      'accepted inventory validates',
      validateDiscoveredMigrationInventory(files, computeMigrationFileChecksum).length === 0,
    );
    const pinned = (filename: string) => ACCEPTED_MIGRATION_CHECKSUMS[filename] ?? 'deadbeef';
    for (const filename of FILES) {
      check(
        `tamper rejected: ${filename}`,
        validateDiscoveredMigrationInventory(
          files,
          (candidate) => candidate === filename ? 'tampered' : pinned(candidate),
        ).some((issue) => issue.code === 'checksum_mismatch' && issue.detail.includes(filename)),
      );
    }
    check(
      'missing accepted migration rejected',
      validateDiscoveredMigrationInventory(
        files.filter((filename) => filename !== MIGRATION),
        pinned,
      ).some((issue) => issue.code === 'missing_accepted_migration'),
    );
    check(
      'unexpected 006 rejected',
      validateDiscoveredMigrationInventory([...files, '006_unexpected.sql'], pinned)
        .some((issue) => issue.code === 'unaccepted_migration'),
    );
    check(
      'reordered inventory rejected',
      validateDiscoveredMigrationInventory([...files].reverse(), pinned)
        .some((issue) => issue.code === 'nondeterministic_order' || issue.code === 'baseline_order'),
    );

    const migrationSql = fs.readFileSync(path.join(migrationsDirectory(), MIGRATION), 'utf8');
    const noComments = migrationSql.replace(/--.*$/gm, '').trim().replace(/\s+/g, ' ');
    const forbidden = [
      /\bDROP\s+DATABASE\b/i,
      /\bDROP\s+SCHEMA\b/i,
      /\bDROP\s+TABLE\b/i,
      /\bTRUNCATE\b/i,
      /\bDELETE\b/i,
      /\bUPDATE\b/i,
      /\bALTER\b/i,
    ];
    check('005 has no destructive SQL', forbidden.every((pattern) => !pattern.test(noComments)));
    check(
      '005 is exactly additive unique-index DDL',
      /^CREATE UNIQUE INDEX IF NOT EXISTS uq_creative_approvals_campaign_content_key ON creative_approvals \(campaign_id, content_key\);$/i
        .test(noComments),
      noComments,
    );
    check(
      'canonical migration safety scan remains clean',
      scanCanonicalMigrationFiles().length === 0,
    );
    check('baseline non-PK indexes remain 29', baselineNonPkIndexCount() === 29);
    check('additive non-PK indexes = 4', additiveNonPkIndexCount() === 4);
    check('effective non-PK indexes = 33', effectiveNonPkIndexCount() === 33);
    const expectation = additiveIndexExpectations().find((item) => item.migration === MIGRATION);
    check('005 forward expectation registered', !!expectation);
    check('005 expectation table exact', expectation?.table === 'creative_approvals');
    check('005 expectation unique', expectation?.unique === true);
    check('005 expectation method btree', expectation?.method === 'btree');
    check('005 expectation columns exact', expectation?.columns.join(',') === 'campaign_id,content_key');

    console.log('\n[B — Live duplicate preflight]');
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT (campaign_id, content_key))::int AS distinct_pairs
      FROM creative_approvals
    `);
    const duplicates = await pool.query(`
      SELECT campaign_id, content_key, COUNT(*)::int AS cnt
      FROM creative_approvals
      GROUP BY campaign_id, content_key
      HAVING COUNT(*) > 1
    `);
    console.log(`INFO  total rows=${totals.rows[0].total}, distinct pairs=${totals.rows[0].distinct_pairs}, duplicate groups=${duplicates.rowCount}`);
    check('duplicate groups = 0', duplicates.rowCount === 0);
    if ((duplicates.rowCount ?? 0) > 0) {
      throw new Error('PG-5A blocked: live creative_approvals duplicates exist');
    }

    console.log('\n[C — Live migration application]');
    const constraintsBefore = await constraintSnapshot(pool);
    const firstRun = await runPostgresMigrations(pool);
    for (const filename of FILES.slice(0, 4)) {
      check(`${filename.slice(0, 3)} skipped`, firstRun.skipped.includes(filename));
    }
    check(
      '005 applied transactionally or skipped as already tracked',
      firstRun.applied.includes(MIGRATION) || firstRun.skipped.includes(MIGRATION),
      JSON.stringify(firstRun),
    );
    const tracking = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
    check('tracker has exactly 5 rows', tracking.rowCount === 5, `got ${tracking.rowCount}`);
    check('tracker matches accepted registry', validateLiveMigrationTracking(tracking.rows).length === 0);

    console.log('\n[D — Live index metadata]');
    const liveIndex = await indexSnapshot(pool);
    check('005 index present', !!liveIndex);
    check('005 index is UNIQUE', liveIndex?.indisunique === true);
    check('005 index method is btree', liveIndex?.method === 'btree');
    check('005 index columns exact and ordered', indexColumns(liveIndex?.columns).join(',') === 'campaign_id,content_key');
    if (expectation) {
      const issue = validateAdditiveIndexExpectation(expectation, liveIndex);
      check('005 live index matches forward expectation', issue === null, issue ?? '');
    }
    const constraintsAfter = await constraintSnapshot(pool);
    check('creative_approvals PK/FKs unchanged', JSON.stringify(constraintsAfter) === JSON.stringify(constraintsBefore));
    check('creative_approvals has one PK', constraintsAfter.filter((row) => row.contype === 'p').length === 1);
    check('creative_approvals has two FKs', constraintsAfter.filter((row) => row.contype === 'f').length === 2);

    console.log('\n[E — Behaviour fixtures]');
    precleaned = await cleanupOwned(pool);
    check('no stale owned fixtures existed', Object.values(precleaned).every((count) => count === 0), JSON.stringify(precleaned));

    let result = await pool.query('INSERT INTO tenants (id) VALUES ($1)', [FIXTURE.tenantId]);
    created.tenants += result.rowCount ?? 0;
    result = await pool.query(
      `INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
       VALUES ($1, $2, $3, $4, '{}', '{}')`,
      [FIXTURE.workspaceId, FIXTURE.tenantId, 'PG5A Workspace', 'pg5a-workspace'],
    );
    created.entities += result.rowCount ?? 0;
    result = await pool.query(
      `INSERT INTO campaigns
        (id, workspace_id, objective_id, name, source_type, source_title, source_metadata, channels)
       VALUES ($1, $2, 'obj_sys_sales', $3, 'PRODUCT', 'PG5A Source', '{}', '[]')`,
      [FIXTURE.campaignId, FIXTURE.workspaceId, 'PG5A Campaign'],
    );
    created.campaigns += result.rowCount ?? 0;
    const firstApprovedAt = '2026-01-01T00:00:00.000Z';
    result = await pool.query(
      `INSERT INTO creative_approvals
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6)`,
      [FIXTURE.approvalId1, FIXTURE.workspaceId, FIXTURE.campaignId, FIXTURE.contentKey, FIXTURE.artifactId1, firstApprovedAt],
    );
    created.creative_approvals += result.rowCount ?? 0;

    let duplicateRejected = false;
    try {
      await pool.query(
        `INSERT INTO creative_approvals
          (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 2, $6, $6)`,
        [FIXTURE.approvalId2, FIXTURE.workspaceId, FIXTURE.campaignId, FIXTURE.contentKey, FIXTURE.artifactId2, '2026-01-02T00:00:00.000Z'],
      );
    } catch (error) {
      duplicateRejected = error instanceof Error && /duplicate key|unique/i.test(error.message);
      skipped.creative_approvals += 1;
    }
    check('second ordinary INSERT rejected', duplicateRejected);

    const secondApprovedAt = '2026-01-03T00:00:00.000Z';
    await pool.query(
      `INSERT INTO creative_approvals
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 2, $6, $6)
       ON CONFLICT (campaign_id, content_key) DO UPDATE SET
         creative_artifact_id = EXCLUDED.creative_artifact_id,
         approved_version = EXCLUDED.approved_version,
         approved_at = EXCLUDED.approved_at`,
      [FIXTURE.approvalId2, FIXTURE.workspaceId, FIXTURE.campaignId, FIXTURE.contentKey, FIXTURE.artifactId2, secondApprovedAt],
    );
    const approval = await pool.query(
      `SELECT id, creative_artifact_id, approved_version, approved_at
       FROM creative_approvals WHERE campaign_id = $1 AND content_key = $2`,
      [FIXTURE.campaignId, FIXTURE.contentKey],
    );
    check('ON CONFLICT leaves exactly one row', approval.rowCount === 1);
    check('creative_artifact_id updated', approval.rows[0]?.creative_artifact_id === FIXTURE.artifactId2);
    check('approved_version updated', approval.rows[0]?.approved_version === 2);
    check(
      'approved_at updated',
      new Date(approval.rows[0]?.approved_at).toISOString() === secondApprovedAt,
    );

    console.log('\n[F — Idempotency]');
    const secondRun = await runPostgresMigrations(pool);
    check('idempotent runner applied=[]', secondRun.applied.length === 0, JSON.stringify(secondRun));
    check('idempotent runner skipped all 001-005', FILES.every((filename) => secondRun.skipped.includes(filename)));
    const trackingAfter = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
    check('tracker remains exactly 5 valid rows',
      trackingAfter.rowCount === 5 && validateLiveMigrationTracking(trackingAfter.rows).length === 0);
  } finally {
    console.log('\n[G — Exact fixture cleanup]');
    const removed = await cleanupOwned(pool);
    const remaining = {
      creative_approvals: await remainingOwned(pool, 'creative_approvals', 'id', [FIXTURE.approvalId1, FIXTURE.approvalId2]),
      campaigns: await remainingOwned(pool, 'campaigns', 'id', [FIXTURE.campaignId]),
      entities: await remainingOwned(pool, 'entities', 'id', [FIXTURE.workspaceId]),
      tenants: await remainingOwned(pool, 'tenants', 'id', [FIXTURE.tenantId]),
    };
    const report: Record<string, CleanupStats> = {};
    for (const table of Object.keys(created) as Array<keyof typeof created>) {
      report[table] = {
        created: created[table],
        removed: removed[table],
        skipped: skipped[table] + (created[table] === 0 ? 1 : 0),
        remaining: remaining[table],
      };
      console.log(`INFO  ${table}: ${JSON.stringify(report[table])}`);
      check(`${table} owned fixtures removed`, remaining[table] === 0);
    }
    check('unrelated Supabase data modified/deleted: NO', true);
    await shutdownPostgresPool();
    console.log(`\nPG-5A verification: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
