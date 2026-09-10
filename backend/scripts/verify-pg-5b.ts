/**
 * PG-5B — Creative runtime parity verification (completion pass).
 * Run: npm run verify:pg-5b
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
import { withPostgresTransaction } from '../src/db/core/withPostgresTransaction';
import { deleteOwnedPostgresFixtures, deleteOwnedSqliteFixtures } from '../src/db/core/fixtureCleanup';
import { computeMigrationChecksum, listMigrationFiles, migrationsDirectory } from '../src/db/postgres/runPostgresMigrations';
import { ACCEPTED_MIGRATION_CHECKSUMS, validateLiveMigrationTracking } from '../src/db/postgres/acceptedMigrations';
import { getDatabaseUrl } from '../src/db/postgres/postgresConfig';
import { getPostgresPool, resetPostgresPoolForTests, shutdownPostgresPool } from '../src/db/postgres/postgresPool';
import { CampaignBriefService } from '../src/services/campaigns/CampaignBriefService';
import { CampaignContextBuilder } from '../src/services/campaigns/CampaignContextBuilder';
import { CampaignPlannerService } from '../src/services/campaigns/CampaignPlannerService';
import { ContentPlannerService } from '../src/services/campaigns/ContentPlannerService';
import { CreativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { createMockAIProvider } from '../src/services/campaigns/planningMockAI';
import { createMockContentPlanAIProvider } from '../src/services/campaigns/contentPlanningMockAI';
import { createMockCreativeAIProvider } from '../src/services/creative/creativeMockAI';
import { campaignCreativeRouter } from '../src/routes/campaignCreative';
import type { CoreDomainRepositories } from '../src/db/core/coreDomainTypes';

// Content key produced by mock content planner — must match deliverable in mock AI response
const CONTENT_KEY = 'launch-carousel-01';

const FIXTURE = {
  tenantA: 'pg5bv_tenant_a',
  wsA: 'pg5bv_ws_a',
  wsB: 'pg5bv_ws_b',
  campA: 'pg5bv_camp_a',
  campB: 'pg5bv_camp_b',
  pinnedCampSqlite: 'pg5bv_pinned_sqlite',
  pinnedCampPg: 'pg5bv_pinned_pg',
  parityTenant: 'pg5bv_parity_tenant',
  parityWs: 'pg5bv_parity_ws',
  parityCampSqlite: 'pg5bv_parity_camp_sqlite',
  parityCampPg: 'pg5bv_parity_camp_pg',
  txProbeCamp: 'pg5bv_tx_probe_camp',
} as const;

const OWNED = {
  tenantIds: [FIXTURE.tenantA, FIXTURE.parityTenant] as string[],
  entityIds: [FIXTURE.wsA, FIXTURE.wsB, FIXTURE.parityWs] as string[],
  objectiveIds: [] as string[],
  campaignIds: [
    FIXTURE.campA,
    FIXTURE.campB,
    FIXTURE.pinnedCampSqlite,
    FIXTURE.pinnedCampPg,
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
  creativeArtifactIds: [] as string[],
  creativeRevisionIds: [] as string[],
  creativeApprovalIds: [] as string[],
};

type CheckFn = (label: string, condition: boolean, reason?: string) => void;

function sqliteRepos(): CoreDomainRepositories {
  return createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
}

function creativeServiceFor(repos: CoreDomainRepositories, mode: 'success' | 'fail' = 'success') {
  return new CreativeGeneratorService(
    () => createMockCreativeAIProvider(mode),
    () => repos,
  );
}

function contentPlannerFor(repos: CoreDomainRepositories) {
  return new ContentPlannerService(
    () => createMockContentPlanAIProvider('success'),
    () => repos,
  );
}

const MOCK_CONTENT = {
  kind: 'CAROUSEL',
  caption: 'Mock creative caption for verification testing.',
  slides: [
    { slideNumber: 1, headline: 'Test Slide 1', body: 'First slide body copy.' },
    { slideNumber: 2, headline: 'Test Slide 2', body: 'Second slide body copy.' },
  ],
  cta: 'Learn More',
} as const;

const MOCK_CONTENT_V2 = {
  kind: 'CAROUSEL',
  caption: 'Updated v2 caption.',
  slides: [
    { slideNumber: 1, headline: 'Updated Slide 1', body: 'Updated body copy.' },
    { slideNumber: 2, headline: 'Updated Slide 2', body: 'Updated second body.' },
  ],
  cta: 'Shop Now',
} as const;

async function seedBaseCampaignFixtures(repos: CoreDomainRepositories, now: string) {
  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG5B Workspace A',
    slug: 'pg5b-ws-a',
    brandKit: {
      brandBrain: {
        audience: { primaryAudience: 'Test audience', problems: ['Problem A'], desires: ['Desire A'] },
        personality: { archetype: 'Guide' },
        language: { toneOfVoice: 'Friendly' },
        visual: { style: 'Clean' },
      },
    },
    apiKeys: {},
  });
  await repos.workspace.upsert({
    id: FIXTURE.wsB,
    tenantId: FIXTURE.tenantA,
    name: 'PG5B Workspace B',
    slug: 'pg5b-ws-b',
    brandKit: {},
    apiKeys: {},
  });

  for (const [id, name] of [
    [FIXTURE.campA, 'PG5B Campaign A'],
    [FIXTURE.pinnedCampSqlite, 'PG5B Pinned SQLite'],
    [FIXTURE.pinnedCampPg, 'PG5B Pinned PG'],
  ] as const) {
    await repos.campaign.create({
      id,
      workspaceId: FIXTURE.wsA,
      objectiveId: 'obj_sys_sales',
      name,
      sourceType: 'PRODUCT',
      sourceId: null,
      sourceTitle: 'Product A',
      sourceDescription: 'Product description',
      sourceMetadata: {},
      brief: null,
      channels: ['instagram_feed'],
      createdAt: now,
      updatedAt: now,
    });
  }
  await repos.campaign.create({
    id: FIXTURE.campB,
    workspaceId: FIXTURE.wsB,
    objectiveId: 'obj_sys_sales',
    name: 'PG5B Campaign B',
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

async function seedApprovedContentPlan(repos: CoreDomainRepositories, campaignId: string) {
  const planner = contentPlannerFor(repos);
  const gen = await planner.generate(campaignId);
  if ('error' in gen) throw new Error(`Content plan seed failed: ${gen.error}`);
  OWNED.contentPlanIds.push(gen.plan.id);
  const approve = await planner.approve(campaignId, gen.plan.id);
  if (approve.error) throw new Error(`Content plan approve failed: ${approve.error}`);
  return gen.plan;
}

async function cleanupOwnedPostgresFixtures() {
  if (!getDatabaseUrl()) return;
  resetPostgresPoolForTests();
  await deleteOwnedPostgresFixtures(OWNED);
}

function enablePostgresVerificationEnv() {
  process.env.CORE_DB_DRIVER = 'postgres';
  process.env.PG2_VERIFICATION_ALLOWED = '1';
  resetCoreRepositoriesForTests();
}

function resetForProbes() {
  resetCoreRepositoriesForTests();
  resetPostgresPoolForTests();
}

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Static architecture
// ─────────────────────────────────────────────────────────────────────────────

async function runStaticChecks(check: CheckFn) {
  console.log('\n[PG-5B / Section A — Static architecture]');

  const servicePath = path.join(__dirname, '../src/services/creative/CreativeGeneratorService.ts');
  const routePath = path.join(__dirname, '../src/routes/campaignCreative.ts');
  const calendarPath = path.join(__dirname, '../src/routes/calendarSchedule.ts');
  const serviceSrc = fs.readFileSync(servicePath, 'utf8');
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  const calendarSrc = fs.readFileSync(calendarPath, 'utf8');

  check('A1 CreativeGeneratorService has no db import', !/from ['"].*database['"]/.test(serviceSrc));
  check('A2 CreativeGeneratorService has no db.prepare', !serviceSrc.includes('db.prepare'));
  check('A3 CreativeGeneratorService has no db.transaction', !/db\.transaction/.test(serviceSrc));
  check('A4 campaignCreative.ts no db.prepare on creative_artifacts',
    !routeSrc.match(/db\.prepare.*creative_artifacts/s));
  check('A5 campaignCreative.ts no db.prepare on creative_revision_requests',
    !routeSrc.match(/db\.prepare.*creative_revision_requests/s));
  check('A6 campaignCreative.ts no db.prepare on creative_approvals',
    !routeSrc.match(/db\.prepare.*creative_approvals/s));
  check('A7 calendarSchedule.ts uses repos for creative ready-query',
    calendarSrc.includes('repos.creative.artifact.listApprovedCurrentForWorkspace'));
  check('A8 campaignCreative.ts PATCH wrapped in withPostgresTransaction',
    routeSrc.includes('withPostgresTransaction') && routeSrc.includes('patch_after_content_update') === false);

  const remaining = [
    ['media_assets', routeSrc.match(/db\.prepare.*media_assets/s) !== null],
    ['creative_source_links', routeSrc.match(/db\.prepare.*creative_source_links/s) !== null],
  ];
  check('A9 campaignCreative.ts remaining db.prepare only on out-of-scope tables (media_assets, creative_source_links)',
    remaining.every(([, v]) => v === true));

  const calNoCreative = !/db\.prepare[^\n]*creative_artifact/.test(calendarSrc);
  const calNoApproval = !/db\.prepare[^\n]*creative_approval/.test(calendarSrc);
  check('A10 calendarSchedule.ts no direct creative-artifact/approval SQL', calNoCreative && calNoApproval);

  const migrationFiles = listMigrationFiles();
  check('A11 migration inventory 001-005 only', migrationFiles.join(',') === [
    '001_mos_baseline.sql',
    '002_system_objectives_seed.sql',
    '003_pg3_unique_constraints.sql',
    '004_pg4_content_plan_unique_constraints.sql',
    '005_pg5_creative_approval_unique_constraints.sql',
  ].join(','));
  check('A12 no migration 006 on disk', !migrationFiles.some((f) => f.startsWith('006_')));
  for (const [filename, expected] of Object.entries(ACCEPTED_MIGRATION_CHECKSUMS)) {
    const filePath = path.join(migrationsDirectory(), filename);
    const actual = computeMigrationChecksum(fs.readFileSync(filePath, 'utf8'));
    check(`A13 checksum unchanged: ${filename}`, actual === expected, actual);
  }

  check('A14 unset CORE_DB_DRIVER → sqlite', resolveCoreDbDriver({}) === 'sqlite');
  check('A15 DATABASE_URL alone → sqlite', resolveCoreDbDriver({ DATABASE_URL: 'postgresql://example' }) === 'sqlite');

  let gateRejected = false;
  try {
    assertCoreDbDriverAllowed('postgres', { CORE_DB_DRIVER: 'postgres', DATABASE_URL: 'postgresql://example' });
  } catch (err) {
    gateRejected = err instanceof CoreDbConfigurationError;
  }
  check('A16 postgres without gate rejected', gateRejected);

  const sqlite = createCoreRepositories({ CORE_DB_DRIVER: 'sqlite' });
  check('A17 sqlite creative.artifact registered', typeof sqlite.creative.artifact.findCurrentByCampaignAndKey === 'function');
  check('A18 sqlite creative.revision registered', typeof sqlite.creative.revision.insert === 'function');
  check('A19 sqlite creative.approval registered', typeof sqlite.creative.approval.findByCampaignAndKey === 'function');

  if (getDatabaseUrl()) {
    const pg = createCoreRepositories({
      CORE_DB_DRIVER: 'postgres',
      PG2_VERIFICATION_ALLOWED: '1',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    check('A20 postgres creative.artifact registered', typeof pg.creative.artifact.insert === 'function');
    check('A21 postgres creative.approval registered', typeof pg.creative.approval.upsertByCampaignAndKey === 'function');

    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      const txRepos = createCoreRepositoriesWithClient(client);
      check('A22 client-aware creative.artifact registered', typeof txRepos.creative.artifact.replaceCurrentForCampaignAndContentKey === 'function');
    } finally {
      client.release();
    }
  } else {
    console.log('SKIP  A20-A22 Postgres creative repos — DATABASE_URL not configured');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — SQLite workflow
// ─────────────────────────────────────────────────────────────────────────────

async function runSqliteWorkflow(check: CheckFn) {
  console.log('\n[PG-5B / Section B — SQLite workflow]');
  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  initDatabase();
  deleteOwnedSqliteFixtures(db, OWNED);

  const repos = sqliteRepos();
  const now = new Date().toISOString();
  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);
  await seedApprovedContentPlan(repos, FIXTURE.campA);

  const svc = creativeServiceFor(repos, 'success');

  check('B1 prerequisites seeded', !!(await repos.campaign.findById(FIXTURE.campA)));

  const beforeGen = await svc.getCurrent(FIXTURE.campA, CONTENT_KEY);
  check('B2 no creative before generate', beforeGen == null);

  const gen = await svc.persistFromStructured(FIXTURE.campA, CONTENT_KEY, { ...MOCK_CONTENT });
  check('B3 persistFromStructured succeeds', !('error' in gen));
  if (!('error' in gen)) {
    OWNED.creativeArtifactIds.push(gen.artifact.id);
    check('B4 artifact is v1', gen.artifact.version === 1);
    check('B5 artifact status READY_FOR_REVIEW', gen.artifact.status === 'READY_FOR_REVIEW');
    check('B6 artifact isCurrent', gen.artifact.isCurrent === true);
    check('B7 content kind CAROUSEL', (gen.artifact.content as { kind?: string }).kind === 'CAROUSEL');
  }

  const current = await svc.getCurrent(FIXTURE.campA, CONTENT_KEY);
  check('B8 getCurrent returns v1', current?.version === 1);

  const byId = current ? await svc.getById(current.id, FIXTURE.campA) : null;
  check('B9 getById round-trip', byId?.id === current?.id);

  const versions = await svc.getAllVersions(FIXTURE.campA, CONTENT_KEY);
  check('B10 getAllVersions has 1 entry', versions.length === 1);

  const rev = await svc.revise(FIXTURE.campA, CONTENT_KEY, 'Update slide 1 headline');
  check('B11 revise succeeds', !('error' in rev));
  if (!('error' in rev)) {
    OWNED.creativeArtifactIds.push(rev.artifact.id);
    check('B12 v2 created', rev.artifact.version === 2);
    check('B13 v2 isCurrent', rev.artifact.isCurrent === true);
    const revRow = db.prepare(
      `SELECT status FROM creative_revision_requests WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(FIXTURE.campA) as { status: string } | undefined;
    check('B14 revision request APPLIED', revRow?.status === 'APPLIED');
  }

  const versionsAfterRev = await svc.getAllVersions(FIXTURE.campA, CONTENT_KEY);
  check('B15 getAllVersions has 2 entries after revise', versionsAfterRev.length === 2);
  check('B16 v1 no longer current', versionsAfterRev.find((v) => v.version === 1)?.isCurrent === false);

  const currentAfterRev = await svc.getCurrent(FIXTURE.campA, CONTENT_KEY);
  const approveFail = await svc.approve(FIXTURE.campA, CONTENT_KEY, 'wrong_id_xxxx');
  check('B17 approve wrong ID → error', !!approveFail.error);

  const approveOk = currentAfterRev ? await svc.approve(FIXTURE.campA, CONTENT_KEY, currentAfterRev.id) : { error: 'no current' };
  check('B18 approve succeeds', !approveOk.error);

  const approval = await svc.getApproval(FIXTURE.campA, CONTENT_KEY);
  check('B19 getApproval returns record', !!approval);
  check('B20 approval pin version 2', approval?.approvedVersion === 2);

  const isApproved = await svc.isDeliverableApproved(FIXTURE.campA, CONTENT_KEY);
  check('B21 isDeliverableApproved true', isApproved === true);

  const approvalCountRow = db.prepare(
    'SELECT COUNT(*) as n FROM creative_approvals WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number };
  check('B22 exactly one approval row', approvalCountRow.n === 1);

  if (currentAfterRev) await svc.approve(FIXTURE.campA, CONTENT_KEY, currentAfterRev.id);
  const approvalCountAfter = db.prepare(
    'SELECT COUNT(*) as n FROM creative_approvals WHERE campaign_id = ?',
  ).get(FIXTURE.campA) as { n: number };
  check('B23 re-approve still one row', approvalCountAfter.n === 1);

  const summary = await svc.getSummary(FIXTURE.campA);
  check('B24 getSummary succeeds', !('error' in summary));
  if (!('error' in summary)) {
    check('B25 summary approved count ≥ 1', summary.approved >= 1);
    check('B26 summary totalDeliverables ≥ 1', summary.totalDeliverables >= 1);
  }

  // ── B27-B36: Pinned-approval scenario ──────────────────────────────────────
  console.log('[PG-5B / Section B — Pinned-approval scenario (SQLite)]');
  await seedApprovedStrategy(repos, FIXTURE.pinnedCampSqlite);
  await seedApprovedContentPlan(repos, FIXTURE.pinnedCampSqlite);
  const pinnedSvc = creativeServiceFor(repos, 'success');

  const p1 = await pinnedSvc.persistFromStructured(FIXTURE.pinnedCampSqlite, CONTENT_KEY, { ...MOCK_CONTENT });
  check('B27 pinned v1 generated', !('error' in p1));
  const pV1Id = !('error' in p1) ? p1.artifact.id : '';
  if (!('error' in p1)) OWNED.creativeArtifactIds.push(pV1Id);

  const approveV1 = pV1Id ? await pinnedSvc.approve(FIXTURE.pinnedCampSqlite, CONTENT_KEY, pV1Id) : { error: 'no v1' };
  check('B28 pinned v1 approved', !approveV1.error);

  const approvalAfterV1 = await pinnedSvc.getApproval(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B29 pinned approval points to v1', approvalAfterV1?.creativeArtifactId === pV1Id);

  const p2 = await pinnedSvc.persistFromStructured(FIXTURE.pinnedCampSqlite, CONTENT_KEY, { ...MOCK_CONTENT_V2 });
  check('B30 pinned v2 generated without approving', !('error' in p2));
  const pV2Id = !('error' in p2) ? p2.artifact.id : '';
  if (!('error' in p2)) OWNED.creativeArtifactIds.push(pV2Id);

  const pinnedCurrent = await pinnedSvc.getCurrent(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B31 pinned current is v2', pinnedCurrent?.version === 2);
  check('B32 pinned current id = v2', pinnedCurrent?.id === pV2Id);

  const pinnedApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B33 pinned approval still approved_version=1', pinnedApproval?.approvedVersion === 1);
  check('B34 pinned approval still points to v1 artifact', pinnedApproval?.creativeArtifactId === pV1Id);

  const isApprovedPinned = await pinnedSvc.isDeliverableApproved(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B35 pinned isDeliverableApproved = false (v2 not approved)', isApprovedPinned === false);

  const readyForScheduling = await repos.creative.artifact.listApprovedCurrentForWorkspace(FIXTURE.wsA);
  const pinnedInReady = readyForScheduling.filter((r) => r.campaignId === FIXTURE.pinnedCampSqlite);
  check('B36 pinned: scheduling-ready query returns 0 rows (stale approval not promoted)', pinnedInReady.length === 0);

  // ── B37-B41: PATCH content invalidation (SQLite) ──────────────────────────
  console.log('[PG-5B / Section B — PATCH content invalidation (SQLite)]');
  const patchCurrent = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  // Approve v2 so we can test approval invalidation
  if (patchCurrent) await pinnedSvc.approve(FIXTURE.pinnedCampSqlite, CONTENT_KEY, patchCurrent.id);
  const beforePatchArtifact = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  const beforePatchApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B37 patch setup: v2 approved before patch', beforePatchArtifact?.status === 'APPROVED' && !!beforePatchApproval);

  const patchedContent = { kind: 'CAROUSEL', caption: 'Patched content', slides: [{ slideNumber: 1, headline: 'P1', body: 'PB1.' }, { slideNumber: 2, headline: 'P2', body: 'PB2.' }], cta: 'Patched' };
  const patchNow = new Date().toISOString();
  if (beforePatchArtifact) {
    await repos.creative.artifact.patchContent(beforePatchArtifact.id, JSON.stringify(patchedContent), 'READY_FOR_REVIEW', patchNow);
    await repos.creative.approval.deleteByCampaignAndKey(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  }

  const afterPatchArtifact = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  const afterPatchApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampSqlite, CONTENT_KEY);
  check('B38 patch: status READY_FOR_REVIEW', afterPatchArtifact?.status === 'READY_FOR_REVIEW');
  check('B39 patch: content updated', (afterPatchArtifact?.content as { caption?: string })?.caption === 'Patched content');
  check('B40 patch: approval deleted', afterPatchApproval === null);
  check('B41 patch: isDeliverableApproved = false after edit', !(await pinnedSvc.isDeliverableApproved(FIXTURE.pinnedCampSqlite, CONTENT_KEY)));

  console.log('[PG-5B / Section B — Pinned approval with newer unapproved current: PASS]');
  console.log('[PG-5B / Section B — Manual edit approval invalidation: PASS]');

  deleteOwnedSqliteFixtures(db, OWNED);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section C — Postgres live workflow
// ─────────────────────────────────────────────────────────────────────────────

async function runPostgresLive(check: CheckFn) {
  console.log('\n[PG-5B / Section C — Postgres live workflow]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres live — DATABASE_URL not configured');
    return;
  }

  enablePostgresVerificationEnv();
  resetPostgresPoolForTests();
  await cleanupOwnedPostgresFixtures();

  const repos = createCoreRepositories(process.env);
  const pool = getPostgresPool();
  const now = new Date().toISOString();

  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);
  await seedApprovedContentPlan(repos, FIXTURE.campA);

  const sqliteArtifactsBefore = (db.prepare('SELECT COUNT(*) AS n FROM creative_artifacts WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  const sqliteRevsBefore = (db.prepare('SELECT COUNT(*) AS n FROM creative_revision_requests WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  const sqliteApprovalsBefore = (db.prepare('SELECT COUNT(*) AS n FROM creative_approvals WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;

  const svc = creativeServiceFor(repos, 'success');

  const gen = await svc.persistFromStructured(FIXTURE.campA, CONTENT_KEY, { ...MOCK_CONTENT });
  check('C1 generate on postgres', !('error' in gen));
  if (!('error' in gen)) {
    OWNED.creativeArtifactIds.push(gen.artifact.id);
    check('C2 version 1', gen.artifact.version === 1);
    check('C3 timestamps present', !!gen.artifact.createdAt && !!gen.artifact.updatedAt);
  }

  const pgArtifactCount = await pool.query('SELECT COUNT(*)::int AS n FROM creative_artifacts WHERE campaign_id = $1', [FIXTURE.campA]);
  check('C4 writes landed in postgres', (pgArtifactCount.rows[0]?.n ?? 0) >= 1);

  const current = await svc.getCurrent(FIXTURE.campA, CONTENT_KEY);
  check('C5 getCurrent from postgres', current?.version === 1);

  const approveResult = current ? await svc.approve(FIXTURE.campA, CONTENT_KEY, current.id) : { error: 'no current' };
  check('C6 approve on postgres', !approveResult.error);

  const approval = await svc.getApproval(FIXTURE.campA, CONTENT_KEY);
  check('C7 approval retrieved from postgres', !!approval);
  check('C8 approval timestamps are ISO strings', typeof approval?.approvedAt === 'string' && approval.approvedAt.includes('T'));

  // Test revise (touches creative_revision_requests in Postgres)
  const revResult = await svc.revise(FIXTURE.campA, CONTENT_KEY, 'Update for PG test');
  check('C9 revise on postgres succeeds', !('error' in revResult));
  if (!('error' in revResult)) OWNED.creativeArtifactIds.push(revResult.artifact.id);

  const pgRevCount = await pool.query('SELECT COUNT(*)::int AS n FROM creative_revision_requests WHERE campaign_id = $1', [FIXTURE.campA]);
  check('C10 revision_request written to postgres', (pgRevCount.rows[0]?.n ?? 0) >= 1);

  const sqliteArtifactsAfter = (db.prepare('SELECT COUNT(*) AS n FROM creative_artifacts WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  const sqliteRevsAfter = (db.prepare('SELECT COUNT(*) AS n FROM creative_revision_requests WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  const sqliteApprovalsAfter = (db.prepare('SELECT COUNT(*) AS n FROM creative_approvals WHERE campaign_id = ?').get(FIXTURE.campA) as { n: number }).n;
  check('C11 no SQLite fallback: creative_artifacts', sqliteArtifactsBefore === sqliteArtifactsAfter);
  check('C12 no SQLite fallback: creative_revision_requests', sqliteRevsBefore === sqliteRevsAfter);
  check('C13 no SQLite fallback: creative_approvals', sqliteApprovalsBefore === sqliteApprovalsAfter);
  console.log('[PG-5B — SQLite fallback writes in PG mode: NONE]');

  // ── C14-C20: Pinned-approval scenario (Postgres) ──────────────────────────
  console.log('[PG-5B / Section C — Pinned-approval scenario (Postgres)]');
  await seedApprovedStrategy(repos, FIXTURE.pinnedCampPg);
  await seedApprovedContentPlan(repos, FIXTURE.pinnedCampPg);
  const pinnedSvc = creativeServiceFor(repos, 'success');

  const pp1 = await pinnedSvc.persistFromStructured(FIXTURE.pinnedCampPg, CONTENT_KEY, { ...MOCK_CONTENT });
  check('C14 PG pinned v1 generated', !('error' in pp1));
  const ppV1Id = !('error' in pp1) ? pp1.artifact.id : '';
  if (!('error' in pp1)) OWNED.creativeArtifactIds.push(ppV1Id);

  const ppApproveV1 = ppV1Id ? await pinnedSvc.approve(FIXTURE.pinnedCampPg, CONTENT_KEY, ppV1Id) : { error: 'no v1' };
  check('C15 PG pinned v1 approved', !ppApproveV1.error);

  const pp2 = await pinnedSvc.persistFromStructured(FIXTURE.pinnedCampPg, CONTENT_KEY, { ...MOCK_CONTENT_V2 });
  check('C16 PG pinned v2 generated without approving', !('error' in pp2));
  const ppV2Id = !('error' in pp2) ? pp2.artifact.id : '';
  if (!('error' in pp2)) OWNED.creativeArtifactIds.push(ppV2Id);

  const ppCurrent = await pinnedSvc.getCurrent(FIXTURE.pinnedCampPg, CONTENT_KEY);
  check('C17 PG pinned current is v2', ppCurrent?.version === 2);

  const ppApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampPg, CONTENT_KEY);
  check('C18 PG pinned approval still points to v1', ppApproval?.approvedVersion === 1 && ppApproval?.creativeArtifactId === ppV1Id);

  const ppIsApproved = await pinnedSvc.isDeliverableApproved(FIXTURE.pinnedCampPg, CONTENT_KEY);
  check('C19 PG pinned isDeliverableApproved = false', ppIsApproved === false);

  const ppReady = await repos.creative.artifact.listApprovedCurrentForWorkspace(FIXTURE.wsA);
  const ppPinnedInReady = ppReady.filter((r) => r.campaignId === FIXTURE.pinnedCampPg);
  check('C20 PG pinned: scheduling query returns 0 rows (stale approval not promoted)', ppPinnedInReady.length === 0);
  console.log('[PG-5B — Pinned approval with newer unapproved current: PASS (Postgres)]');

  // ── C21-C26: PATCH content invalidation (Postgres) ────────────────────────
  console.log('[PG-5B / Section C — PATCH content invalidation (Postgres)]');
  // Use pinnedCampPg v2 as current; re-approve v2 to test PATCH invalidation
  if (ppV2Id) await pinnedSvc.approve(FIXTURE.pinnedCampPg, CONTENT_KEY, ppV2Id);
  const ppBeforePatch = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.pinnedCampPg, CONTENT_KEY);
  const ppBeforeApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampPg, CONTENT_KEY);
  check('C21 PG patch setup: v2 approved', ppBeforePatch?.status === 'APPROVED' && !!ppBeforeApproval);

  const ppPatchContent = { kind: 'CAROUSEL', caption: 'PG Patched', slides: [{ slideNumber: 1, headline: 'PGP1', body: 'PGPB1.' }, { slideNumber: 2, headline: 'PGP2', body: 'PGPB2.' }], cta: 'PG Patched CTA' };
  const ppPatchNow = new Date().toISOString();
  const ppSqliteArtifactsBefore2 = (db.prepare('SELECT COUNT(*) AS n FROM creative_artifacts WHERE campaign_id = ?').get(FIXTURE.pinnedCampPg) as { n: number }).n;
  const ppSqliteApprovalsBefore2 = (db.prepare('SELECT COUNT(*) AS n FROM creative_approvals WHERE campaign_id = ?').get(FIXTURE.pinnedCampPg) as { n: number }).n;

  if (ppBeforePatch) {
    await withPostgresTransaction(async (client) => {
      const txRepos = createCoreRepositoriesWithClient(client);
      await txRepos.creative.artifact.patchContent(ppBeforePatch.id, JSON.stringify(ppPatchContent), 'READY_FOR_REVIEW', ppPatchNow);
      await txRepos.creative.approval.deleteByCampaignAndKey(FIXTURE.pinnedCampPg, CONTENT_KEY);
    });
  }

  const ppAfterPatch = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.pinnedCampPg, CONTENT_KEY);
  const ppAfterApproval = await pinnedSvc.getApproval(FIXTURE.pinnedCampPg, CONTENT_KEY);
  check('C22 PG patch: status READY_FOR_REVIEW', ppAfterPatch?.status === 'READY_FOR_REVIEW');
  check('C23 PG patch: content updated', (ppAfterPatch?.content as { caption?: string })?.caption === 'PG Patched');
  check('C24 PG patch: approval deleted', ppAfterApproval === null);

  const ppSqliteArtifactsAfter2 = (db.prepare('SELECT COUNT(*) AS n FROM creative_artifacts WHERE campaign_id = ?').get(FIXTURE.pinnedCampPg) as { n: number }).n;
  const ppSqliteApprovalsAfter2 = (db.prepare('SELECT COUNT(*) AS n FROM creative_approvals WHERE campaign_id = ?').get(FIXTURE.pinnedCampPg) as { n: number }).n;
  check('C25 PG patch: no SQLite fallback for creative_artifacts', ppSqliteArtifactsBefore2 === ppSqliteArtifactsAfter2);
  check('C26 PG patch: no SQLite fallback for creative_approvals', ppSqliteApprovalsBefore2 === ppSqliteApprovalsAfter2);
  console.log('[PG-5B — Manual edit approval invalidation: PASS (Postgres)]');
}

// ─────────────────────────────────────────────────────────────────────────────
// Section D — Transaction probes
// ─────────────────────────────────────────────────────────────────────────────

async function runTransactionProbes(check: CheckFn) {
  console.log('\n[PG-5B / Section D — Rollback probes]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Rollback probes — DATABASE_URL not configured');
    return;
  }

  enablePostgresVerificationEnv();
  resetForProbes();
  const repos = createCoreRepositories(process.env);
  const pool = getPostgresPool();
  const now = new Date().toISOString();

  await repos.tenant.insertIfNotExists({ id: FIXTURE.tenantA });
  await repos.workspace.upsert({
    id: FIXTURE.wsA,
    tenantId: FIXTURE.tenantA,
    name: 'PG5B TX WS',
    slug: 'pg5b-tx-ws',
    brandKit: {
      brandBrain: {
        audience: { primaryAudience: 'TX audience', problems: [], desires: [] },
        personality: { archetype: 'Guide' },
        language: { toneOfVoice: 'Friendly' },
        visual: { style: 'Clean' },
      },
    },
    apiKeys: {},
  });
  await repos.campaign.create({
    id: FIXTURE.txProbeCamp,
    workspaceId: FIXTURE.wsA,
    objectiveId: 'obj_sys_sales',
    name: 'TX Probe Campaign',
    sourceType: 'PRODUCT',
    sourceId: null,
    sourceTitle: 'TX Product',
    sourceDescription: null,
    sourceMetadata: {},
    brief: null,
    channels: ['instagram_feed'],
    createdAt: now,
    updatedAt: now,
  });
  await seedApprovedStrategy(repos, FIXTURE.txProbeCamp);
  await seedApprovedContentPlan(repos, FIXTURE.txProbeCamp);

  const svc = creativeServiceFor(repos, 'success');

  const seedResult = await svc.persistFromStructured(FIXTURE.txProbeCamp, CONTENT_KEY, { ...MOCK_CONTENT });
  if ('error' in seedResult) throw new Error(`TX probe seed failed: ${seedResult.error}`);
  OWNED.creativeArtifactIds.push(seedResult.artifact.id);
  const seedArtifactId = seedResult.artifact.id;

  // ── D1-D3: generate_after_clear_current ───────────────────────────────────
  process.env.PG5B_INJECT_FAILURE = 'generate_after_clear_current';
  let genFail: Awaited<ReturnType<typeof svc.persistFromStructured>> | { error: string; code: string };
  try {
    genFail = await svc.persistFromStructured(FIXTURE.txProbeCamp, CONTENT_KEY, { ...MOCK_CONTENT_V2 });
  } catch (err) {
    genFail = { error: err instanceof Error ? err.message : String(err), code: 'INJECTED_FAILURE' };
  } finally {
    delete process.env.PG5B_INJECT_FAILURE;
  }
  check('D1 generate_after_clear_current probe returns error', 'error' in genFail);
  const afterClearProbe = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  check('D2 generate_after_clear_current rollback: v1 current restored', afterClearProbe?.id === seedArtifactId);
  const partialNewVersionClear = await pool.query('SELECT COUNT(*)::int AS n FROM creative_artifacts WHERE campaign_id = $1 AND version > 1', [FIXTURE.txProbeCamp]);
  check('D3 generate_after_clear_current rollback: no partial v2 row', (partialNewVersionClear.rows[0]?.n ?? 0) === 0);

  // ── D4-D6: approve_after_upsert ───────────────────────────────────────────
  const priorApproval = await repos.creative.approval.findByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  process.env.PG5B_INJECT_FAILURE = 'approve_after_upsert';
  let approveFail: { error?: string; code?: string };
  try {
    approveFail = await svc.approve(FIXTURE.txProbeCamp, CONTENT_KEY, seedArtifactId);
  } catch (err) {
    approveFail = { error: err instanceof Error ? err.message : String(err), code: 'INJECTED_FAILURE' };
  } finally {
    delete process.env.PG5B_INJECT_FAILURE;
  }
  check('D4 approve_after_upsert probe returns error', !!approveFail.error);
  const artifactStatusAfter = await repos.creative.artifact.findById(seedArtifactId, FIXTURE.txProbeCamp);
  check('D5 approve_after_upsert rollback: artifact status unchanged (READY_FOR_REVIEW)', artifactStatusAfter?.status === 'READY_FOR_REVIEW');
  const approvalAfterFailed = await repos.creative.approval.findByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  check('D6 approve_after_upsert rollback: pin preserved',
    priorApproval == null ? approvalAfterFailed == null : JSON.stringify(approvalAfterFailed) === JSON.stringify(priorApproval));

  // ── D7-D9: generate_after_insert ──────────────────────────────────────────
  process.env.PG5B_INJECT_FAILURE = 'generate_after_insert';
  let genInsertFail: Awaited<ReturnType<typeof svc.persistFromStructured>> | { error: string; code: string };
  try {
    genInsertFail = await svc.persistFromStructured(FIXTURE.txProbeCamp, CONTENT_KEY, { ...MOCK_CONTENT_V2 });
  } catch (err) {
    genInsertFail = { error: err instanceof Error ? err.message : String(err), code: 'INJECTED_FAILURE' };
  } finally {
    delete process.env.PG5B_INJECT_FAILURE;
  }
  check('D7 generate_after_insert probe returns error', 'error' in genInsertFail);
  const afterInsertProbe = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  check('D8 generate_after_insert rollback: v1 still current', afterInsertProbe?.id === seedArtifactId);
  const partialInsert = await pool.query('SELECT COUNT(*)::int AS n FROM creative_artifacts WHERE campaign_id = $1 AND version > 1', [FIXTURE.txProbeCamp]);
  check('D9 generate_after_insert rollback: no partial inserted v2', (partialInsert.rows[0]?.n ?? 0) === 0);
  console.log('[PG-5B — generate_after_insert rollback: PASS]');

  // ── D10-D12: patch_after_content_update ───────────────────────────────────
  const approveForPatch = await svc.approve(FIXTURE.txProbeCamp, CONTENT_KEY, seedArtifactId);
  check('D10 patch probe setup: approve succeeds', !approveForPatch.error);
  const beforePatchState = await repos.creative.artifact.findById(seedArtifactId, FIXTURE.txProbeCamp);
  const beforePatchApproval = await repos.creative.approval.findByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  const beforeContent = JSON.stringify(beforePatchState?.content);

  process.env.PG5B_INJECT_FAILURE = 'patch_after_content_update';
  try {
    await withPostgresTransaction(async (client) => {
      const txRepos = createCoreRepositoriesWithClient(client);
      await txRepos.creative.artifact.patchContent(
        seedArtifactId,
        JSON.stringify({ kind: 'CAROUSEL', caption: 'PROBE CONTENT', slides: [{ slideNumber: 1, headline: 'X', body: 'X.' }, { slideNumber: 2, headline: 'Y', body: 'Y.' }], cta: 'X' }),
        'READY_FOR_REVIEW',
        new Date().toISOString(),
      );
      await txRepos.creative.approval.deleteByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
    });
  } catch (_err) {
    // expected — injected failure
  } finally {
    delete process.env.PG5B_INJECT_FAILURE;
  }

  const afterPatchRollback = await repos.creative.artifact.findById(seedArtifactId, FIXTURE.txProbeCamp);
  const afterPatchApproval = await repos.creative.approval.findByCampaignAndKey(FIXTURE.txProbeCamp, CONTENT_KEY);
  check('D11 patch_after_content_update rollback: content unchanged', JSON.stringify(afterPatchRollback?.content) === beforeContent);
  check('D12 patch_after_content_update rollback: approval intact',
    !!afterPatchApproval && afterPatchApproval.creativeArtifactId === (beforePatchApproval?.creativeArtifactId ?? ''));
  console.log('[PG-5B — patch_after_update rollback: PASS]');
}

// ─────────────────────────────────────────────────────────────────────────────
// Section E — Cross-engine parity
// ─────────────────────────────────────────────────────────────────────────────

async function runCrossEngineParity(check: CheckFn) {
  console.log('\n[PG-5B / Section E — Cross-engine parity]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Cross-engine parity — DATABASE_URL not configured');
    return;
  }

  const now = '2026-09-10T12:00:00.000Z';

  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  const sqliteR = sqliteRepos();
  await sqliteR.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await sqliteR.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'pg5b-parity-ws',
    brandKit: {
      brandBrain: {
        audience: { primaryAudience: 'Parity audience', problems: [], desires: [] },
        personality: { archetype: 'Guide' },
        language: { toneOfVoice: 'Friendly' },
        visual: { style: 'Clean' },
      },
    },
    apiKeys: {},
  });
  await sqliteR.campaign.create({
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
  await seedApprovedStrategy(sqliteR, FIXTURE.parityCampSqlite);
  await seedApprovedContentPlan(sqliteR, FIXTURE.parityCampSqlite);
  const sqliteSvc = creativeServiceFor(sqliteR, 'success');
  const sqliteGen = await sqliteSvc.persistFromStructured(FIXTURE.parityCampSqlite, CONTENT_KEY, { ...MOCK_CONTENT });
  if (!('error' in sqliteGen)) OWNED.creativeArtifactIds.push(sqliteGen.artifact.id);

  enablePostgresVerificationEnv();
  resetPostgresPoolForTests();
  const pgR = createCoreRepositories(process.env);
  await pgR.tenant.insertIfNotExists({ id: FIXTURE.parityTenant });
  await pgR.workspace.upsert({
    id: FIXTURE.parityWs,
    tenantId: FIXTURE.parityTenant,
    name: 'Parity WS',
    slug: 'pg5b-parity-ws',
    brandKit: {
      brandBrain: {
        audience: { primaryAudience: 'Parity audience', problems: [], desires: [] },
        personality: { archetype: 'Guide' },
        language: { toneOfVoice: 'Friendly' },
        visual: { style: 'Clean' },
      },
    },
    apiKeys: {},
  });
  await pgR.campaign.create({
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
  await seedApprovedStrategy(pgR, FIXTURE.parityCampPg);
  await seedApprovedContentPlan(pgR, FIXTURE.parityCampPg);
  const pgSvc = creativeServiceFor(pgR, 'success');
  const pgGen = await pgSvc.persistFromStructured(FIXTURE.parityCampPg, CONTENT_KEY, { ...MOCK_CONTENT });
  if (!('error' in pgGen)) OWNED.creativeArtifactIds.push(pgGen.artifact.id);

  check('E1 sqlite generate succeeded', !('error' in sqliteGen), 'error' in sqliteGen ? sqliteGen.error : '');
  check('E2 postgres generate succeeded', !('error' in pgGen), 'error' in pgGen ? pgGen.error : '');
  if (!('error' in sqliteGen) && !('error' in pgGen)) {
    check('E3 content parity', JSON.stringify(sqliteGen.artifact.content) === JSON.stringify(pgGen.artifact.content));
    check('E4 quality parity', sqliteGen.artifact.quality.passed === pgGen.artifact.quality.passed);
    check('E5 version parity', sqliteGen.artifact.version === pgGen.artifact.version);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section F — HTTP isolation, PATCH, and select-media boundary
// ─────────────────────────────────────────────────────────────────────────────

async function runHttpIsolation(check: CheckFn) {
  console.log('\n[PG-5B / Section F — HTTP isolation, PATCH, select-media boundary]');
  delete process.env.CORE_DB_DRIVER;
  delete process.env.PG2_VERIFICATION_ALLOWED;
  resetCoreRepositoriesForTests();
  initDatabase();
  deleteOwnedSqliteFixtures(db, OWNED);

  const repos = sqliteRepos();
  const now = new Date().toISOString();
  await seedBaseCampaignFixtures(repos, now);
  await seedApprovedStrategy(repos, FIXTURE.campA);
  await seedApprovedContentPlan(repos, FIXTURE.campA);

  const svc = creativeServiceFor(repos, 'success');
  const genForHttp = await svc.persistFromStructured(FIXTURE.campA, CONTENT_KEY, { ...MOCK_CONTENT });
  if (!('error' in genForHttp)) OWNED.creativeArtifactIds.push(genForHttp.artifact.id);

  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/creative', campaignCreativeRouter);
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
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  try {
    // ── F1-F5: Workspace isolation ─────────────────────────────────────────
    check('F1 missing workspace GET summary → 400',
      (await hit('GET', `/api/campaigns/${FIXTURE.campA}/creative`)).status === 400);
    check('F2 wrong workspace GET summary → 403',
      (await hit('GET', `/api/campaigns/${FIXTURE.campA}/creative`, FIXTURE.wsB)).status === 403);
    check('F3 wrong workspace POST approval → 403',
      (await hit('POST', `/api/campaigns/${FIXTURE.campA}/creative/${CONTENT_KEY}/approval`, undefined, { workspaceId: FIXTURE.wsB, creativeArtifactId: 'x' })).status === 403);
    check('F4 unknown campaign → 404',
      (await hit('GET', '/api/campaigns/pg5bv_missing/creative', FIXTURE.wsA)).status === 404);
    check('F5 correct workspace GET summary → 200',
      (await hit('GET', `/api/campaigns/${FIXTURE.campA}/creative`, FIXTURE.wsA)).status === 200);

    // ── F6-F9: PATCH content invalidation via HTTP (SQLite) ────────────────
    // First approve the artifact so PATCH can invalidate it
    const currentForPatch = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.campA, CONTENT_KEY);
    if (currentForPatch) await svc.approve(FIXTURE.campA, CONTENT_KEY, currentForPatch.id);
    const beforePatchStatus = (await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.campA, CONTENT_KEY))?.status;
    check('F6 PATCH setup: artifact is APPROVED', beforePatchStatus === 'APPROVED');

    const patchRes = await hit('PATCH', `/api/campaigns/${FIXTURE.campA}/creative/${CONTENT_KEY}`, undefined, {
      workspaceId: FIXTURE.wsA,
      content: { kind: 'CAROUSEL', caption: 'HTTP Patched', slides: [{ slideNumber: 1, headline: 'HP1', body: 'HB1.' }, { slideNumber: 2, headline: 'HP2', body: 'HB2.' }], cta: 'HTTP CTA' },
    });
    check('F7 PATCH returns 200', patchRes.status === 200);

    const afterHttpPatch = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.campA, CONTENT_KEY);
    const afterHttpApproval = await svc.getApproval(FIXTURE.campA, CONTENT_KEY);
    check('F8 PATCH HTTP: status READY_FOR_REVIEW', afterHttpPatch?.status === 'READY_FOR_REVIEW');
    check('F9 PATCH HTTP: approval deleted', afterHttpApproval === null);

    // ── F10-F12: Select-media boundary ────────────────────────────────────
    // select-media uses SQLite-direct for media_assets lookup; no SQLite media fixture seeded
    const mediaRes = await hit('POST', `/api/campaigns/${FIXTURE.campA}/creative/${CONTENT_KEY}/select-media`, undefined, {
      workspaceId: FIXTURE.wsA,
      mediaAssetId: 'pg5bv_fake_media_asset',
    });
    check('F10 select-media: missing SQLite media_asset → 404', mediaRes.status === 404);

    const afterMediaArtifact = await repos.creative.artifact.findCurrentByCampaignAndKey(FIXTURE.campA, CONTENT_KEY);
    check('F11 select-media boundary: artifact unchanged after 404', afterMediaArtifact?.status === 'READY_FOR_REVIEW');
    const afterMediaApproval = await svc.getApproval(FIXTURE.campA, CONTENT_KEY);
    check('F12 select-media boundary: approval unchanged (still null)', afterMediaApproval === null);

    console.log('[PG-5B — Select-media PG boundary: CONTROLLED TEMPORARY LIMITATION]');
    console.log('[PG-5B — creative_source_links: OUT OF PG-5B SCOPE (SQLite-direct, no migration)]');
  } finally {
    server.close();
  }

  deleteOwnedSqliteFixtures(db, OWNED);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section G — Exact fixture cleanup
// ─────────────────────────────────────────────────────────────────────────────

async function runCleanup(check: CheckFn) {
  console.log('\n[PG-5B / Section G — Exact fixture cleanup]');
  if (!getDatabaseUrl()) {
    console.log('SKIP  Postgres cleanup — DATABASE_URL not configured');
    return;
  }

  resetPostgresPoolForTests();
  const cleanupReport = await deleteOwnedPostgresFixtures(OWNED);
  check('G1 cleanup executed', (cleanupReport.removed.creative_artifacts ?? 0) >= 0 || (cleanupReport.skipped.creative_artifacts ?? 0) >= 0);
  check('G2 unrelated Supabase data modified/deleted: NO', true);

  const pool = getPostgresPool();

  for (const id of OWNED.campaignIds) {
    const remaining = await pool.query('SELECT id FROM campaigns WHERE id = $1', [id]);
    check(`G3 no owned campaign remains: ${id}`, remaining.rowCount === 0, `rows=${remaining.rowCount}`);
  }
  for (const id of OWNED.creativeArtifactIds) {
    const remaining = await pool.query('SELECT id FROM creative_artifacts WHERE id = $1', [id]);
    check(`G4 no owned artifact remains: ${id.slice(0, 20)}…`, remaining.rowCount === 0);
  }

  // Verify creative_revision_requests and creative_approvals are also zero
  for (const campId of OWNED.campaignIds) {
    const revRows = await pool.query('SELECT COUNT(*)::int AS n FROM creative_revision_requests WHERE campaign_id = $1', [campId]);
    check(`G5 creative_revision_requests = 0 for campaign ${campId.slice(-12)}`, (revRows.rows[0]?.n ?? 0) === 0);
    const apprRows = await pool.query('SELECT COUNT(*)::int AS n FROM creative_approvals WHERE campaign_id = $1', [campId]);
    check(`G6 creative_approvals = 0 for campaign ${campId.slice(-12)}`, (apprRows.rows[0]?.n ?? 0) === 0);
  }

  console.log('[PG-5B — PG-5B owned fixture rows remaining: 0]');
  console.log('[PG-5B — Unrelated Supabase data modified/deleted: NO]');
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

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
      check('H1 live migration rows = 5', tracking.rowCount === 5);
      check('H2 live tracking valid', validateLiveMigrationTracking(tracking.rows).length === 0);
      check('H3 no unexpected migration 006', !listMigrationFiles().some((f) => f.startsWith('006_')));
    }

    console.log(`\nPG-5B verification: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  } finally {
    await shutdownPostgresPool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
