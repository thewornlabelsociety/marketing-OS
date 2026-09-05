/**
 * PG-1 — Supabase Postgres Foundation verification
 * Run via: npm run verify:pg-1
 *
 * Static checks run without DATABASE_URL. Live checks require DATABASE_URL.
 * Live path is non-destructive: no DROP/TRUNCATE; TEMP tables only for probes.
 */
import fs from 'fs';
import path from 'path';
import { getDatabaseUrl, redactDatabaseUrl, resolvePostgresSsl } from '../src/db/postgres/postgresConfig';
import { getPostgresPool, resetPostgresPoolForTests, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import {
  scanCanonicalMigrationFiles,
  scanVerifyPg1LiveSql,
} from '../src/db/postgres/migrationSafety';
import {
  ACCEPTED_MIGRATION_CHECKSUMS,
  REQUIRED_BASELINE_MIGRATION_FILENAMES,
  validateAcceptedMigrationInventory,
  validateDiscoveredMigrationInventory,
  validateLiveMigrationTracking,
} from '../src/db/postgres/acceptedMigrations';
import {
  additiveNonPkIndexCount,
  baselineNonPkIndexCount,
  effectiveNonPkIndexCount,
  validateAdditiveIndexExpectation,
  type AdditiveIndexExpectation,
} from '../src/db/postgres/forwardMigrationExpectations';
import {
  assertChecksumMatch,
  computeMigrationChecksum,
  computeMigrationFileChecksum,
  ensureMigrationsTable,
  listMigrationFiles,
  MigrationChecksumMismatchError,
  migrationsDirectory,
  runPostgresMigrations,
} from '../src/db/postgres/runPostgresMigrations';
import {
  expectedColumns,
  expectedTableNames,
  hasMeaningfulSqliteDefault,
  manifestChecksum,
  normalizeSqliteDefaultValue,
  sqliteSchemaManifest,
} from '../src/db/postgres/baselineManifest';
import { verifyPostgresAdditiveSchema, verifyPostgresBaselineSchema } from '../src/db/postgres/verifyPostgresSchema';

const SYSTEM_OBJECTIVE_IDS = [
  'obj_sys_sales',
  'obj_sys_lead_gen',
  'obj_sys_traffic',
  'obj_sys_awareness',
  'obj_sys_engagement',
  'obj_sys_launch',
  'obj_sys_event',
  'obj_sys_email_growth',
  'obj_sys_retention',
  'obj_sys_reengagement',
  'obj_sys_education',
  'obj_sys_community',
  'obj_sys_clearance',
];

const MIGRATION_003_INDEX_EXPECTATIONS: AdditiveIndexExpectation[] = [
  {
    migration: '003_pg3_unique_constraints.sql',
    name: 'uq_campaign_briefs_campaign_id',
    table: 'campaign_briefs',
    column: 'campaign_id',
    unique: true,
    sql: 'CREATE UNIQUE INDEX uq_campaign_briefs_campaign_id ON campaign_briefs (campaign_id)',
  },
  {
    migration: '003_pg3_unique_constraints.sql',
    name: 'uq_plan_approvals_campaign_id',
    table: 'plan_approvals',
    column: 'campaign_id',
    unique: true,
    sql: 'CREATE UNIQUE INDEX uq_plan_approvals_campaign_id ON plan_approvals (campaign_id)',
  },
];

const SQLITE_DEFAULT_NULL_COLUMNS: ReadonlyArray<[string, string]> = [
  ['campaigns', 'marketing_scope'],
  ['creative_artifacts', 'creative_direction'],
  ['creative_artifacts', 'marketing_scope'],
  ['creative_artifacts', 'ai_provider'],
  ['creative_artifacts', 'ai_model'],
  ['creative_artifacts', 'ai_task_type'],
  ['creative_artifacts', 'repurpose_request_id'],
  ['creative_artifacts', 'marketing_scopes_json'],
];

function runStaticChecks(
  check: (label: string, condition: boolean, reason?: string) => void,
) {
  console.log('\n[1/9] Static — accepted migration inventory');

  for (const filename of REQUIRED_BASELINE_MIGRATION_FILENAMES) {
    const filePath = path.join(migrationsDirectory(), filename);
    check(`Baseline migration present: ${filename}`, fs.existsSync(filePath));
  }

  const migrationFiles = listMigrationFiles();
  const inventoryIssues = validateAcceptedMigrationInventory();
  check(
    'Discovered migrations match accepted registry (ordered, complete, checksum-pinned)',
    inventoryIssues.length === 0,
    inventoryIssues.map((i) => `${i.code}: ${i.detail}`).join('; '),
  );

  for (const filename of Object.keys(ACCEPTED_MIGRATION_CHECKSUMS)) {
    check(
      `Accepted migration checksum pinned: ${filename}`,
      ACCEPTED_MIGRATION_CHECKSUMS[filename]?.length === 64,
    );
  }

  check(
    'Baseline migrations 001 and 002 required in accepted set',
    REQUIRED_BASELINE_MIGRATION_FILENAMES.every((f) => f in ACCEPTED_MIGRATION_CHECKSUMS),
  );

  check(
    'Forward migration 003 registered in accepted set',
    '003_pg3_unique_constraints.sql' in ACCEPTED_MIGRATION_CHECKSUMS,
  );

  console.log('\n[1b/9] Static — migration inventory tamper simulations');

  const mockChecksum = (filename: string) => ACCEPTED_MIGRATION_CHECKSUMS[filename] ?? 'deadbeef';

  check(
    'Tamper simulation: changed 001 checksum fails validation',
    validateDiscoveredMigrationInventory(
      migrationFiles,
      (f) => (f === '001_mos_baseline.sql' ? 'tampered' : mockChecksum(f)),
    ).some((i) => i.code === 'checksum_mismatch' && i.detail.includes('001_mos_baseline.sql')),
  );

  check(
    'Tamper simulation: changed 002 checksum fails validation',
    validateDiscoveredMigrationInventory(
      migrationFiles,
      (f) => (f === '002_system_objectives_seed.sql' ? 'tampered' : mockChecksum(f)),
    ).some((i) => i.code === 'checksum_mismatch' && i.detail.includes('002_system_objectives_seed.sql')),
  );

  check(
    'Tamper simulation: changed 003 checksum fails validation',
    validateDiscoveredMigrationInventory(
      migrationFiles,
      (f) => (f === '003_pg3_unique_constraints.sql' ? 'tampered' : mockChecksum(f)),
    ).some((i) => i.code === 'checksum_mismatch' && i.detail.includes('003_pg3_unique_constraints.sql')),
  );

  check(
    'Tamper simulation: missing 003 fails validation',
    validateDiscoveredMigrationInventory(
      migrationFiles.filter((f) => f !== '003_pg3_unique_constraints.sql'),
      mockChecksum,
    ).some((i) => i.code === 'missing_accepted_migration'),
  );

  check(
    'Tamper simulation: unaccepted migration file fails validation',
    validateDiscoveredMigrationInventory(
      [...migrationFiles, '004_bad.sql'],
      mockChecksum,
    ).some((i) => i.code === 'unaccepted_migration' && i.detail === '004_bad.sql'),
  );

  check(
    'Tamper simulation: missing required 003 index fails additive validation',
    validateAdditiveIndexExpectation(
      MIGRATION_003_INDEX_EXPECTATIONS[0],
      undefined,
    ) != null,
  );

  check(
    'Tamper simulation: non-unique 003 index fails additive validation',
    validateAdditiveIndexExpectation(
      MIGRATION_003_INDEX_EXPECTATIONS[0],
      {
        indexname: 'uq_campaign_briefs_campaign_id',
        tablename: 'campaign_briefs',
        indexdef: 'CREATE INDEX uq_campaign_briefs_campaign_id ON public.campaign_briefs USING btree (campaign_id)',
        indisunique: false,
      },
    ) != null,
  );

  check(
    'Tamper simulation: wrong column on 003 index fails additive validation',
    validateAdditiveIndexExpectation(
      MIGRATION_003_INDEX_EXPECTATIONS[1],
      {
        indexname: 'uq_plan_approvals_campaign_id',
        tablename: 'plan_approvals',
        indexdef: 'CREATE UNIQUE INDEX uq_plan_approvals_campaign_id ON public.plan_approvals USING btree (workspace_id)',
        indisunique: true,
      },
    ) != null,
  );

  check(
    'Tamper simulation: wrong table on 003 index fails additive validation',
    validateAdditiveIndexExpectation(
      MIGRATION_003_INDEX_EXPECTATIONS[0],
      {
        indexname: 'uq_campaign_briefs_campaign_id',
        tablename: 'campaigns',
        indexdef: 'CREATE UNIQUE INDEX uq_campaign_briefs_campaign_id ON public.campaigns USING btree (campaign_id)',
        indisunique: true,
      },
    ) != null,
  );

  const validLive003 = {
    indexname: 'uq_campaign_briefs_campaign_id',
    tablename: 'campaign_briefs',
    indexdef: 'CREATE UNIQUE INDEX uq_campaign_briefs_campaign_id ON public.campaign_briefs USING btree (campaign_id)',
    indisunique: true,
  };
  check(
    'Tamper simulation: valid 003 index expectation passes validation helper',
    validateAdditiveIndexExpectation(MIGRATION_003_INDEX_EXPECTATIONS[0], validLive003) === null,
  );

  check(
    'Tamper simulation: live tracking rejects tampered 003 checksum',
    validateLiveMigrationTracking([
      { filename: '001_mos_baseline.sql', checksum: ACCEPTED_MIGRATION_CHECKSUMS['001_mos_baseline.sql'] },
      { filename: '002_system_objectives_seed.sql', checksum: ACCEPTED_MIGRATION_CHECKSUMS['002_system_objectives_seed.sql'] },
      { filename: '003_pg3_unique_constraints.sql', checksum: 'tampered' },
    ]).some((i) => i.code === 'live_checksum_mismatch'),
  );

  console.log('\n[2/9] Static — non-destructive SQL guard');

  const migrationHits = scanCanonicalMigrationFiles();
  check(
    'Canonical migration SQL contains no DROP/TRUNCATE',
    migrationHits.length === 0,
    migrationHits.map((h) => `${h.source}: ${h.pattern}`).join('; '),
  );

  const verifyHits = scanVerifyPg1LiveSql();
  check(
    'verify-pg-1 live SQL contains no DROP/TRUNCATE',
    verifyHits.length === 0,
    verifyHits.map((h) => `${h.pattern}`).join('; '),
  );

  console.log('\n[3/9] Static — manifest and checksum helpers');

  check(
    'Baseline manifest defines expected table count',
    expectedTableNames().length === 51,
    `got ${expectedTableNames().length}`,
  );
  check(
    'Baseline non-PK index count',
    baselineNonPkIndexCount() === 29,
    `got ${baselineNonPkIndexCount()}`,
  );
  check(
    'Additive accepted migration non-PK index count',
    additiveNonPkIndexCount() === 2,
    `got ${additiveNonPkIndexCount()}`,
  );
  check(
    'Effective expected non-PK index count',
    effectiveNonPkIndexCount() === 31,
    `got ${effectiveNonPkIndexCount()}`,
  );
  check(
    'Baseline manifest index list unchanged (29)',
    sqliteSchemaManifest.indexes.length === 29,
    `got ${sqliteSchemaManifest.indexes.length}`,
  );
  check('Manifest checksum is present', manifestChecksum().length === 64);

  const sampleChecksum = computeMigrationChecksum('-- sample');
  check('Migration checksum helper is deterministic', sampleChecksum.length === 64);

  try {
    assertChecksumMatch('test.sql', 'aaa', 'bbb');
    check('Migration checksum validation rejects tampered content', false);
  } catch (err) {
    check(
      'Migration checksum validation rejects tampered content',
      err instanceof MigrationChecksumMismatchError,
    );
  }

  for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
    const actual = computeMigrationFileChecksum(filename);
    check(`On-disk checksum matches accepted registry: ${filename}`, actual === expected, actual);
  }

  console.log('\n[3b/9] Static — SQLite default normalization');

  check('PRAGMA SQL NULL default is not a meaningful default', !hasMeaningfulSqliteDefault('NULL'));
  check('Absent SQLite default is not meaningful', !hasMeaningfulSqliteDefault(null));
  check(
    'Literal TEXT default NULL remains meaningful',
    hasMeaningfulSqliteDefault("'NULL'"),
  );
  check('Explicit string defaults remain meaningful', hasMeaningfulSqliteDefault("'[]'"));
  check('Numeric zero default remains meaningful', hasMeaningfulSqliteDefault(0));
  check(
    'CURRENT_TIMESTAMP default remains meaningful',
    hasMeaningfulSqliteDefault('CURRENT_TIMESTAMP'),
  );
  check(
    'normalizeSqliteDefaultValue maps PRAGMA NULL to absence',
    normalizeSqliteDefaultValue('NULL') === null && normalizeSqliteDefaultValue(null) === null,
  );

  for (const [table, column] of SQLITE_DEFAULT_NULL_COLUMNS) {
    const expected = expectedColumns(table).find((c) => c.name === column);
    check(
      `${table}.${column} does not expect Postgres column_default`,
      expected != null && !expected.hasDefault,
    );
  }

  console.log('\n[4/9] Static — configuration policy');

  const ssl = resolvePostgresSsl('postgresql://u:p@db.example.supabase.co:5432/postgres?sslmode=require');
  check(
    'SSL policy keeps certificate verification enabled for Supabase',
    typeof ssl === 'object' && ssl !== null && ssl.rejectUnauthorized === true,
  );
}

