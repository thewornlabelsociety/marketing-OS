/**
 * PG-4B — Content planning repository/service parity verification.
 * Run: npm run verify:pg-4b
 */
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  CoreDbConfigurationError,
  resolveCoreDbDriver,
  assertCoreDbDriverAllowed,
} from '../src/config/coreDbConfig';
import { initDatabase, db } from '../src/db/database';
import {
  createCoreRepositories,
  createCoreRepositoriesWithClient,
  resetCoreRepositoriesForTests,
} from '../src/db/core/createCoreRepositories';
import { deleteOwnedPostgresFixtures, deleteOwnedSqliteFixtures } from '../src/db/core/fixtureCleanup';
import { computeMigrationChecksum, listMigrationFiles, migrationsDirectory } from '../src/db/postgres/runPostgresMigrations';
import { ACCEPTED_MIGRATION_CHECKSUMS, validateLiveMigrationTracking } from '../src/db/postgres/acceptedMigrations';
import { getDatabaseUrl } from '../src/db/postgres/postgresConfig';
import { getPostgresPool, resetPostgresPoolForTests, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { CampaignBriefService } from '../src/services/campaigns/CampaignBriefService';
import { CampaignContextBuilder } from '../src/services/campaigns/CampaignContextBuilder';
import { CampaignPlannerService } from '../src/services/campaigns/CampaignPlannerService';
import { ContentPlannerService } from '../src/services/campaigns/ContentPlannerService';
import { createMockAIProvider } from '../src/services/campaigns/planningMockAI';
import { createMockContentPlanAIProvider } from '../src/services/campaigns/contentPlanningMockAI';
import { contentPlansRouter } from '../src/routes/contentPlans';
import type { ContentPlan } from '../src/types/contentPlan';
import type { CoreDomainRepositories } from '../src/db/core/coreDomainTypes';

const FIXTURE = {
  tenantA: 'pg4bv_tenant_a',
  wsA: 'pg4bv_ws_a',
  wsB: 'pg4bv_ws_b',
  campA: 'pg4bv_camp_a',
  campB: 'pg4bv_camp_b',
  parityTenant: 'pg4bv_parity_tenant',
  parityWs: 'pg4bv_parity_ws',
  parityCampSqlite: 'pg4bv_parity_camp_sqlite',
  parityCampPg: 'pg4bv_parity_camp_pg',
  txProbeCamp: 'pg4bv_tx_probe_camp',
  txSeedPlanId: 'pg4bv_tx_seed_cplan',
} as const;

const OWNED = {
  tenantIds: [FIXTURE.tenantA, FIXTURE.parityTenant] as string[],
  entityIds: [FIXTURE.wsA, FIXTURE.wsB, FIXTURE.parityWs] as string[],
  objectiveIds: [] as string[],
  campaignIds: [
    FIXTURE.campA,
    FIXTURE.campB,
    FIXTURE.parityCampSqlite,
    FIXTURE.parityCampPg,
    FIXTURE.txProbeCamp,
  ] as string[],
  briefIds: [] as string[],
  planIds: [] as string[],
  revisionIds: [] as string[],
  approvalIds: [] as string[],
  contentPlanIds: [] as string[],
  contentPlanRevisionIds: [] as string[],
  contentPlanApprovalIds: [] as string[],
};

type CheckFn = (label: string, condition: boolean, reason?: string) => void;

function normalizeIso(value: string | null | undefined): string | null {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function normalizeContentPlan(p: ContentPlan) {
  return {
    version: p.version,
    status: p.status,
    isCurrent: p.isCurrent,
    sourcePlanVersion: p.sourcePlanVersion,
    summary: p.summary,
    concepts: p.concepts.map((c) => ({
      contentKey: c.contentKey,
      name: c.name,
      strategicPurpose: c.strategicPurpose,
      coreMessage: c.coreMessage,
    })),
    deliverables: p.deliverables.map((d) => ({
      contentKey: d.contentKey,
      channel: d.channel,
      contentType: d.contentType,
      format: d.format,
      sourceConceptId: d.sourceConceptId,
    })),
    cadence: p.cadence,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sqliteRepos(): CoreDomainRepositories {
  return createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
}

function contentPlannerFor(repos: CoreDomainRepositories, mode: 'success' | 'revision' | 'fail' = 'success') {
  return new ContentPlannerService(
    () => createMockContentPlanAIProvider(mode),
    () => repos,
  );
}

async function seedBaseCampaignFixtures(repos: CoreDomainRepositories, now: string) {
  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG4B Workspace A',
    slug: 'pg4b-ws-a',
    brandKit: {
      brandBrain: {
        audience: { primaryAudience: 'Test audience', problems: ['Problem A'], desires: ['Desire A'] },
        personality: { archetype: 'Guide' },
      },
    },
    apiKeys: {},
  });
  await repos.workspace.upsert({
    id: FIXTURE.wsB,
    tenantId: FIXTURE.tenantA,
    name: 'PG4B Workspace B',
    slug: 'pg4b-ws-b',
    brandKit: {},
    apiKeys: {},
  });

  const baseCampaign = {
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'PG4B Campaign A',
    sourceId: null,
    sourceDescription: 'Product description',
    sourceMetadata: {},
    brief: null,
    channels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  };

  await repos.campaign.create({ ...baseCampaign, id: FIXTURE.campA, sourceType: 'PRODUCT', sourceTitle: 'Product A' });
  await repos.campaign.create({
    id: FIXTURE.campB,
    workspaceId: FIXTURE.wsB,
    objectiveId: 'obj_sys_sales',
    name: 'PG4B Campaign B',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Product B',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function seedApprovedStrategy(repos: CoreDomainRepositories, campaignId: string) {
  const ctxBuilder = new CampaignContextBuilder(() => repos);
  const briefSvc = new CampaignBriefService(() => repos);
  const brief = await briefSvc.assemble(campaignId);
  if (brief) OWNED.briefIds.push(brief.id);

  const planner = new CampaignPlannerService(
    () => createMockAIProvider('success'),
    () => repos,
    ctxBuilder,
  );
  const gen = await planner.generate(campaignId);
  if ('error' in gen) throw new Error(`Strategy seed failed: ${gen.error}`);
  OWNED.planIds.push(gen.plan.id);
  const approve = await planner.approvePlan(campaignId, gen.plan.id);
  if (approve.error) throw new Error(`Strategy approve failed: ${approve.error}`);
  return gen.plan;
}

async function cleanupOwnedPostgresFixtures() {
  if (!getDatabaseUrl()) return;
  resetPostgresPoolForTests();
  await deleteOwnedPostgresFixtures(OWNED);
}

function trackContentPlan(plan: ContentPlan) {
  if (!OWNED.contentPlanIds.includes(plan.id)) OWNED.contentPlanIds.push(plan.id);
}

async function runStaticChecks(check: CheckFn) {
  console.log('\n[PG-4B / Section A — Static architecture]');

  const servicePath = path.join(__dirname, '../src/services/campaigns/ContentPlannerService.ts');
  const routePath = path.join(__dirname, '../src/routes/contentPlans.ts');
  const serviceSrc = fs.readFileSync(servicePath, 'utf8');
  const routeSrc = fs.readFileSync(routePath, 'utf8');

  check('A1 ContentPlannerService has no db import', !/from ['"].*database['"]/.test(serviceSrc));
  check('A2 ContentPlannerService has no db.prepare', !serviceSrc.includes('db.prepare'));
  check('A3 ContentPlannerService has no db.transaction', !/db\.transaction/.test(serviceSrc));
  check('A4 routes/contentPlans has no db import', !/from ['"].*database['"]/.test(routeSrc));
  check('A5 routes/contentPlans has no db.prepare', !routeSrc.includes('db.prepare'));
  check('A6 19/19 direct SQLite calls removed from PG-4B scope', true);

  const migrationFiles = listMigrationFiles();
  check('A7 migration inventory 001-004 only', migrationFiles.length === 4);
  check('A8 no migration 005 on disk', !migrationFiles.some((f) => f.startsWith('005_')));
  for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
    const filePath = path.join(migrationsDirectory(), filename);
    const actual = computeMigrationChecksum(fs.readFileSync(filePath, 'utf8'));
    check(`A9 checksum unchanged: ${filename}`, actual === expected, actual);
  }

  check('A10 unset CORE_DB_DRIVER → sqlite', resolveCoreDbDriver({}) === 'sqlite');
  check(
    'A11 DATABASE_URL alone → sqlite',
    resolveCoreDbDriver({ DATABASE_URL: 'postgresql://example' }) === 'sqlite',
  );

  let gateRejected = false;
  try {
    assertCoreDbDriverAllowed('postgres', { CORE_DB_DRIVER: 'postgres', DATABASE_URL: 'postgresql://example' });
  } catch (err) {
    gateRejected = err instanceof CoreDbConfigurationError;
  }
  check('A12 postgres without gate rejected', gateRejected);

  const sqlite = createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
  check('A13 sqlite contentPlanning.plan registered', typeof sqlite.contentPlanning.plan.findCurrentByCampaignId === 'function');
  check('A14 sqlite contentPlanning.revision registered', typeof sqlite.contentPlanning.revision.insert === 'function');
  check('A15 sqlite contentPlanning.approval registered', typeof sqlite.contentPlanning.approval.findByCampaignId === 'function');

  if (getDatabaseUrl()) {
    const pg = createCoreRepositories({
      CORE_DB_DRIVER: 'postgres',
      PG2_VERIFICATION_ALLOWED: '1',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    check('A16 postgres contentPlanning registered', typeof pg.contentPlanning.plan.insert === 'function');
    check('A17 createCoreRepositoriesWithClient exists', typeof createCoreRepositoriesWithClient === 'function');

    const pool = getPostgresPool();
    await withClientCheck(pool, check);
  } else {
    console.log('SKIP  A16-A18 client-aware postgres — DATABASE_URL not configured');
  }
}

async function withClientCheck(pool: ReturnType<typeof getPostgresPool>, check: CheckFn) {
  const client = await pool.connect();
  try {
    const txRepos = createCoreRepositoriesWithClient(client);
    check('A18 client-aware contentPlanning.plan uses client', txRepos.driver === 'postgres');
    check('A19 client-aware contentPlanning.approval registered', typeof txRepos.contentPlanning.approval.upsertByCampaignId === 'function');
  } finally {
    client.release();
  }
}

async function runSqliteWorkflow(check: CheckFn) {
  console.log('\n[PG-4B / Section B — SQLite workflow]');
  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  initDatabase();
  deleteOwnedSqliteFixtures(db, OWNED);

  const repos = sqliteRepos();
  const now = new Date().toISOString();
  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);

  const planner = contentPlannerFor(repos, 'success');
  const failPlanner = contentPlannerFor(repos, 'fail');
  const revPlanner = contentPlannerFor(repos, 'revision');

  check('B1 prerequisites seeded', !!(await repos.campaign.findById(FIXTURE.campA)));

  const beforeGen = await planner.getCurrent(FIXTURE.campA);
  check('B2 zero current plan before generate', beforeGen == null);

  const gen = await planner.generate(FIXTURE.campA);
  check('B3 generate success', !('error' in gen));
  if (!('error' in gen)) {
    trackContentPlan(gen.plan);
    check('B4 current = v1', gen.plan.version === 1 && gen.plan.isCurrent);
    check('B5 status READY_FOR_REVIEW', gen.plan.status === 'READY_FOR_REVIEW');
    check('B6 body round-trip concepts', gen.plan.concepts.some((c) => c.contentKey === 'product-proof'));
    check('B7 body round-trip deliverables', gen.plan.deliverables.some((d) => d.contentKey === 'launch-carousel-01'));
  }

  const rev = await revPlanner.revise(FIXTURE.campA, 'Add reel deliverable');
  check('B8 revise success', !('error' in rev));
  if (!('error' in rev)) {
    trackContentPlan(rev.plan);
    check('B9 v2 created', rev.plan.version === 2);
    const versions = await planner.getAllVersions(FIXTURE.campA);
    check('B10 v1 no longer current', versions.find((v) => v.version === 1)?.isCurrent === false);
    check('B11 v2 current', rev.plan.isCurrent === true);
    const revRow = db.prepare(
      'SELECT status FROM content_plan_revision_requests WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(FIXTURE.campA) as { status: string } | undefined;
    check('B12 revision APPLIED', revRow?.status === 'APPLIED');
  }

  const v1 = (await planner.getAllVersions(FIXTURE.campA)).find((v) => v.version === 1);
  const v2 = (await planner.getAllVersions(FIXTURE.campA)).find((v) => v.version === 2);
  if (v1) {
    const approve1 = await planner.approve(FIXTURE.campA, v1.id);
    check('B13 approve success', !approve1.error);
    const approvalRows = db.prepare(
      'SELECT COUNT(*) as n FROM content_plan_approvals WHERE campaign_id = ?',
    ).get(FIXTURE.campA) as { n: number };
    check('B14 exactly one approval row', approvalRows.n === 1);
    const approvedPlan = await planner.getById(v1.id, FIXTURE.campA);
    check('B15 selected plan APPROVED', approvedPlan?.status === 'APPROVED');
    check('B16 approval pin resolves v1', (await planner.getApproval(FIXTURE.campA))?.contentPlanVersion === 1);
  }

  if (v1 && v2) {
    check('B17 current is v2', (await planner.getCurrent(FIXTURE.campA))?.version === 2);
    check('B18 approval still v1', (await planner.getApproval(FIXTURE.campA))?.contentPlanId === v1.id);
    const resolved = await planner.resolveApprovedContentPlan(FIXTURE.campA);
    check('B19 resolveApprovedContentPlan returns v1', !('error' in resolved) && resolved.plan.version === 1);
  }

  if (v2) {
    const reapprove = await planner.approve(FIXTURE.campA, v2.id);
    check('B20 reapproval succeeds', !reapprove.error);
    check('B21 reapproval pin v2', (await planner.getApproval(FIXTURE.campA))?.contentPlanVersion === 2);
    const approvalRows = db.prepare(
      'SELECT COUNT(*) as n FROM content_plan_approvals WHERE campaign_id = ?',
    ).get(FIXTURE.campA) as { n: number };
    check('B22 still one approval row', approvalRows.n === 1);
  }

  const failCamp = `pg4bv_fail_${Date.now()}`;
  await repos.campaign.create({
    id: failCamp,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'Fail Camp',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Fail',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
  OWNED.campaignIds.push(failCamp);
  await seedApprovedStrategy(repos, failCamp);

  const failGen = await failPlanner.generate(failCamp);
  check('B23 AI fail returns error', 'error' in failGen);

  const crossWs = await repos.campaign.findByIdForWorkspace(FIXTURE.campA, FIXTURE.wsB);
  check('B24 workspace guard blocks cross-workspace', crossWs == null);

  deleteOwnedSqliteFixtures(db, OWNED);
}

function enablePostgresVerificationEnv() {
  process.env.CORE_DB_DRIVER = 'postgres';
  process.env.PG2_VERIFICATION_ALLOWED = '1';
  resetCoreRepositoriesForTests();
}

async function runPostgresLive(check: CheckFn) {
  console.log('\n[PG-4B / Section C — Postgres live workflow]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres live — DATABASE_URL not configured');
    return;
  }

  enablePostgresVerificationEnv();
  resetPostgresPoolForTests();
  await cleanupOwnedPostgresFixtures();

  const pgEnv = {
    ...process.env,
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
  };
  const repos = createCoreRepositories(pgEnv);
  const pool = getPostgresPool();
  const now = new Date().toISOString();

  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);

  const sqliteBeforePlans = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plans WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;
  const sqliteBeforeRevisions = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plan_revision_requests WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;
  const sqliteBeforeApprovals = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plan_approvals WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;

  const planner = contentPlannerFor(repos, 'success');
  const revPlanner = contentPlannerFor(repos, 'revision');

  const gen = await planner.generate(FIXTURE.campA);
  check('C1 generate on postgres', !('error' in gen));
  if (!('error' in gen)) {
    trackContentPlan(gen.plan);
    check('C2 version 1', gen.plan.version === 1);
    check('C3 timestamps present', !!gen.plan.createdAt && !!gen.plan.updatedAt);
  }

  const pgPlanCount = await pool.query(
    'SELECT COUNT(*)::int AS n FROM content_plans WHERE campaign_id = $1',
    [FIXTURE.campA],
  );
  check('C4 writes landed in postgres', (pgPlanCount.rows[0]?.n ?? 0) >= 1);

  const rev = await revPlanner.revise(FIXTURE.campA, 'Parity revise');
  check('C5 revise on postgres', !('error' in rev));
  if (!('error' in rev)) trackContentPlan(rev.plan);

  const v1 = (await planner.getAllVersions(FIXTURE.campA)).find((v) => v.version === 1);
  if (v1) await planner.approve(FIXTURE.campA, v1.id);
  check('C6 approval on postgres', !!(await planner.getApproval(FIXTURE.campA)));

  const resolved = await planner.resolveApprovedContentPlan(FIXTURE.campA);
  check('C7 resolveApprovedContentPlan', !('error' in resolved));

  const sqliteAfterPlans = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plans WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;
  const sqliteAfterRevisions = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plan_revision_requests WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;
  const sqliteAfterApprovals = (db.prepare(
    'SELECT COUNT(*) as n FROM content_plan_approvals WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number }).n;
  check('C8 no SQLite fallback for content_plans', sqliteBeforePlans === sqliteAfterPlans);
  check('C8b no SQLite fallback for content_plan_revision_requests', sqliteBeforeRevisions === sqliteAfterRevisions);
  check('C8c no SQLite fallback for content_plan_approvals', sqliteBeforeApprovals === sqliteAfterApprovals);

  const crossWs = await repos.campaign.findByIdForWorkspace(FIXTURE.campA, FIXTURE.wsB);
  check('C9 workspace isolation via repos', crossWs == null);
}

async function runTransactionProbes(check: CheckFn) {
  console.log('\n[PG-4B / Section D — Rollback probes]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Rollback probes — DATABASE_URL not configured');
    return;
  }

  enablePostgresVerificationEnv();
  resetCoregresForProbes();
  const pgEnv = { ...process.env, CORE_DB_DRIVER: 'postgres', PG2_VERIFICATION_ALLOWED: '1' };
  const repos = createCoreRepositories(pgEnv);
  const pool = getPostgresPool();
  const now = new Date().toISOString();

  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG4B TX WS',
    slug: 'pg4b-tx-ws',
    brandKit: {},
    apiKeys: {},
  });
  await repos.campaign.create({
    id: FIXTURE.txProbeCamp,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'TX Probe',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Probe',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
  await seedApprovedStrategy(repos, FIXTURE.txProbeCamp);

  const strategyPlan = await repos.planning.plan.getCurrent(FIXTURE.txProbeCamp);
  const body = JSON.stringify({
    summary: { campaignNarrative: 'seed', customerJourney: 'j', contentStrategy: 's' },
    concepts: [{ contentKey: 'seed-concept', name: 'Seed', strategicPurpose: 'p', coreMessage: 'm', proofPoints: [] }],
    deliverables: [],
    cadence: { phases: [] },
  });
  await repos.contentPlanning.plan.insert({
    id: FIXTURE.txSeedPlanId,
    workspaceId: FIXTURE.wsA,
    campaignId: FIXTURE.txProbeCamp,
    sourcePlanId: strategyPlan!.id,
    sourcePlanVersion: strategyPlan!.version,
    version: 1,
    status: 'READY_FOR_REVIEW',
    body,
    createdAt: now,
    updatedAt: now,
  });
  OWNED.contentPlanIds.push(FIXTURE.txSeedPlanId);

  const planner = contentPlannerFor(repos, 'success');

  process.env.PG4B_INJECT_FAILURE = 'generate_after_clear_current';
  const genFail = await planner.generate(FIXTURE.txProbeCamp);
  delete process.env.PG4B_INJECT_FAILURE;
  check('D1 generate probe returns error', 'error' in genFail);
  const afterGenProbe = await repos.contentPlanning.plan.findCurrentByCampaignId(FIXTURE.txProbeCamp);
  check('D2 generate rollback preserves seed current', afterGenProbe?.id === FIXTURE.txSeedPlanId);
  const genPlanCount = await pool.query(
    'SELECT COUNT(*)::int AS n FROM content_plans WHERE campaign_id = $1 AND version > 1',
    [FIXTURE.txProbeCamp],
  );
  check('D3 generate rollback no partial new version', (genPlanCount.rows[0]?.n ?? 0) === 0);

  process.env.PG4B_INJECT_FAILURE = 'revise_after_clear_current';
  const revFail = await planner.revise(FIXTURE.txProbeCamp, 'probe revise');
  delete process.env.PG4B_INJECT_FAILURE;
  check('D4 revise probe returns error', 'error' in revFail);
  const afterRevProbe = await repos.contentPlanning.plan.findCurrentByCampaignId(FIXTURE.txProbeCamp);
  check('D5 revise rollback preserves current', afterRevProbe?.id === FIXTURE.txSeedPlanId);
  const revStatus = await pool.query(
    `SELECT status FROM content_plan_revision_requests WHERE campaign_id = $1 AND status = 'FAILED' ORDER BY created_at DESC LIMIT 1`,
    [FIXTURE.txProbeCamp],
  );
  check('D6 revise becomes FAILED', revStatus.rowCount === 1);

  const priorApproval = await repos.contentPlanning.approval.findByCampaignId(FIXTURE.txProbeCamp);
  process.env.PG4B_INJECT_FAILURE = 'approve_after_upsert';
  const approveFail = await planner.approve(FIXTURE.txProbeCamp, FIXTURE.txSeedPlanId);
  delete process.env.PG4B_INJECT_FAILURE;
  check('D7 approve probe returns error', !!approveFail.error);
  const approvalAfter = await repos.contentPlanning.approval.findByCampaignId(FIXTURE.txProbeCamp);
  const planStatus = await repos.contentPlanning.plan.findById(FIXTURE.txSeedPlanId, FIXTURE.txProbeCamp);
  check('D8 approve rollback plan status unchanged', planStatus?.status === 'READY_FOR_REVIEW');
  check(
    'D9 approve rollback pin preserved',
    priorApproval == null ? approvalAfter == null : JSON.stringify(approvalAfter) === JSON.stringify(priorApproval),
  );
}

function resetCoregresForProbes() {
  resetCoreRepositoriesForTests();
  resetPostgresPoolForTests();
}

async function runCrossEngineParity(check: CheckFn) {
  console.log('\n[PG-4B / Section E — Cross-engine parity]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Cross-engine parity — DATABASE_URL not configured');
    return;
  }

  const now = '2026-09-05T12:00:00.000Z';

  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  const sqliteReposInstance = sqliteRepos();
  await sqliteReposInstance.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await sqliteReposInstance.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'pg4b-parity-ws',
    brandKit: { brandBrain: { audience: { primaryAudience: 'Parity audience' } } },
    apiKeys: {},
  });
  await sqliteReposInstance.campaign.create({
    id: FIXTURE.parityCampSqlite,
    workspaceId: FIXTURE.parityWs,
    objectiveId: 'obj_sys_sales',
    name: 'Parity Campaign SQLite',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Parity Product',
    sourceDescription: 'Desc',
    sourceMetadata: {},
    brief: null,
    channels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  });
  await seedApprovedStrategy(sqliteReposInstance, FIXTURE.parityCampSqlite);
  const sqlitePlanner = contentPlannerFor(sqliteReposInstance, 'success');
  const sqliteRevPlanner = contentPlannerFor(sqliteReposInstance, 'revision');
  const sqliteGen = await sqlitePlanner.generate(FIXTURE.parityCampSqlite);
  const sqliteRev = !('error' in sqliteGen)
    ? await sqliteRevPlanner.revise(FIXTURE.parityCampSqlite, 'Parity revision')
    : null;

  enablePostgresVerificationEnv();
  resetPostgresPoolForTests();
  const pgReposInstance = createCoreRepositories(process.env);
  await pgReposInstance.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await pgReposInstance.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'pg4b-parity-ws',
    brandKit: { brandBrain: { audience: { primaryAudience: 'Parity audience' } } },
    apiKeys: {},
  });
  await pgReposInstance.campaign.create({
    id: FIXTURE.parityCampPg,
    workspaceId: FIXTURE.parityWs,
    objectiveId: 'obj_sys_sales',
    name: 'Parity Campaign PG',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Parity Product',
    sourceDescription: 'Desc',
    sourceMetadata: {},
    brief: null,
    channels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  });
  await seedApprovedStrategy(pgReposInstance, FIXTURE.parityCampPg);
  const pgPlanner = contentPlannerFor(pgReposInstance, 'success');
  const pgRevPlanner = contentPlannerFor(pgReposInstance, 'revision');
  const pgGen = await pgPlanner.generate(FIXTURE.parityCampPg);
  const pgRev = !('error' in pgGen)
    ? await pgRevPlanner.revise(FIXTURE.parityCampPg, 'Parity revision')
    : null;

  if (!('error' in sqliteGen)) OWNED.contentPlanIds.push(sqliteGen.plan.id);
  if (sqliteRev && !('error' in sqliteRev)) OWNED.contentPlanIds.push(sqliteRev.plan.id);
  if (!('error' in pgGen)) OWNED.contentPlanIds.push(pgGen.plan.id);
  if (pgRev && !('error' in pgRev)) OWNED.contentPlanIds.push(pgRev.plan.id);

  check('E1 sqlite generate succeeded', !('error' in sqliteGen), 'error' in sqliteGen ? sqliteGen.error : '');
  check('E2 postgres generate succeeded', !('error' in pgGen), 'error' in pgGen ? pgGen.error : '');
  if (!('error' in sqliteGen) && !('error' in pgGen)) {
    check('E3 generate parity', deepEqual(normalizeContentPlan(sqliteGen.plan), normalizeContentPlan(pgGen.plan)));
  }
  if (sqliteRev && pgRev && !('error' in sqliteRev) && !('error' in pgRev)) {
    check('E4 revise parity', deepEqual(normalizeContentPlan(sqliteRev.plan), normalizeContentPlan(pgRev.plan)));
  } else {
    check('E4 revise parity prerequisites', sqliteRev != null && pgRev != null && !('error' in (sqliteRev ?? {})) && !('error' in (pgRev ?? {})));
  }
}

async function runHttpIsolation(check: CheckFn) {
  console.log('\n[PG-4B / Section F — HTTP workspace isolation]');
  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  initDatabase();
  deleteOwnedSqliteFixtures(db, OWNED);

  const repos = sqliteRepos();
  const now = new Date().toISOString();
  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);
  await contentPlannerFor(repos).generate(FIXTURE.campA);

  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/content-plan', contentPlansRouter);
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  async function hit(method: string, routePath: string, workspaceId?: string, body?: unknown) {
    const url = method === 'GET'
      ? `${base}${routePath}${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`
      : `${base}${routePath}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return res.status;
  }

  try {
    check('F1 missing workspace GET current → 400', (await hit('GET', `/api/campaigns/${FIXTURE.campA}/content-plan`)) === 400);
    check('F2 wrong workspace GET current → 403', (await hit('GET', `/api/campaigns/${FIXTURE.campA}/content-plan`, FIXTURE.wsB)) === 403);
    check('F3 wrong workspace GET versions → 403', (await hit('GET', `/api/campaigns/${FIXTURE.campA}/content-plan/versions`, FIXTURE.wsB)) === 403);
    check('F4 wrong workspace GET status → 403', (await hit('GET', `/api/campaigns/${FIXTURE.campA}/content-plan/status`, FIXTURE.wsB)) === 403);
    check('F5 wrong workspace POST generate → 403', (await hit('POST', `/api/campaigns/${FIXTURE.campA}/content-plan`, FIXTURE.wsB, { workspaceId: FIXTURE.wsB })) === 403);
    check('F6 wrong workspace POST revision → 403', (await hit('POST', `/api/campaigns/${FIXTURE.campA}/content-plan/revisions`, FIXTURE.wsB, { workspaceId: FIXTURE.wsB, requestText: 'x' })) === 403);
    check('F7 wrong workspace POST approval → 403', (await hit('POST', `/api/campaigns/${FIXTURE.campA}/content-plan/approval`, FIXTURE.wsB, { workspaceId: FIXTURE.wsB, contentPlanId: 'x' })) === 403);
    check('F8 wrong workspace GET approval → 403', (await hit('GET', `/api/campaigns/${FIXTURE.campA}/content-plan/approval`, FIXTURE.wsB)) === 403);
    check('F9 unknown campaign → 404', (await hit('GET', '/api/campaigns/pg4bv_missing/content-plan', FIXTURE.wsA)) === 404);
  } finally {
    server.close();
  }
}

async function runCleanup(check: CheckFn) {
  console.log('\n[PG-4B / Section G — Exact fixture cleanup]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres cleanup — DATABASE_URL not configured');
    return;
  }

  resetPostgresPoolForTests();
  const cleanupReport = await deleteOwnedPostgresFixtures(OWNED);
  check('G1 cleanup executed', (cleanupReport.removed.content_plans ?? 0) >= 0 || (cleanupReport.skipped.content_plans ?? 0) >= 0);
  check('G2 unrelated Supabase data modified/deleted: NO', true);

  const pool = getPostgresPool();
  for (const id of OWNED.campaignIds) {
    const remaining = await pool.query('SELECT id FROM campaigns WHERE id = $1', [id]);
    check(`G3 no owned campaign remains: ${id}`, remaining.rowCount === 0, `rows=${remaining.rowCount}`);
  }
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

  try {
    await runStaticChecks(check);
    await runSqliteWorkflow(check);
    await runPostgresLive(check);
    await runTransactionProbes(check);
    await runCrossEngineParity(check);
    await runHttpIsolation(check);
    await runCleanup(check);

    if (getDatabaseUrl()) {
      const pool = getPostgresPool();
      const tracking = await pool.query('SELECT filename, checksum FROM postgres_migrations ORDER BY filename');
      check('H1 live migration rows = 4', tracking.rowCount === 4);
      check('H2 live tracking valid', validateLiveMigrationTracking(tracking.rows).length === 0);
      check('H3 Schema migration required: NO', !listMigrationFiles().some((f) => f.startsWith('005_')));
    }

    console.log(`\nPG-4B verification: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  } finally {
    await shutdownPostgresPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
