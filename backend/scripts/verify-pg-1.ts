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
  assertChecksumMatch,
  computeMigrationChecksum,
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
import { verifyPostgresSchema } from '../src/db/postgres/verifyPostgresSchema';

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

const CANONICAL_MIGRATIONS = ['001_mos_baseline.sql', '002_system_objectives_seed.sql'];

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
  console.log('\n[1/9] Static — canonical migrations');

  for (const filename of CANONICAL_MIGRATIONS) {
    const filePath = path.join(migrationsDirectory(), filename);
    check(`Canonical migration present: ${filename}`, fs.existsSync(filePath));
  }

  const migrationFiles = listMigrationFiles();
  check(
    'Exactly two canonical Postgres migrations (001, 002)',
    migrationFiles.length === 2
      && migrationFiles[0] === CANONICAL_MIGRATIONS[0]
      && migrationFiles[1] === CANONICAL_MIGRATIONS[1],
    `found: ${migrationFiles.join(', ')}`,
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
    'Manifest defines expected table count',
    expectedTableNames().length === 51,
    `got ${expectedTableNames().length}`,
  );
  check(
    'Manifest defines expected index count',
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
    'postgres_migrations records all migration files',
    migrationRows.rowCount === listMigrationFiles().length,
  );

  console.log('\n[7/9] Live schema structure');

  const schemaResult = await verifyPostgresSchema(pool);
  if (schemaResult.ok) {
    ok('Postgres baseline matches SQLite manifest (tables, columns, types, constraints, indexes)');
  } else {
    ko('Postgres baseline matches SQLite manifest (tables, columns, types, constraints, indexes)');
    for (const mismatch of schemaResult.mismatches.slice(0, 15)) {
      console.error(`       ${mismatch.category}: ${mismatch.detail}`);
    }
    if (schemaResult.mismatches.length > 15) {
      console.error(`       ... and ${schemaResult.mismatches.length - 15} more`);
    }
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
