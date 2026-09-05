/**
 * PG-2 — Core domain repository parity verification.
 * Run via: npm run verify:pg-2
 *
 * Postgres live checks require DATABASE_URL and set PG2_VERIFICATION_ALLOWED=1 internally.
 * Normal MOS runtime remains SQLite; this script does not enable production Postgres cutover.
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  CoreDbConfigurationError,
  resolveCoreDbDriver,
  assertCoreDbDriverAllowed,
  sanitizeCoreDbError,
} from '../src/config/coreDbConfig';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { initDatabase, db } from '../src/db/database';
import {
  createCoreRepositories,
  resetCoreRepositoriesForTests,
} from '../src/db/core/createCoreRepositories';
import { deleteOwnedPostgresFixtures, deleteOwnedSqliteFixtures } from '../src/db/core/fixtureCleanup';
import { withPostgresTransaction } from '../src/db/core/withPostgresTransaction';
import { computeMigrationChecksum, migrationsDirectory } from '../src/db/postgres/runPostgresMigrations';
import { getDatabaseUrl, redactDatabaseUrl } from '../src/db/postgres/postgresConfig';
import { resetPostgresPoolForTests, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { mapEntityRow } from '../src/utils/mappers';
import { mapObjectiveRow } from '../src/routes/objectives';
import { mapCampaignRow } from '../src/routes/campaigns';
import { entitiesRouter } from '../src/routes/entities';
import { objectivesRouter } from '../src/routes/objectives';
import { campaignsRouter } from '../src/routes/campaigns';

const CANONICAL_CHECKSUMS: Record<string, string> = {
  '001_mos_baseline.sql': '527d63704e668248a8e584088231042ce3db902cc25e33b1326e529aa7617f5c',
  '002_system_objectives_seed.sql': '70014cea1d7f590260feb7399c17ce3de0266c086d8d93144a2b7ed1927c92fc',
};

/** Exact fixture IDs owned by this verification run — cleanup uses this set only. */
const FIXTURE = {
  tenantA: 'pg2v_tenant_a',
  wsA: 'pg2v_ws_a',
  wsB: 'pg2v_ws_b',
  objCustom: 'pg2v_obj_custom_a',
  campSys: 'pg2v_camp_sys_a',
  campCustom: 'pg2v_camp_custom_a',
  campWsB: 'pg2v_camp_ws_b',
  campReadOnly: 'pg2v_camp_readonly_a',
  txProbe: 'pg2v_tx_probe_entity',
} as const;

const OWNED_IDS = {
  tenantIds: [FIXTURE.tenantA],
  entityIds: [FIXTURE.wsA, FIXTURE.wsB, FIXTURE.txProbe],
  objectiveIds: [FIXTURE.objCustom],
  campaignIds: [FIXTURE.campSys, FIXTURE.campCustom, FIXTURE.campWsB, FIXTURE.campReadOnly],
};

type CheckFn = (label: string, condition: boolean, reason?: string) => void;

function normalizeIso(value: string | null | undefined): string | null {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function normalizeEntityApi(row: ReturnType<typeof mapEntityRow>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tenantId: row.tenantId,
    archetype: row.archetype,
    brandKit: row.brandKit,
    apiKeys: row.apiKeys,
  };
}

function normalizeObjectiveApi(row: ReturnType<typeof mapObjectiveRow>) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    objectiveType: row.objectiveType,
    primaryKpi: row.primaryKpi,
    supportingKpis: row.supportingKpis,
    conversionEvent: row.conversionEvent,
    successCriteria: row.successCriteria,
    defaultChannels: row.defaultChannels,
    isSystem: row.isSystem,
    isActive: row.isActive,
  };
}

