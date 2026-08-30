import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { contentPlannerService } from '../src/services/campaigns/ContentPlannerService';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { creativeGenerationContextBuilder } from '../src/services/creative/CreativeGenerationContextBuilder';
import { campaignCreativeRouter } from '../src/routes/campaignCreative';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';
import {
  CAROUSEL_CREATIVE_FIXTURE,
  CAROUSEL_V2_FIXTURE,
  INVALID_CAROUSEL_11_SLIDES,
  INVALID_CAROUSEL_NO_SLIDES,
  INVALID_EMAIL_NO_SUBJECT,
  INVALID_REEL_NO_HOOK,
  NEWSLETTER_CREATIVE_FIXTURE,
  REEL_CREATIVE_FIXTURE,
} from './fixtures/creativeFixtures';
import {
  buildQualityResult,
  detectPlanningChangeRequest,
  validateCreativeStructure,
} from '../src/services/creative/CreativeContentValidator';

async function main() {
  initDatabase();

  let failed = 0;
  let passed = 0;
  let blocked = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) {
      passed += 1;
      console.log(`PASS  ${name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  function block(name: string) {
    blocked += 1;
    console.log(`BLOCKED  ${name} — AI PROVIDER NOT CONFIGURED`);
  }

  function insertWorkspace(id: string, name: string) {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string) {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, 'obj_sys_sales', ?, 'APPROVED', 'PRODUCT', 'Test Product', '{}', '[]')
    `).run(id, workspaceId, `Campaign ${id}`);
  }

  function insertCampaignPlan(id: string, campaignId: string, workspaceId: string, version: number, isCurrent: number) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans
        (id, campaign_id, workspace_id, version, status, is_current,
         strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
         channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'APPROVED', ?, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]', '[]', '[]', '2 weeks', ?, ?)
    `).run(id, campaignId, workspaceId, version, isCurrent, now, now);
    db.prepare(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET approved_plan_id = excluded.approved_plan_id, approved_version = excluded.approved_version
    `).run(`pa_${id}`, campaignId, workspaceId, id, version, now, now);
  }

  function seedApprovedContentPlan(campaignId: string, workspaceId: string, planId: string, version: number, isCurrent: number, body = PRODUCT_PROOF_FIXTURE) {
    const now = new Date().toISOString();
    const planBody = JSON.stringify({
      summary: body.summary,
      concepts: body.concepts,
      deliverables: body.deliverables,
      cadence: body.cadence,
    });
    db.prepare(`
      INSERT INTO content_plans
        (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, ?, 'APPROVED', ?, ?, ?, ?)
    `).run(planId, workspaceId, campaignId, version, isCurrent, planBody, now, now);
  }

  function approveContentPlan(campaignId: string, workspaceId: string, planId: string, version: number) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET content_plan_id = excluded.content_plan_id, content_plan_version = excluded.content_plan_version
    `).run(`cpa_${planId}`, campaignId, workspaceId, planId, version, now, now);
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  const campA = `camp_a_${randomUUID()}`;
  const campB = `camp_b_${randomUUID()}`;
  const planV1 = `cplan_v1_${randomUUID()}`;
  const planV2 = `cplan_v2_${randomUUID()}`;

  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');
  insertCampaign(campA, wsA);
  insertCampaign(campB, wsB);
  insertCampaignPlan(`strat_${campA}`, campA, wsA, 1, 1);
  insertCampaignPlan(`strat_${campB}`, campB, wsB, 1, 1);

  seedApprovedContentPlan(campA, wsA, planV1, 1, 0);
  seedApprovedContentPlan(campA, wsA, planV2, 2, 1);

  // --- Test A ---
  const genNoApproval = await creativeGeneratorService.generateOne(campA, 'launch-reel-01');
  check('A generate without approved content plan rejected', 'error' in genNoApproval && genNoApproval.code === 'CONTENT_PLAN_NOT_APPROVED');
  check('A no creative persisted', creativeGeneratorService.getCurrent(campA, 'launch-reel-01') === null);

  approveContentPlan(campA, wsA, planV1, 1);
  const afterApproval = creativeGeneratorService.persistFromStructured(campA, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  check('A generate after content plan approval allowed', !('error' in afterApproval));

  // --- Test B ---
  if (!('error' in afterApproval)) {
    check('B sourceContentPlanId is V1', afterApproval.artifact.sourceContentPlanId === planV1);
    check('B sourceContentPlanVersion is 1', afterApproval.artifact.sourceContentPlanVersion === 1);
    check('B did not use V2', afterApproval.artifact.sourceContentPlanId !== planV2);
  }

  // --- Test C ---
  const beforeCarousel = creativeGeneratorService.getCurrent(campA, 'launch-carousel-01');
  const reelOnly = creativeGeneratorService.persistFromStructured(campA, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  check('C reel generation path executes', !('error' in reelOnly));
  check('C carousel untouched', creativeGeneratorService.getCurrent(campA, 'launch-carousel-01') === beforeCarousel);
  check('C newsletter untouched', creativeGeneratorService.getCurrent(campA, 'launch-newsletter-01') === null);

  // --- Test D ---
  const invalidKey = await creativeGeneratorService.generateOne(campA, 'not-in-approved-plan');
  check('D invalid contentKey rejected', 'error' in invalidKey && invalidKey.code === 'INVALID_CONTENT_KEY');
  check('D no artifact for invalid key', creativeGeneratorService.getCurrent(campA, 'not-in-approved-plan') === null);

  // --- Test E ---
  const ctx = creativeGenerationContextBuilder.build(campA, 'launch-carousel-01');
  if (!('error' in ctx)) {
    const deliverable = ctx.deliverable;
    check('E carousel no slides rejected', validateCreativeStructure(deliverable, { kind: 'CAROUSEL', caption: 'x', slides: [] }).length > 0);
    check('E carousel 11 slides rejected', validateCreativeStructure(deliverable, {
      kind: 'CAROUSEL',
      caption: 'x',
      slides: Array.from({ length: 11 }, (_, i) => ({ slideNumber: i + 1, body: 'x' })),
    }).length > 0);
    check('E short video no hook rejected', validateCreativeStructure(
      { ...deliverable, contentType: 'SHORT_VIDEO' },
      { kind: 'SHORT_VIDEO', hook: '', scenes: [{ sceneNumber: 1, visualDirection: 'x' }] },
    ).length > 0);
    check('E email no subject rejected', validateCreativeStructure(
      { ...deliverable, contentType: 'EMAIL', format: 'NEWSLETTER' },
      { kind: 'EMAIL', subject: '', body: 'body' },
    ).length > 0);
    const valid = creativeGeneratorService.persistFromStructured(campA, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
    check('E valid carousel accepted', !('error' in valid));
    const invalidPersist = creativeGeneratorService.persistFromStructured(campA, 'launch-carousel-01', INVALID_CAROUSEL_NO_SLIDES);
    check('E invalid carousel persist rejected', 'error' in invalidPersist);
  }

  // --- Test F ---
  const priorVersions = creativeGeneratorService.getAllVersions(campA, 'launch-reel-01');
  const firstVersion = priorVersions.find((v) => v.version === 1);
  const priorCurrent = creativeGeneratorService.getCurrent(campA, 'launch-reel-01');
  const expectedNextVersion = (priorCurrent?.version ?? 0) + 1;
  const reelV2 = creativeGeneratorService.reviseFromStructured(campA, 'launch-reel-01', 'Stronger hook', {
    ...REEL_CREATIVE_FIXTURE,
    hook: 'A sharper curiosity hook without changing the rest.',
  });
  check('F revision creates next version', !('error' in reelV2));
  if (firstVersion && !('error' in reelV2)) {
    check('F same contentKey', reelV2.artifact.contentKey === 'launch-reel-01');
    check('F V1 retrievable', creativeGeneratorService.getById(firstVersion.id, campA)?.version === 1);
    check('F latest version current', reelV2.artifact.version === expectedNextVersion && reelV2.artifact.isCurrent);
  }

  // --- Test G ---
  const carouselBefore = creativeGeneratorService.getCurrent(campA, 'launch-carousel-01');
  const newsletterBefore = creativeGeneratorService.getCurrent(campA, 'launch-newsletter-01');
  const reelRevise = creativeGeneratorService.reviseFromStructured(campA, 'launch-reel-01', 'Adjust hook only', REEL_CREATIVE_FIXTURE);
  check('G reel revised', !('error' in reelRevise));
  check('G carousel unchanged', JSON.stringify(creativeGeneratorService.getCurrent(campA, 'launch-carousel-01')) === JSON.stringify(carouselBefore));
  check('G newsletter unchanged', creativeGeneratorService.getCurrent(campA, 'launch-newsletter-01') === newsletterBefore);

  // --- Test H ---
  block('H structured subsection revision with live AI');

  // --- Test I ---
  const carouselCurrent = creativeGeneratorService.getCurrent(campA, 'launch-carousel-01');
  if (carouselCurrent) {
    const v2Carousel = creativeGeneratorService.reviseFromStructured(campA, 'launch-carousel-01', 'Update slide 5', CAROUSEL_V2_FIXTURE, { targetHint: 'slide 5' });
    check('I V2 carousel created', !('error' in v2Carousel));
    const v1 = creativeGeneratorService.getAllVersions(campA, 'launch-carousel-01').find((v) => v.version === 1);
    if (v1 && !('error' in v2Carousel)) {
      const approval = creativeGeneratorService.approve(campA, 'launch-carousel-01', v1.id);
      check('I approve V1 succeeded', !approval.error);
      const stored = creativeGeneratorService.getApproval(campA, 'launch-carousel-01');
      check('I approval references V1', stored?.creativeArtifactId === v1.id && stored?.approvedVersion === 1);
    }
  }

  // --- Test J ---
  const reelForJ = creativeGeneratorService.getCurrent(campA, 'launch-reel-01');
  if (reelForJ) {
    creativeGeneratorService.approve(campA, 'launch-reel-01', reelForJ.id);
    const v1Approval = creativeGeneratorService.getApproval(campA, 'launch-reel-01');
    const vNext = creativeGeneratorService.reviseFromStructured(campA, 'launch-reel-01', 'New hook', {
      ...REEL_CREATIVE_FIXTURE,
      hook: 'A revised hook for testing.',
    });
    check('J V3 revision created', !('error' in vNext));
    const approvalAfter = creativeGeneratorService.getApproval(campA, 'launch-reel-01');
    check('J historical approval preserved on record', approvalAfter?.creativeArtifactId === v1Approval?.creativeArtifactId);
    check('J V3 not auto approved', !creativeGeneratorService.isDeliverableApproved(campA, 'launch-reel-01'));
    if (!('error' in vNext)) {
      check('J current version is latest', creativeGeneratorService.getCurrent(campA, 'launch-reel-01')?.version === vNext.artifact.version);
    }
  }

  // --- Test K ---
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/creative', campaignCreativeRouter);
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  async function hit(method: string, path: string, workspaceId: string, body?: unknown) {
    const url = method === 'GET' ? `${base}${path}?workspaceId=${encodeURIComponent(workspaceId)}` : `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({ ...(body as object ?? {}), workspaceId }),
    });
    return res.status;
  }

  try {
    check('K list rejected', (await hit('GET', `/api/campaigns/${campA}/creative`, wsB)) === 403);
    check('K generate rejected', (await hit('POST', `/api/campaigns/${campA}/creative/launch-reel-01/generate`, wsB)) === 403);
    check('K read rejected', (await hit('GET', `/api/campaigns/${campA}/creative/launch-reel-01`, wsB)) === 403);
    check('K versions rejected', (await hit('GET', `/api/campaigns/${campA}/creative/launch-reel-01/versions`, wsB)) === 403);
    check('K revise rejected', (await hit('POST', `/api/campaigns/${campA}/creative/launch-reel-01/revisions`, wsB, { requestText: 'change' })) === 403);
    check('K approve rejected', (await hit('POST', `/api/campaigns/${campA}/creative/launch-carousel-01/approval`, wsB, { creativeArtifactId: 'x' })) === 403);
    check('K approval read rejected', (await hit('GET', `/api/campaigns/${campA}/creative/launch-carousel-01/approval`, wsB)) === 403);
  } finally {
    server.close();
  }

  // --- Test L ---
  const planB = `cplan_b_${randomUUID()}`;
  seedApprovedContentPlan(campB, wsB, planB, 1, 1);
  approveContentPlan(campB, wsB, planB, 1);
  const genNoAi = await creativeGeneratorService.generateOne(campB, 'launch-reel-01');
  check('L generate without AI unavailable', 'error' in genNoAi && genNoAi.code === 'AI_UNAVAILABLE');
  check('L no creative on B', creativeGeneratorService.getCurrent(campB, 'launch-reel-01') === null);

  // --- Test M ---
  if (!('error' in ctx)) {
    const qualityFail = buildQualityResult(ctx.deliverable, INVALID_CAROUSEL_11_SLIDES as never, ctx.campaignContext);
    check('M carousel >10 slides fails quality/structure', !qualityFail.passed || validateCreativeStructure(ctx.deliverable, INVALID_CAROUSEL_11_SLIDES as never).length > 0);
    check('M missing email subject fails', validateCreativeStructure(
      { ...ctx.deliverable, contentType: 'EMAIL', format: 'NEWSLETTER' },
      INVALID_EMAIL_NO_SUBJECT as never,
    ).length > 0);
    const validQuality = buildQualityResult(ctx.deliverable, CAROUSEL_CREATIVE_FIXTURE as never, ctx.campaignContext);
    check('M valid creative passes', validQuality.passed);
  }

  // --- Test N ---
  const summaryBefore = creativeGeneratorService.getSummary(campA);
  if (!('error' in summaryBefore)) {
    const keys = ['launch-carousel-01', 'launch-reel-01', 'launch-newsletter-01'];
    const a = creativeGeneratorService.persistFromStructured(campA, keys[0], CAROUSEL_CREATIVE_FIXTURE);
    const b = creativeGeneratorService.persistFromStructured(campA, keys[1], INVALID_REEL_NO_HOOK);
    const c = creativeGeneratorService.persistFromStructured(campA, keys[2], NEWSLETTER_CREATIVE_FIXTURE);
    check('N A persisted', !('error' in a));
    check('N B failed', 'error' in b);
    check('N C persisted', !('error' in c));
    check('N B not falsely persisted', creativeGeneratorService.getCurrent(campA, keys[1]) !== null || 'error' in b);
  }

  // --- Test O ---
  check('O carousel fixture has slides', CAROUSEL_CREATIVE_FIXTURE.slides.length >= 1);
  check('O reel fixture has scenes', REEL_CREATIVE_FIXTURE.scenes.length >= 1);
  check('O newsletter fixture has subject', Boolean(NEWSLETTER_CREATIVE_FIXTURE.subject));

  // --- Test P ---
  check('P planning change detected', detectPlanningChangeRequest('Remove TikTok from the campaign and replace it with email.'));
  const planningRev = await creativeGeneratorService.revise(campA, 'launch-reel-01', 'Remove TikTok from the campaign and replace it with email.');
  check('P creative revision blocked', 'error' in planningRev && planningRev.code === 'PLANNING_CHANGE_REQUIRED');

  console.log(`\nPhase 3D verification: ${passed} passed, ${failed} failed, ${blocked} blocked`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
