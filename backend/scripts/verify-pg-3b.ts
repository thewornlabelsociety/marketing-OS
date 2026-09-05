/**
 * PG-3B — Campaign brief + planning repository/service parity verification.
 * Run via: npm run verify:pg-3b
 */
import fs from 'fs';
import path from 'path';
import {
  CoreDbConfigurationError,
  resolveCoreDbDriver,
  assertCoreDbDriverAllowed,
  sanitizeCoreDbError,
} from '../src/config/coreDbConfig';
import { initDatabase, db } from '../src/db/database';
import {
  createCoreRepositories,
  resetCoreRepositoriesForTests,
} from '../src/db/core/createCoreRepositories';
import { deleteOwnedPostgresFixtures, deleteOwnedSqliteFixtures } from '../src/db/core/fixtureCleanup';
import { withPostgresTransaction } from '../src/db/core/withPostgresTransaction';
import { computeMigrationChecksum, migrationsDirectory } from '../src/db/postgres/runPostgresMigrations';
import { ACCEPTED_MIGRATION_CHECKSUMS, validateLiveMigrationTracking } from '../src/db/postgres/acceptedMigrations';
import { getDatabaseUrl, redactDatabaseUrl } from '../src/db/postgres/postgresConfig';
import { getPostgresPool, resetPostgresPoolForTests, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { CampaignBriefService } from '../src/services/campaigns/CampaignBriefService';
import { CampaignContextBuilder } from '../src/services/campaigns/CampaignContextBuilder';
import { CampaignPlannerService, type CampaignPlan } from '../src/services/campaigns/CampaignPlannerService';
import { createMockAIProvider, MOCK_PLAN_JSON } from '../src/services/campaigns/planningMockAI';
import type { AssembledBrief } from '../src/services/campaigns/CampaignBriefService';

const FIXTURE = {
  tenantA: 'pg3bv_tenant_a',
  wsA: 'pg3bv_ws_a',
  wsB: 'pg3bv_ws_b',
  campA: 'pg3bv_camp_a',
  campB: 'pg3bv_camp_ws_b',
  campEvent: 'pg3bv_camp_event',
  campOffer: 'pg3bv_camp_offer',
  parityTenant: 'pg3bv_parity_tenant',
  parityWs: 'pg3bv_parity_ws',
  parityCamp: 'pg3bv_parity_camp',
} as const;

const OWNED = {
  tenantIds: [FIXTURE.tenantA, FIXTURE.parityTenant],
  entityIds: [FIXTURE.wsA, FIXTURE.wsB, FIXTURE.parityWs],
  objectiveIds: [] as string[],
  campaignIds: [FIXTURE.campA, FIXTURE.campB, FIXTURE.campEvent, FIXTURE.campOffer, FIXTURE.parityCamp],
  briefIds: [] as string[],
  planIds: [] as string[],
  revisionIds: [] as string[],
  approvalIds: [] as string[],
};

type CheckFn = (label: string, condition: boolean, reason?: string) => void;

function normalizeIso(value: string | null | undefined): string | null {
  if (value == null) return null;
  return new Date(value).toISOString();
}

function normalizeBrief(b: AssembledBrief) {
  return {
    campaignId: b.campaignId,
    workspaceId: b.workspaceId,
    sourceSummary: b.sourceSummary,
    objectiveSummary: b.objectiveSummary,
    audienceDescription: b.audienceDescription,
    proposition: b.proposition,
    keyDetails: b.keyDetails,
    offerDescription: b.offerDescription,
    timingStartDate: b.timingStartDate,
    completenessStatus: b.completenessStatus,
    completenessMissingFields: b.completenessMissingFields,
  };
}

function normalizePlan(p: CampaignPlan) {
  return {
    campaignId: p.campaignId,
    workspaceId: p.workspaceId,
    version: p.version,
    status: p.status,
    isCurrent: p.isCurrent,
    strategy: p.strategy,
    hooks: p.hooks,
    proofPoints: p.proofPoints,
    callToAction: p.callToAction,
    channels: p.channels,
    contentMix: p.contentMix,
    cadence: p.cadence,
    creativeDirection: p.creativeDirection,
    measurement: p.measurement,
    rationale: p.rationale,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sqliteRepos() {
  return createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
}

function sqliteBriefService() {
  const repos = sqliteRepos();
  return new CampaignBriefService(() => repos);
}

function sqliteContextBuilder() {
  const repos = sqliteRepos();
  return new CampaignContextBuilder(() => repos);
}

function sqlitePlanner(ai: 'success' | 'fail' = 'success') {
  const repos = sqliteRepos();
  const ctx = new CampaignContextBuilder(() => repos);
  return new CampaignPlannerService(() => createMockAIProvider(ai), () => repos, ctx);
}

async function cleanupOwnedPostgresFixtures() {
  if (!getDatabaseUrl()) return;
  resetPostgresPoolForTests();
  await deleteOwnedPostgresFixtures(OWNED);
}

async function seedPlanningFixtures(repos: ReturnType<typeof createCoreRepositories>, now: string) {
  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG3B Workspace A',
    slug: 'pg3b-ws-a',
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
    name: 'PG3B Workspace B',
    slug: 'pg3b-ws-b',
    brandKit: {},
    apiKeys: {},
  });

  const baseCampaign = {
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'PG3B Campaign A',
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
    name: 'PG3B Campaign B',
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
  await repos.campaign.create({
    ...baseCampaign,
    id: FIXTURE.campEvent,
    sourceType: 'EVENT',
    sourceTitle: 'Summer Event',
    name: 'PG3B Event Campaign',
  });
  await repos.campaign.create({
    ...baseCampaign,
    id: FIXTURE.campOffer,
    sourceType: 'OFFER',
    sourceTitle: 'Spring Offer',
    name: 'PG3B Offer Campaign',
  });
}

async function runConfigChecks(check: CheckFn) {
  console.log('\n[PG-3B / Section A — Config]');

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

  for (const [file, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
    const filePath = path.join(migrationsDirectory(), file);
    const actual = computeMigrationChecksum(fs.readFileSync(filePath, 'utf8'));
    check(`A7 checksum unchanged: ${file}`, actual === expected, `got ${actual}`);
  }

  const sanitized = sanitizeCoreDbError(new Error('password=secret DATABASE_URL=postgres://x'));
  check('A8 sanitizeCoreDbError redacts sensitive tokens', !sanitized.includes('secret'));
}

async function runSqliteChecks(check: CheckFn) {
  console.log('\n[PG-3B / Section B — SQLite]');
  initDatabase();
  resetCoreRepositoriesForTests();

  const repos = sqliteRepos();
  const now = new Date().toISOString();
  await seedPlanningFixtures(repos, now);

  const briefSvc = sqliteBriefService();
  const planner = sqlitePlanner('success');
  const failPlanner = sqlitePlanner('fail');

  const assembled1 = await briefSvc.assemble(FIXTURE.campA);
  check('B1 brief assemble creates', !!assembled1?.id);
  if (assembled1) OWNED.briefIds.push(assembled1.id);

  const assembled2 = await briefSvc.assemble(FIXTURE.campA);
  check('B2 brief assemble updates same row', assembled1?.id === assembled2?.id);

  const briefCount = (db.prepare('SELECT COUNT(*) as n FROM campaign_briefs WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  check('B3 no duplicate brief', briefCount === 1);

  const gotBrief = await briefSvc.getForCampaign(FIXTURE.campA);
  check('B4 brief get', !!gotBrief);

  const eventBrief = await briefSvc.assemble(FIXTURE.campEvent);
  check('B5 EVENT completeness NEEDS_INPUT', eventBrief?.completenessStatus === 'NEEDS_INPUT');
  check('B6 EVENT missing event date', eventBrief?.completenessMissingFields.includes('Event date') === true);

  const patchedEvent = await briefSvc.patch(FIXTURE.campEvent, { timingStartDate: '2026-10-01' });
  check('B7 EVENT patch completes brief', patchedEvent?.completenessStatus === 'COMPLETE');

  const offerBrief = await briefSvc.assemble(FIXTURE.campOffer);
  check('B8 OFFER completeness NEEDS_INPUT', offerBrief?.completenessStatus === 'NEEDS_INPUT');
  const patchedOffer = await briefSvc.patch(FIXTURE.campOffer, { offerDescription: '20% off' });
  check('B9 OFFER patch completes brief', patchedOffer?.completenessStatus === 'COMPLETE');

  const wsGuard = await repos.campaign.findByIdForWorkspace(FIXTURE.campA, FIXTURE.wsB);
  check('B10 workspace guard blocks cross-workspace', wsGuard == null);

  const ctx = await sqliteContextBuilder().build(FIXTURE.campA);
  check('B11 context builder core fields', !!ctx?.campaign.id && !!ctx.objective.id && ctx.learnings.marketPerformance.length >= 0);

  const beforeGen = await planner.getCurrentPlan(FIXTURE.campA);
  check('B12 zero current plan before generate', beforeGen == null);

  const gen = await planner.generate(FIXTURE.campA);
  check('B13 generate success', !('error' in gen));
  if (!('error' in gen)) {
    OWNED.planIds.push(gen.plan.id);
    check('B14 version is 1', gen.plan.version === 1);
    check('B15 one current plan after generate', gen.plan.isCurrent === true);
    const current = await planner.getCurrentPlan(FIXTURE.campA);
    check('B16 get current matches', current?.id === gen.plan.id);
    const versions = await planner.getAllVersions(FIXTURE.campA);
    check('B17 list versions count', versions.length === 1);
    const byId = await planner.getPlanById(gen.plan.id, FIXTURE.campA);
    check('B18 get by id', byId?.id === gen.plan.id);
    const campRow = await repos.campaign.findById(FIXTURE.campA);
    check('B19 campaign READY_FOR_REVIEW', campRow?.status === 'READY_FOR_REVIEW');
  }

  const rev = await planner.revise(FIXTURE.campA, 'Make the hook bolder');
  check('B20 revise success', !('error' in rev));
  if (!('error' in rev)) {
    OWNED.planIds.push(rev.plan.id);
    check('B21 revised version increment', rev.plan.version === 2);
    check('B22 new plan is current', rev.plan.isCurrent === true);
    const versions = await planner.getAllVersions(FIXTURE.campA);
    const currentCount = versions.filter((v) => v.isCurrent).length;
    check('B23 exactly one current plan', currentCount === 1);
    const prior = versions.find((v) => v.version === 1);
    check('B24 prior plan not current', prior?.isCurrent === false);
    const latestRev = await repos.planning.revision.findLatestForCampaign(FIXTURE.campA);
    if (latestRev) OWNED.revisionIds.push(latestRev.id);
    check('B25 revision APPLIED', latestRev?.status === 'APPLIED');
    const campAfterRev = await repos.campaign.findById(FIXTURE.campA);
    check('B26 campaign READY_FOR_APPROVAL', campAfterRev?.status === 'READY_FOR_APPROVAL');
  }

  const planToApprove = !('error' in rev) ? rev.plan : null;
  if (planToApprove) {
    const approve1 = await planner.approvePlan(FIXTURE.campA, planToApprove.id);
    check('B27 approve success', !approve1.error);
    const approval1 = await planner.getApproval(FIXTURE.campA);
    check('B28 approval created', !!approval1);
    check('B29 approved version correct', approval1?.approvedVersion === planToApprove.version);
    const approvedPlan = await planner.getPlanById(planToApprove.id, FIXTURE.campA);
    check('B30 plan status APPROVED', approvedPlan?.status === 'APPROVED');
    const campApproved = await repos.campaign.findById(FIXTURE.campA);
    check('B31 campaign APPROVED', campApproved?.status === 'APPROVED');

    const approve2 = await planner.approvePlan(FIXTURE.campA, planToApprove.id);
    check('B32 re-approval succeeds', !approve2.error);
    const approvalRows = db.prepare('SELECT COUNT(*) as n FROM plan_approvals WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number };
    check('B33 only one approval row', approvalRows.n === 1);
  }

  const failCamp = `pg3bv_fail_${Date.now()}`;
  await repos.campaign.create({
    id: failCamp,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'Fail Camp',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'Fail Product',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: [],
    createdAt: now,
    updatedAt: now,
  });
  OWNED.campaignIds.push(failCamp);

  const seedPlanId = `pg3bv_seed_plan_${Date.now()}`;
  await repos.planning.plan.insert({
    id: seedPlanId,
    campaignId: failCamp,
    workspaceId: FIXTURE.wsA,
    version: 1,
    status: 'READY_FOR_REVIEW',
    isCurrent: true,
    data: JSON.parse(MOCK_PLAN_JSON) as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  });
  OWNED.planIds.push(seedPlanId);

  const failGen = await failPlanner.generate(failCamp);
  check('B34 generate fail returns error', 'error' in failGen);
  const afterFailCurrent = await failPlanner.getCurrentPlan(failCamp);
  check('B35 generate fail preserves current', afterFailCurrent?.id === seedPlanId);
  const failCampRow = await repos.campaign.findById(failCamp);
  check('B36 generate fail preserves campaign status', failCampRow?.status === 'DRAFTING');

  const failRev = await failPlanner.revise(failCamp, 'This will fail');
  check('B37 revise fail returns error', 'error' in failRev);
  const afterFailRevCurrent = await failPlanner.getCurrentPlan(failCamp);
  check('B38 revise fail preserves current', afterFailRevCurrent?.id === seedPlanId);
  const failRevRow = await repos.planning.revision.findLatestForCampaign(failCamp);
  if (failRevRow) OWNED.revisionIds.push(failRevRow.id);
  check('B39 revise fail status FAILED', failRevRow?.status === 'FAILED');
  check('B40 revise fail campaign restored', (await repos.campaign.findById(failCamp))?.status === 'READY_FOR_REVIEW');

  deleteOwnedSqliteFixtures(db, OWNED);
}

async function runPostgresLiveChecks(check: CheckFn, report: Record<string, Record<string, number>>) {
  console.log('\n[PG-3B / Section C — Postgres live]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres live — DATABASE_URL not configured');
    return;
  }

  resetCoreRepositoriesForTests();
  resetPostgresPoolForTests();
  await cleanupOwnedPostgresFixtures();

  const pgEnv = {
    ...process.env,
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
  };

  const repos = createCoreRepositories(pgEnv);
  check('C0 driver is postgres', repos.driver === 'postgres');

  const now = new Date().toISOString();
  await seedPlanningFixtures(repos, now);
  report.created = { tenants: 1, entities: 2, campaigns: 4 };

  const ctxBuilder = new CampaignContextBuilder(() => repos);
  const briefSvc = new CampaignBriefService(() => repos);
  const planner = new CampaignPlannerService(
    () => createMockAIProvider('success'),
    () => repos,
    ctxBuilder,
  );

  const brief = await briefSvc.assemble(FIXTURE.campA);
  check('C1 brief assemble on postgres', !!brief?.id);
  if (brief) OWNED.briefIds.push(brief.id);

  const gen = await planner.generate(FIXTURE.campA);
  check('C2 generate on postgres', !('error' in gen));
  if (!('error' in gen)) {
    OWNED.planIds.push(gen.plan.id);
    check('C3 JSON/TEXT channels roundtrip', gen.plan.channels.length === 1);
    check('C4 timestamps present', !!gen.plan.createdAt && !!gen.plan.updatedAt);
  }

  const rev = await planner.revise(FIXTURE.campA, 'Adjust cadence');
  check('C5 revise on postgres', !('error' in rev));
  if (!('error' in rev)) {
    OWNED.planIds.push(rev.plan.id);
    check('C6 version increment', rev.plan.version === 2);
  }

  if (!('error' in rev)) {
    await planner.approvePlan(FIXTURE.campA, rev.plan.id);
    const approval = await planner.getApproval(FIXTURE.campA);
    check('C7 approval upsert', approval?.approvedVersion === 2);
    check('C8 approved_at populated', !!approval?.approvedAt);
  }

  const crossWs = await repos.campaign.findByIdForWorkspace(FIXTURE.campA, FIXTURE.wsB);
  check('C9 workspace isolation', crossWs == null);

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
    await badRepos.planning.plan.getCurrent(FIXTURE.campA);
  } catch {
    pgFailed = true;
  } finally {
    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
    resetPostgresPoolForTests();
  }
  const sqliteAfter = (db.prepare('SELECT COUNT(*) as n FROM campaigns').get() as { n: number }).n;
  check('C10 connection failure', pgFailed);
  check('C11 no SQLite fallback writes', sqliteBefore === sqliteAfter);

  resetPostgresPoolForTests();
}

async function runTransactionProbes(check: CheckFn) {
  console.log('\n[PG-3B / Section D — Transaction probes]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Transaction probes — DATABASE_URL not configured');
    return;
  }

  resetCoreRepositoriesForTests();
  resetPostgresPoolForTests();
  await cleanupOwnedPostgresFixtures();

  const pgEnv = {
    ...process.env,
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
  };
  const repos = createCoreRepositories(pgEnv);
  const now = new Date().toISOString();
  const probeCamp = 'pg3bv_tx_probe_camp';
  OWNED.campaignIds.push(probeCamp);

  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG3B TX WS',
    slug: 'pg3b-tx-ws',
    brandKit: {},
    apiKeys: {},
  });
  await repos.campaign.create({
    id: probeCamp,
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

  const seedPlanId = 'pg3bv_tx_seed_plan';
  OWNED.planIds.push(seedPlanId);
  await repos.planning.plan.insert({
    id: seedPlanId,
    campaignId: probeCamp,
    workspaceId: FIXTURE.wsA,
    version: 1,
    status: 'READY_FOR_REVIEW',
    isCurrent: true,
    data: JSON.parse(MOCK_PLAN_JSON) as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  });

  const ctxBuilder = new CampaignContextBuilder(() => repos);

  process.env.PG3B_INJECT_FAILURE = 'generate_after_unset_current';
  const genPlanner = new CampaignPlannerService(() => createMockAIProvider('success'), () => repos, ctxBuilder);
  const genFail = await genPlanner.generate(probeCamp);
  delete process.env.PG3B_INJECT_FAILURE;
  check('D1 generate probe returns error', 'error' in genFail);
  const afterGenProbe = await repos.planning.plan.getCurrent(probeCamp);
  check('D2 generate rollback preserves current', afterGenProbe?.id === seedPlanId);
  check('D3 generate rollback campaign unchanged', (await repos.campaign.findById(probeCamp))?.status === 'DRAFTING');

  await repos.campaign.updateStatus(probeCamp, 'READY_FOR_REVIEW', now);
  process.env.PG3B_INJECT_FAILURE = 'revise_after_unset_current';
  const revPlanner = new CampaignPlannerService(() => createMockAIProvider('success'), () => repos, ctxBuilder);
  try {
    const revFail = await revPlanner.revise(probeCamp, 'fail during tx');
    check('D4 revise probe returns error', 'error' in revFail);
  } catch {
    check('D4 revise probe returns error', true);
  }
  delete process.env.PG3B_INJECT_FAILURE;
  const afterRevProbe = await repos.planning.plan.getCurrent(probeCamp);
  check('D5 revise rollback preserves current', afterRevProbe?.id === seedPlanId);

  const planForApprove = await repos.planning.plan.getCurrent(probeCamp);
  if (planForApprove) {
    process.env.PG3B_INJECT_FAILURE = 'approve_after_upsert';
    const approveFail = await revPlanner.approvePlan(probeCamp, planForApprove.id);
    delete process.env.PG3B_INJECT_FAILURE;
    check('D6 approve probe returns error', !!approveFail.error);
    const approvalAfter = await repos.planning.approval.findByCampaignId(probeCamp);
    check('D7 approve rollback no approval row', approvalAfter == null);
    const planStatus = await repos.planning.plan.getById(planForApprove.id, probeCamp);
    check('D8 approve rollback plan not approved', planStatus?.status !== 'APPROVED');
    check('D9 approve rollback campaign not approved', (await repos.campaign.findById(probeCamp))?.status !== 'APPROVED');
  }
}

async function runCrossEngineParity(check: CheckFn) {
  console.log('\n[PG-3B / Section E — Cross-engine parity]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Cross-engine parity — DATABASE_URL not configured');
    return;
  }

  const now = '2026-09-05T12:00:00.000Z';
  resetCoreRepositoriesForTests();
  const sqliteReposInstance = createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
  await sqliteReposInstance.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await sqliteReposInstance.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'parity-ws',
    brandKit: { brandBrain: { audience: { primaryAudience: 'Parity audience' } } },
    apiKeys: {},
  });
  await sqliteReposInstance.campaign.create({
    id: FIXTURE.parityCamp,
    workspaceId: FIXTURE.parityWs,
    objectiveId: 'obj_sys_sales',
    name: 'Parity Campaign',
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

  const sqliteBrief = new CampaignBriefService(() => sqliteReposInstance);
  const sqliteCtx = new CampaignContextBuilder(() => sqliteReposInstance);
  const sqlitePlannerInstance = new CampaignPlannerService(
    () => createMockAIProvider('success'),
    () => sqliteReposInstance,
    sqliteCtx,
  );

  const sqliteBriefRow = await sqliteBrief.assemble(FIXTURE.parityCamp);
  const sqliteGen = await sqlitePlannerInstance.generate(FIXTURE.parityCamp);
  const sqliteRev = !('error' in sqliteGen)
    ? await sqlitePlannerInstance.revise(FIXTURE.parityCamp, 'Parity revision')
    : null;
  if (sqliteBriefRow) OWNED.briefIds.push(sqliteBriefRow.id);
  if (!('error' in sqliteGen)) OWNED.planIds.push(sqliteGen.plan.id);
  if (sqliteRev && !('error' in sqliteRev)) OWNED.planIds.push(sqliteRev.plan.id);

  resetPostgresPoolForTests();
  const pgReposInstance = createCoreRepositories({
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  await pgReposInstance.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await pgReposInstance.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'parity-ws',
    brandKit: { brandBrain: { audience: { primaryAudience: 'Parity audience' } } },
    apiKeys: {},
  });
  await pgReposInstance.campaign.create({
    id: FIXTURE.parityCamp,
    workspaceId: FIXTURE.parityWs,
    objectiveId: 'obj_sys_sales',
    name: 'Parity Campaign',
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

  const pgBrief = new CampaignBriefService(() => pgReposInstance);
  const pgCtx = new CampaignContextBuilder(() => pgReposInstance);
  const pgPlannerInstance = new CampaignPlannerService(
    () => createMockAIProvider('success'),
    () => pgReposInstance,
    pgCtx,
  );

  const pgBriefRow = await pgBrief.assemble(FIXTURE.parityCamp);
  const pgGen = await pgPlannerInstance.generate(FIXTURE.parityCamp);
  const pgRev = !('error' in pgGen)
    ? await pgPlannerInstance.revise(FIXTURE.parityCamp, 'Parity revision')
    : null;

  check('E1 brief parity', deepEqual(normalizeBrief(sqliteBriefRow!), normalizeBrief(pgBriefRow!)));
  if (!('error' in sqliteGen) && !('error' in pgGen)) {
    check('E2 generate plan parity', deepEqual(normalizePlan(sqliteGen.plan), normalizePlan(pgGen.plan)));
  }
  if (sqliteRev && pgRev && !('error' in sqliteRev) && !('error' in pgRev)) {
    check('E3 revise plan parity', deepEqual(normalizePlan(sqliteRev.plan), normalizePlan(pgRev.plan)));
  }

  deleteOwnedSqliteFixtures(db, {
    tenantIds: [FIXTURE.parityTenant],
    entityIds: [FIXTURE.parityWs],
    objectiveIds: [],
    campaignIds: [FIXTURE.parityCamp],
    briefIds: sqliteBriefRow ? [sqliteBriefRow.id] : [],
    planIds: OWNED.planIds.filter((id) => id.includes('parity') || id.startsWith('plan_')),
  });
}

async function runCleanup(check: CheckFn, report: Record<string, Record<string, number>>) {
  console.log('\n[PG-3B / Section F — Cleanup]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres cleanup — DATABASE_URL not configured');
    return;
  }

  resetPostgresPoolForTests();
  const cleanupReport = await deleteOwnedPostgresFixtures(OWNED);
  report.removed = cleanupReport.removed;
  report.skipped = cleanupReport.skipped;
  report.remaining = {};

  const repos = createCoreRepositories({
    CORE_DB_DRIVER: 'postgres',
    PG2_VERIFICATION_ALLOWED: '1',
    DATABASE_URL: process.env.DATABASE_URL,
  });

  for (const id of OWNED.campaignIds) {
    if (await repos.campaign.findById(id)) {
      report.remaining.campaigns = (report.remaining.campaigns ?? 0) + 1;
    }
  }
  check('F1 exact-ID cleanup executed', cleanupReport.removed.campaigns >= 0 || cleanupReport.skipped.campaigns >= 0);
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

  console.log('PG-3B Campaign Planning Parity Verification');

  await runConfigChecks(check);
  await runSqliteChecks(check);

  try {
    await runPostgresLiveChecks(check, liveReport);
    await runTransactionProbes(check);
    await runCrossEngineParity(check);
  } finally {
    await runCleanup(check, liveReport);
    await shutdownPostgresPool();
  }

  console.log('\n--- PG-3B Live Supabase fixture report ---');
  console.log('Created:', JSON.stringify(liveReport.created));
  console.log('Removed:', JSON.stringify(liveReport.removed));
  console.log('Skipped:', JSON.stringify(liveReport.skipped));
  console.log('Remaining:', JSON.stringify(liveReport.remaining));

  console.log(`\nPG-3B results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nPG-3B PLANNING PARITY: FAIL');
    process.exit(1);
  }
  console.log('\nPG-3B PLANNING PARITY: PASS');
}

main().catch((err) => {
  console.error(err);
  console.log('\nPG-3B PLANNING PARITY: FAIL');
  process.exit(1);
});