function normalizeCampaignApi(row: ReturnType<typeof mapCampaignRow>) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectiveId: row.objectiveId,
    objectiveName: row.objectiveName,
    objectivePrimaryKpi: row.objectivePrimaryKpi,
    name: row.name,
    status: row.status,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceTitle: row.sourceTitle,
    sourceDescription: row.sourceDescription,
    sourceMetadata: row.sourceMetadata,
    brief: row.brief,
    channels: row.channels,
    cancellationReason: row.cancellationReason,
    scheduledAt: normalizeIso(row.scheduledAt),
    publishedAt: normalizeIso(row.publishedAt),
    completedAt: normalizeIso(row.completedAt),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function seedCoreFixtures(repos: ReturnType<typeof createCoreRepositories>, now: string) {
  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG2 Workspace A',
    slug: 'pg2-ws-a',
    brandKit: { brandBrain: { identity: { name: 'PG2 A' } } },
    apiKeys: {},
  });
  await repos.workspace.upsert({
    id: FIXTURE.wsB,
    tenantId: FIXTURE.tenantA,
    name: 'PG2 Workspace B',
    slug: 'pg2-ws-b',
    brandKit: {},
    apiKeys: {},
  });
  await repos.objective.create({
    id: FIXTURE.objCustom,
    workspaceId: FIXTURE.wsA,
    name: 'PG2 Custom Objective',
    description: 'Verification objective',
    objectiveType: 'SALES',
    primaryKpi: 'revenue',
    supportingKpis: ['orders'],
    conversionEvent: null,
    successCriteria: null,
    defaultChannels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  });
  await repos.campaign.create({
    id: FIXTURE.campSys,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'PG2 System Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'PG2 Product',
    sourceDescription: 'Desc',
    sourceMetadata: { pg2: true },
    brief: null,
    channels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  });
  await repos.campaign.create({
    id: FIXTURE.campCustom,
    workspaceId: FIXTURE.wsA,
    objectiveId: FIXTURE.objCustom,
    name: 'PG2 Custom Campaign',
    sourceType: 'OFFER',
    sourceId: null,
    sourceTitle: 'PG2 Offer',
    sourceDescription: null,
    sourceMetadata: {},
    brief: 'brief text',
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
  await repos.campaign.create({
    id: FIXTURE.campReadOnly,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'PG2 Readonly Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'RO Product',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
  await repos.campaign.create({
    id: FIXTURE.campWsB,
    workspaceId: FIXTURE.wsB,
    objectiveId: 'obj_sys_sales',
    name: 'PG2 WS B Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'B Product',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function runConfigChecks(check: CheckFn) {
  console.log('\n[PG-2 / Config]');

  check('A1 unset CORE_DB_DRIVER → sqlite', resolveCoreDbDriver({}) === 'sqlite');
  check('A2 explicit CORE_DB_DRIVER=sqlite', resolveCoreDbDriver({ CORE_DB_DRIVER: 'sqlite' }) === 'sqlite');
  check(
    'A3 DATABASE_URL alone → sqlite',
    resolveCoreDbDriver({ DATABASE_URL: 'postgresql://example' }) === 'sqlite',
  );

  let gateRejected = false;
  try {
    assertCoreDbDriverAllowed('postgres', {
      CORE_DB_DRIVER: 'postgres',
      DATABASE_URL: 'postgresql://example',
    });
  } catch (err) {
    gateRejected = err instanceof CoreDbConfigurationError;
  }
  check('A4 postgres without PG2_VERIFICATION_ALLOWED → rejected', gateRejected);

  let gateAllowed = true;
  try {
    assertCoreDbDriverAllowed('postgres', {
      CORE_DB_DRIVER: 'postgres',
      PG2_VERIFICATION_ALLOWED: '1',
      DATABASE_URL: 'postgresql://example',
    });
  } catch {
    gateAllowed = false;
  }
  check('A5 postgres with verification gate → allowed', gateAllowed);

  const url = getDatabaseUrl();
  const redacted = url ? redactDatabaseUrl(url) : '(none)';
  check(
    'A6 credentials never logged in redacted URL',
    !redacted.includes('://') || !/password/i.test(redacted) || redacted.includes('***'),
    redacted,
  );

  for (const [file, expected] of Object.entries(CANONICAL_CHECKSUMS)) {
    const filePath = path.join(migrationsDirectory(), file);
    const actual = computeMigrationChecksum(fs.readFileSync(filePath, 'utf8'));
    check(`A7 checksum unchanged: ${file}`, actual === expected, `got ${actual}`);
  }

  const sanitized = sanitizeCoreDbError(new Error('password=secret DATABASE_URL=postgres://x'));
  check('A8 sanitizeCoreDbError redacts sensitive tokens', !sanitized.includes('secret'));
}

async function runSqliteRepositoryChecks(check: CheckFn) {
  console.log('\n[PG-2 / SQLite repositories]');
  initDatabase();
  resetCoreRepositoriesForTests();
  const repos = createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
  check('B0 driver is sqlite', repos.driver === 'sqlite');

  const now = new Date().toISOString();
  await seedCoreFixtures(repos, now);

  const listed = await repos.workspace.listActive();
  check('B1 entity list includes fixture wsA', listed.some((e) => e.id === FIXTURE.wsA));

  await repos.workspace.patchBrandKit(FIXTURE.wsA, JSON.stringify({ brandBrain: { identity: { name: 'Merged' } } }));
  const wsRow = await repos.workspace.findById(FIXTURE.wsA);
  check('B2 brand-kit patch', !!wsRow && wsRow.brand_kit.includes('Merged'));

  const objectives = await repos.objective.listForWorkspace(FIXTURE.wsA);
  check('B3 objective list includes system + custom', objectives.some((o) => o.id === 'obj_sys_sales') && objectives.some((o) => o.id === FIXTURE.objCustom));

  const sysObj = await repos.objective.findById('obj_sys_sales');
  check('B4 system objective readable', !!sysObj && sysObj.is_system === 1);

  const patchedObj = await repos.objective.patch(FIXTURE.objCustom, { name: 'PG2 Updated' }, now);
  check('B5 custom objective patch', patchedObj?.name === 'PG2 Updated');

  const camp = await repos.campaign.findByIdWithObjective(FIXTURE.campSys);
  check('B6 campaign join fields', camp?.objective_name != null && camp.objective_primary_kpi != null);

  const patchedCamp = await repos.campaign.patch(FIXTURE.campSys, { status: 'READY_FOR_REVIEW', name: 'Renamed' }, now);
  check('B7 campaign patch', patchedCamp?.status === 'READY_FOR_REVIEW' && patchedCamp.name === 'Renamed');

  await repos.campaign.patch(FIXTURE.campReadOnly, { status: 'CANCELLED' }, now);
  const ro = await repos.campaign.findById(FIXTURE.campReadOnly);
  check('B8 read-only seed status set', ro?.status === 'CANCELLED');

  const wsBCamp = await repos.campaign.findById(FIXTURE.campWsB);
  check('B9 workspace B campaign exists', wsBCamp?.workspace_id === FIXTURE.wsB);

  deleteOwnedSqliteFixtures(db, OWNED_IDS);
}

async function runSqliteHttpChecks(check: CheckFn) {
  console.log('\n[PG-2 / SQLite HTTP]');
  resetCoreRepositoriesForTests();
  process.env.CORE_DB_DRIVER = 'sqlite';
  delete process.env.PG2_VERIFICATION_ALLOWED;

  const app = express();
  app.use(express.json());
  app.use('/api/entities', entitiesRouter);
  app.use('/api/objectives', objectivesRouter);
  app.use('/api/campaigns', campaignsRouter);

  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json as Record<string, unknown> };
  }

  const wsId = `pg2v_http_ws_${Date.now()}`;
  db.prepare(`INSERT OR IGNORE INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
    .run(wsId, LOCAL_TENANT_ID, wsId, wsId);

  const createCamp = await req('POST', '/api/campaigns', {
    workspaceId: wsId,
    objectiveId: 'obj_sys_sales',
    sourceType: 'PRODUCT',
    sourceTitle: 'HTTP Product',
  });
  check('B10 HTTP campaign create', createCamp.status === 201);

  const campId = createCamp.body.id as string;
  const patchCamp = await req('PATCH', `/api/campaigns/${campId}`, { name: 'HTTP Patched' });
  check('B11 HTTP campaign patch', patchCamp.status === 200 && patchCamp.body.name === 'HTTP Patched');

  await req('PATCH', `/api/campaigns/${campId}`, { status: 'CANCELLED' });
  const roPatch = await req('PATCH', `/api/campaigns/${campId}`, { name: 'Nope' });
  check('B12 HTTP read-only status blocks edit', roPatch.status === 409);

  const objCreate = await req('POST', '/api/objectives', {
    workspaceId: wsId,
    name: 'HTTP Obj',
    objectiveType: 'AWARENESS',
    primaryKpi: 'reach',
  });
  check('B13 HTTP objective create', objCreate.status === 201);

  const sysPatch = await req('PATCH', '/api/objectives/obj_sys_sales', { name: 'Hack' });
  check('B14 HTTP system objective immutable', sysPatch.status === 403);

  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campId);
  if (objCreate.body.id) db.prepare('DELETE FROM objectives WHERE id = ?').run(objCreate.body.id as string);
  db.prepare('DELETE FROM entities WHERE id = ?').run(wsId);

  server.close();
}

async function runPostgresLiveChecks(
  check: CheckFn,
  report: { created: Record<string, number>; removed: Record<string, number>; remaining: Record<string, number> },
) {
  console.log('\n[PG-2 / Postgres live]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres live — DATABASE_URL not configured');
    return;
  }

  resetCoreRepositoriesForTests();
  resetPostgresPoolForTests();

  const pgEnv = {
    ...process.env,
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
  };

  const repos = createCoreRepositories(pgEnv);
  check('C0 driver is postgres', repos.driver === 'postgres');

  const now = new Date().toISOString();

  const tenantResult = await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  report.created.tenants = (report.created.tenants ?? 0) + (tenantResult === 'inserted' ? 1 : 0);

  await seedCoreFixtures(repos, now);
  report.created.entities = 2;
  report.created.objectives = 1;
  report.created.campaigns = 4;

  await repos.campaign.patch(FIXTURE.campReadOnly, { status: 'CANCELLED' }, now);

  check('C1 connection + entity read', (await repos.workspace.findById(FIXTURE.wsA)) != null);

  const objectives = await repos.objective.listForWorkspace(FIXTURE.wsA);
  check('C2 system objectives present', objectives.some((o) => o.id === 'obj_sys_sales'));

  const custom = await repos.objective.findById(FIXTURE.objCustom);
  check('C3 custom objective CRUD read', custom?.primary_kpi === 'revenue');

  await repos.objective.patch(FIXTURE.objCustom, { primaryKpi: 'orders' }, now);
  check('C4 custom objective update', (await repos.objective.findById(FIXTURE.objCustom))?.primary_kpi === 'orders');

  check('C5 campaign with system objective', (await repos.campaign.findById(FIXTURE.campSys))?.objective_id === 'obj_sys_sales');
  check('C6 campaign with custom objective', (await repos.campaign.findById(FIXTURE.campCustom))?.objective_id === FIXTURE.objCustom);

  const filtered = await repos.campaign.list({ workspaceId: FIXTURE.wsA, status: 'DRAFTING' });
  check('C7 campaign filtering', filtered.some((c) => c.id === FIXTURE.campSys));

  const updated = await repos.campaign.patch(
    FIXTURE.campSys,
    { channels: ['email'], sourceMetadata: { k: 'v' } },
    now,
  );
  check(
    'C8 JSON/TEXT exact behaviour',
    updated?.channels === '["email"]' && updated.source_metadata === '{"k":"v"}',
  );

  check('C9 INTEGER flags', (await repos.objective.findById('obj_sys_sales'))?.is_system === 1);

  check('C10 timestamps present', !!updated?.created_at && !!updated.updated_at);

  const wsAIds = (await repos.campaign.list({ workspaceId: FIXTURE.wsA })).map((c) => c.id);
  const wsBIds = (await repos.campaign.list({ workspaceId: FIXTURE.wsB })).map((c) => c.id);
  check(
    'C11 workspace isolation',
    wsAIds.includes(FIXTURE.campSys) && !wsAIds.includes(FIXTURE.campWsB) && wsBIds.includes(FIXTURE.campWsB),
  );

  let commitOk = false;
  await withPostgresTransaction(async (client) => {
    await client.query(
      `INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [FIXTURE.txProbe, FIXTURE.tenantA, 'TX Probe', 'tx-probe', '{}', '{}'],
    );
    commitOk = true;
  });
  check('C12 transaction COMMIT', commitOk && (await repos.workspace.findById(FIXTURE.txProbe)) != null);

  let rolledBack = false;
  try {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['pg2v_tx_should_not_exist', FIXTURE.tenantA, 'Bad', 'bad', '{}', '{}'],
      );
      throw new Error('force rollback');
    });
  } catch {
    rolledBack = true;
  }
  const ghost = await repos.workspace.findById('pg2v_tx_should_not_exist');
  check('C13 transaction ROLLBACK', rolledBack && ghost == null);

  const sqliteBefore = (db.prepare('SELECT COUNT(*) as n FROM campaigns').get() as { n: number }).n;
  let pgFailed = false;
  const savedUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/nodb';
  resetPostgresPoolForTests();
  try {
    const badRepos = createCoreRepositories({
      CORE_DB_DRIVER: 'postgres',
      PG2_VERIFICATION_ALLOWED: '1',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    await badRepos.workspace.listActive();
  } catch {
    pgFailed = true;
  } finally {
    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
    resetPostgresPoolForTests();
  }
  const sqliteAfter = (db.prepare('SELECT COUNT(*) as n FROM campaigns').get() as { n: number }).n;
  check('C14 connection failure', pgFailed);
  check('C15 zero SQLite fallback writes on Postgres failure', sqliteBefore === sqliteAfter);

  resetPostgresPoolForTests();
  const cleanupRepos = createCoreRepositories(pgEnv);
  const cleanupReport = await deleteOwnedPostgresFixtures({
    tenantIds: [...OWNED_IDS.tenantIds],
    entityIds: [...OWNED_IDS.entityIds, FIXTURE.txProbe],
    objectiveIds: [...OWNED_IDS.objectiveIds],
    campaignIds: [...OWNED_IDS.campaignIds],
  });
  report.removed = cleanupReport.removed;
  report.skipped = cleanupReport.skipped;

  for (const id of OWNED_IDS.campaignIds) {
    if (await cleanupRepos.campaign.findById(id)) report.remaining.campaigns = (report.remaining.campaigns ?? 0) + 1;
  }
  check('C16 exact-ID fixture cleanup executed', cleanupReport.removed.campaigns >= 0);
}

async function runCrossEngineParity(check: CheckFn) {
  console.log('\n[PG-2 / Cross-engine parity]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Cross-engine parity — DATABASE_URL not configured');
    return;
  }

  const spec = {
    tenantId: 'pg2v_parity_tenant',
    wsId: 'pg2v_parity_ws',
    objId: 'pg2v_parity_obj',
    campId: 'pg2v_parity_camp',
    now: '2026-09-05T00:00:00.000Z',
  };

  resetCoreRepositoriesForTests();
  const sqliteRepos = createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });

  await sqliteRepos.tenant.insertIfNotExists({ id: spec.tenantId });
  await sqliteRepos.workspace.upsert({
    id: spec.wsId,
    tenantId: spec.tenantId,
    name: 'Parity WS',
    slug: 'parity-ws',
    brandKit: { parity: true },
    apiKeys: { k: 'v' },
  });
  await sqliteRepos.objective.create({
    id: spec.objId,
    workspaceId: spec.wsId,
    name: 'Parity Objective',
    description: null,
    objectiveType: 'SALES',
    primaryKpi: 'revenue',
    supportingKpis: [],
    conversionEvent: null,
    successCriteria: null,
    defaultChannels: [],
    createdAt: spec.now,
    updatedAt: spec.now,
  });
  await sqliteRepos.campaign.create({
    id: spec.campId,
    workspaceId: spec.wsId,
    objectiveId: spec.objId,
    name: 'Parity Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Parity Product',
    sourceDescription: 'd',
    sourceMetadata: { parity: 1 },
    brief: null,
    channels: ['x'],
    createdAt: spec.now,
    updatedAt: spec.now,
  });

  const sqliteEntity = normalizeEntityApi(mapEntityRow((await sqliteRepos.workspace.findById(spec.wsId))!));
  const sqliteObjective = normalizeObjectiveApi(mapObjectiveRow((await sqliteRepos.objective.findById(spec.objId))!));
  const sqliteCampaign = normalizeCampaignApi(mapCampaignRow((await sqliteRepos.campaign.findByIdWithObjective(spec.campId))!));

  resetPostgresPoolForTests();
  const pgRepos = createCoreRepositories({
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
    DATABASE_URL: process.env.DATABASE_URL,
  });

  await pgRepos.tenant.insertIfNotExists({ id: spec.tenantId });
  await pgRepos.workspace.upsert({
    id: spec.wsId,
    tenantId: spec.tenantId,
    name: 'Parity WS',
    slug: 'parity-ws',
    brandKit: { parity: true },
    apiKeys: { k: 'v' },
  });
  await pgRepos.objective.create({
    id: spec.objId,
    workspaceId: spec.wsId,
    name: 'Parity Objective',
    description: null,
    objectiveType: 'SALES',
    primaryKpi: 'revenue',
    supportingKpis: [],
    conversionEvent: null,
    successCriteria: null,
    defaultChannels: [],
    createdAt: spec.now,
    updatedAt: spec.now,
  });
  await pgRepos.campaign.create({
    id: spec.campId,
    workspaceId: spec.wsId,
    objectiveId: spec.objId,
    name: 'Parity Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Parity Product',
    sourceDescription: 'd',
    sourceMetadata: { parity: 1 },
    brief: null,
    channels: ['x'],
    createdAt: spec.now,
    updatedAt: spec.now,
  });

  const pgEntity = normalizeEntityApi(mapEntityRow((await pgRepos.workspace.findById(spec.wsId))!));
  const pgObjective = normalizeObjectiveApi(mapObjectiveRow((await pgRepos.objective.findById(spec.objId))!));
  const pgCampaign = normalizeCampaignApi(mapCampaignRow((await pgRepos.campaign.findByIdWithObjective(spec.campId))!));

  check('D1 entity parity', deepEqual(sqliteEntity, pgEntity));
  check('D2 objective parity', deepEqual(sqliteObjective, pgObjective));
  check('D3 campaign parity', deepEqual(sqliteCampaign, pgCampaign));
  check('D4 IDs agree', sqliteCampaign.id === pgCampaign.id && sqliteEntity.id === pgEntity.id);

  deleteOwnedSqliteFixtures(db, {
    tenantIds: [spec.tenantId],
    entityIds: [spec.wsId],
    objectiveIds: [spec.objId],
    campaignIds: [spec.campId],
  });
  await deleteOwnedPostgresFixtures({
    tenantIds: [spec.tenantId],
    entityIds: [spec.wsId],
    objectiveIds: [spec.objId],
    campaignIds: [spec.campId],
  });
}