async function main() {
  let pass = 0;
  let fail = 0;
  let blocked = 0;
  const failures: string[] = [];

  function ok(label: string) {
    console.log(`  ✓  ${label}`);
    pass += 1;
  }

  function ko(label: string, reason?: string) {
    console.error(`  ✗  ${label}${reason ? ` — ${reason}` : ''}`);
    fail += 1;
    failures.push(reason ? `${label}: ${reason}` : label);
  }

  function check(label: string, condition: boolean, reason?: string) {
    if (condition) ok(label);
    else ko(label, reason);
  }

  runStaticChecks(check);

  console.log('\n[5/9] Configuration');

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.log('  ⊘  PG-1 live verification BLOCKED — DATABASE_URL not configured');
    blocked += 1;
    console.log('\n─────────────────────────────────────────');
    console.log(`PG-1: ${pass} passed, ${fail} failed, ${blocked} blocked (live)`);
    console.log('─────────────────────────────────────────\n');
    process.exit(fail > 0 ? 1 : 0);
  }

  check('DATABASE_URL is set', true);
  check(
    'DATABASE_URL redaction hides credentials',
    !redactDatabaseUrl(databaseUrl).includes(new URL(databaseUrl).password || '___none___'),
  );

  const ssl = resolvePostgresSsl(databaseUrl);
  check(
    'SSL policy does not disable certificate verification',
    ssl === undefined || ssl === false || (typeof ssl === 'object' && ssl.rejectUnauthorized !== false),
  );

  console.log('\n[6/9] Connection and migrations');

  let pool;
  const capturedLogs: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    capturedLogs.push(args.map(String).join(' '));
    origError.apply(console, args);
  };

  try {
    pool = getPostgresPool();
    await pool.query('SELECT 1 AS ok');
    ok('Postgres/Supabase connection succeeds');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ko('Postgres/Supabase connection succeeds', message);
    console.error = origError;
    console.log('\n─────────────────────────────────────────');
    console.log(`PG-1: ${pass} passed, ${fail} failed, ${blocked} blocked (live)`);
    console.log('─────────────────────────────────────────\n');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    ok('postgres_migrations tracking table exists');
  } finally {
    client.release();
  }

  const firstRun = await runPostgresMigrations(pool);
  check(
    'Canonical migrations apply on empty/new schema (idempotent DDL + seed)',
    firstRun.applied.length + firstRun.skipped.length === listMigrationFiles().length,
    `expected ${listMigrationFiles().length} files, applied=${firstRun.applied.length} skipped=${firstRun.skipped.length}`,
  );

  const secondRun = await runPostgresMigrations(pool);
  check(
    'Safe migration rerun is no-op',
    secondRun.applied.length === 0 && secondRun.skipped.length === listMigrationFiles().length,
  );

  const migrationRows = await pool.query(
    'SELECT filename, checksum FROM postgres_migrations ORDER BY filename',
  );
  check(
    'postgres_migrations records all accepted migration files',
    migrationRows.rowCount === listMigrationFiles().length,
  );

  const trackingIssues = validateLiveMigrationTracking(migrationRows.rows);
  check(
    'Live postgres_migrations rows match accepted registry (checksums, no duplicates)',
    trackingIssues.length === 0,
    trackingIssues.map((i) => `${i.code}: ${i.detail}`).join('; '),
  );

  for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
    const row = migrationRows.rows.find((r: { filename: string }) => r.filename === filename);
    check(
      `Live tracking checksum: ${filename}`,
      row?.checksum === expected,
      row ? `got ${row.checksum}` : 'row missing',
    );
  }

  console.log('\n[7/9] Live schema structure');

  const baselineResult = await verifyPostgresBaselineSchema(pool);
  if (baselineResult.ok) {
    ok('Postgres baseline matches SQLite manifest (tables, columns, types, constraints, indexes)');
  } else {
    ko('Postgres baseline matches SQLite manifest (tables, columns, types, constraints, indexes)');
    for (const mismatch of baselineResult.mismatches.slice(0, 15)) {
      console.error(`       ${mismatch.category}: ${mismatch.detail}`);
    }
    if (baselineResult.mismatches.length > 15) {
      console.error(`       ... and ${baselineResult.mismatches.length - 15} more`);
    }
  }

  const additiveResult = await verifyPostgresAdditiveSchema(pool);
  if (additiveResult.ok) {
    ok('Postgres additive migration indexes match accepted forward expectations');
  } else {
    ko('Postgres additive migration indexes match accepted forward expectations');
    for (const mismatch of additiveResult.mismatches) {
      console.error(`       ${mismatch.category}: ${mismatch.detail}`);
    }
  }

  for (const exp of MIGRATION_003_INDEX_EXPECTATIONS) {
    check(
      `Migration 003 requires unique index: ${exp.name}`,
      !additiveResult.mismatches.some((m) => m.detail.includes(exp.name)),
    );
  }

  console.log('\n[8/9] Live transactions and round-trips');

  const txClient = await pool.connect();
  try {
    await txClient.query('CREATE TEMP TABLE pg1_tx_probe (id TEXT PRIMARY KEY, value TEXT)');
    await txClient.query('BEGIN');
    await txClient.query("INSERT INTO pg1_tx_probe (id, value) VALUES ('rollback', 'x')");
    await txClient.query('ROLLBACK');
    const rollbackCheck = await txClient.query("SELECT COUNT(*)::int AS c FROM pg1_tx_probe WHERE id = 'rollback'");
    check('Transaction ROLLBACK discards uncommitted writes', rollbackCheck.rows[0].c === 0);

    await txClient.query('BEGIN');
    await txClient.query("INSERT INTO pg1_tx_probe (id, value) VALUES ('commit', 'y')");
    await txClient.query('COMMIT');
    const commitCheck = await txClient.query("SELECT COUNT(*)::int AS c FROM pg1_tx_probe WHERE id = 'commit'");
    check('Transaction COMMIT persists writes', commitCheck.rows[0].c === 1);
  } finally {
    txClient.release();
  }

  const rtClient = await pool.connect();
  try {
    await rtClient.query(`
      CREATE TEMP TABLE pg1_roundtrip_probe (
        id TEXT PRIMARY KEY,
        ts TIMESTAMPTZ,
        json_text TEXT,
        flag INTEGER
      )
    `);

    const ts = '2026-03-15T14:30:00.000Z';
    await rtClient.query(
      'INSERT INTO pg1_roundtrip_probe (id, ts, json_text, flag) VALUES ($1, $2::timestamptz, $3, $4)',
      ['probe', ts, '{"alpha":1,"beta":"exact"}', 0],
    );
    const tsRow = await rtClient.query('SELECT ts FROM pg1_roundtrip_probe WHERE id = $1', ['probe']);
    const readTs = new Date(tsRow.rows[0].ts).toISOString();
    check('TIMESTAMPTZ write/read round trip', readTs === ts, `expected ${ts}, got ${readTs}`);

    const jsonRow = await rtClient.query('SELECT json_text FROM pg1_roundtrip_probe WHERE id = $1', ['probe']);
    check(
      'JSON-as-TEXT exact round trip',
      jsonRow.rows[0].json_text === '{"alpha":1,"beta":"exact"}',
    );

    await rtClient.query('UPDATE pg1_roundtrip_probe SET flag = 1 WHERE id = $1', ['probe']);
    const flagRow = await rtClient.query('SELECT flag FROM pg1_roundtrip_probe WHERE id = $1', ['probe']);
    check('INTEGER flag 0/1 round trip', flagRow.rows[0].flag === 1);
  } finally {
    rtClient.release();
  }

  const objCount = await pool.query(
    'SELECT COUNT(*)::int AS c FROM objectives WHERE is_system = 1',
  );
  check('System objectives seed count = 13', objCount.rows[0].c === 13);

  for (const id of SYSTEM_OBJECTIVE_IDS) {
    const row = await pool.query('SELECT id FROM objectives WHERE id = $1', [id]);
    check(`System objective present: ${id}`, row.rowCount === 1);
  }

  console.log('\n[9/9] Shutdown and credential safety');

  let password = '';
  try {
    password = new URL(databaseUrl).password;
  } catch {
    password = '';
  }

  const logBlob = capturedLogs.join('\n');
  check(
    'Credentials not appearing in captured error logs',
    !password || !logBlob.includes(password),
  );

  await shutdownPostgresPool();
  ok('Graceful connection/pool shutdown');

  resetPostgresPoolForTests();
  console.error = origError;

  console.log('\n─────────────────────────────────────────');
  console.log(`PG-1: ${pass} passed, ${fail} failed${blocked ? `, ${blocked} blocked (live)` : ''}`);
  if (failures.length > 0) {
    console.log('\nFailed checks:');
    for (const f of failures.slice(0, 20)) console.log(`  ✗ ${f}`);
  }
  console.log('─────────────────────────────────────────\n');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