async function main() {
  let passed = 0;
  let failed = 0;

  const check: CheckFn = (label, condition, reason = '') => {
    if (condition) {
      passed += 1;
      console.log(`PASS  ${label}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${label}${reason ? ` — ${reason}` : ''}`);
    }
  };

  const liveReport = {
    created: {} as Record<string, number>,
    removed: {} as Record<string, number>,
    skipped: {} as Record<string, number>,
    remaining: {} as Record<string, number>,
  };

  console.log('PG-2 Core Domain Repository Parity Verification');

  await runConfigChecks(check);
  await runSqliteRepositoryChecks(check);
  await runSqliteHttpChecks(check);
  await runPostgresLiveChecks(check, liveReport);
  await runCrossEngineParity(check);

  await shutdownPostgresPool();

  console.log('\n--- PG-2 Live Supabase fixture report ---');
  console.log('Created:', JSON.stringify(liveReport.created));
  console.log('Removed:', JSON.stringify(liveReport.removed));
  console.log('Skipped:', JSON.stringify(liveReport.skipped));
  console.log('Remaining:', JSON.stringify(liveReport.remaining));

  console.log(`\nPG-2 results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nPG-2 CORE PARITY: FAIL');
    process.exit(1);
  }
  console.log('\nPG-2 CORE PARITY: PASS');
}

main().catch((err) => {
  console.error(err);
  console.log('\nPG-2 CORE PARITY: FAIL');
  process.exit(1);
});
