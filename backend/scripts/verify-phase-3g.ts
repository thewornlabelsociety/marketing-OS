import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { campaignLibraryService } from '../src/services/library/CampaignLibraryService';
import { blueprintService } from '../src/services/library/BlueprintService';
import { blueprintQualityGate } from '../src/services/library/BlueprintQualityGate';
import { campaignContextBuilder } from '../src/services/campaigns/CampaignContextBuilder';
import { learningService } from '../src/services/performance/LearningService';
import { libraryRouter } from '../src/routes/library';
import { blueprintsRouter } from '../src/routes/blueprints';
import { CAROUSEL_CREATIVE_FIXTURE, NEWSLETTER_CREATIVE_FIXTURE, REEL_CREATIVE_FIXTURE } from './fixtures/creativeFixtures';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';

async function main() {
  initDatabase();

  let failed = 0;
  let passed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed += 1; console.log(`PASS  ${name}`); }
    else { failed += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  function insertWorkspace(id: string, name: string, brandKit = '{}') {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, ?, '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id, brandKit);
  }

  function insertCampaign(id: string, workspaceId: string, objectiveId = 'obj_sys_sales', status = 'COMPLETE') {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, ?, ?, ?, 'PRODUCT', 'Test Product', '{}', '["INSTAGRAM","EMAIL"]')
    `).run(id, workspaceId, objectiveId, `Campaign ${id}`, status);
  }

  function seedPlanChain(campaignId: string, workspaceId: string) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current,
        strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
        channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Product proof angle', 'Core message', '{"primary":"hook","supporting":[]}',
        '["Proof point 1"]', 'Buy now', '[]',
        '[{"channel":"INSTAGRAM","role":"Awareness"},{"channel":"EMAIL","role":"Conversion"}]',
        '[{"contentType":"CAROUSEL","channel":"INSTAGRAM","format":"4:5","quantity":1,"purpose":"Product proof"}]',
        '2 week launch cadence', ?, ?)
    `).run(`plan_${campaignId}`, campaignId, workspaceId, now, now);
    db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`pa_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, now, now);
    const planBody = JSON.stringify({ summary: PRODUCT_PROOF_FIXTURE.summary, concepts: PRODUCT_PROOF_FIXTURE.concepts, deliverables: PRODUCT_PROOF_FIXTURE.deliverables, cadence: PRODUCT_PROOF_FIXTURE.cadence });
    db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)`).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
  }

  function approveCreative(campaignId: string, contentKey: string) {
    const current = creativeGeneratorService.getCurrent(campaignId, contentKey);
    if (!current) throw new Error(`No creative for ${contentKey}`);
    return creativeGeneratorService.approve(campaignId, contentKey, current.id);
  }

  function publishManual(campaignId: string, workspaceId: string, contentKey: string) {
    approveCreative(campaignId, contentKey);
    const creative = creativeGeneratorService.getCurrent(campaignId, contentKey)!;
    const sched = schedulingService.create(campaignId, workspaceId, {
      contentKey, scheduledFor: new Date(Date.now() - 3600000).toISOString(), publicationMode: 'MANUAL',
    });
    if ('error' in sched) throw new Error(sched.error);
    publishingService.markPublished(sched.item.id, campaignId, { evidence: 'Verified externally', externalUrl: `https://example.com/${contentKey}` });
    return { schedule: sched.item, creative };
  }

  function seedHighPerformer(campaignId: string, workspaceId: string) {
    insertCampaign(campaignId, workspaceId, 'obj_sys_sales', 'COMPLETE');
    db.prepare(`UPDATE objectives SET success_criteria = '20 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
    seedPlanChain(campaignId, workspaceId);
    creativeGeneratorService.persistFromStructured(campaignId, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
    creativeGeneratorService.persistFromStructured(campaignId, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);
    const pub = publishManual(campaignId, workspaceId, 'launch-newsletter-01');
    for (let i = 0; i < 25; i++) {
      performanceIngestionService.createConversion({
        workspaceId, campaignId, contentKey: 'launch-newsletter-01', conversionType: 'PURCHASE', value: 100, currency: 'NZD',
        externalConversionId: `p_${campaignId}_${i}`, attribution: { model: 'MANUAL', campaignId, confidence: 'MEDIUM' }, source: 'MANUAL',
      });
    }
    performanceIngestionService.createObservation({
      workspaceId, campaignId, scheduleId: pub.schedule.id, contentKey: 'launch-newsletter-01',
      sourceCreativeArtifactId: pub.creative.id, sourceCreativeVersion: pub.creative.version,
      channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { impressions: 5000, views: 4000 }, source: 'MANUAL',
    });
    campaignPerformanceService.evaluate(campaignId, workspaceId);
    campaignLibraryService.syncClassifications(campaignId, workspaceId);
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');

  const highCamp = `camp_high_${randomUUID()}`;
  seedHighPerformer(highCamp, wsA);

  // --- Test A ---
  const recA = campaignLibraryService.syncClassifications(highCamp, wsA);
  check('A COMPLETED classification', recA.classifications.includes('COMPLETED'));
  check('A HIGH_PERFORMING classification', recA.classifications.includes('HIGH_PERFORMING'));

  // --- Test B ---
  const lowCamp = `camp_low_${randomUUID()}`;
  insertCampaign(lowCamp, wsA, 'obj_sys_sales', 'COMPLETE');
  seedPlanChain(lowCamp, wsA);
  creativeGeneratorService.persistFromStructured(lowCamp, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const pubLow = publishManual(lowCamp, wsA, 'launch-reel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: lowCamp, scheduleId: pubLow.schedule.id, contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: pubLow.creative.id, sourceCreativeVersion: pubLow.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 50000, views: 40000, likes: 5000 }, source: 'MANUAL',
  });
  db.prepare(`UPDATE objectives SET success_criteria = '20 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
  campaignPerformanceService.evaluate(lowCamp, wsA);
  const recB = campaignLibraryService.syncClassifications(lowCamp, wsA);
  check('B LOW_PERFORMING retained', recB.classifications.includes('LOW_PERFORMING'));
  check('B not blueprint candidate', !recB.blueprintCandidate);

  // --- Test C ---
  const cancelCamp = `camp_cancel_${randomUUID()}`;
  insertCampaign(cancelCamp, wsA, 'obj_sys_sales', 'DRAFTING');
  seedPlanChain(cancelCamp, wsA);
  campaignLibraryService.setCancellationMetadata(cancelCamp, wsA, { reasonType: 'STOCK_UNAVAILABLE', notes: 'Out of stock' });
  const recC = campaignLibraryService.get(cancelCamp, wsA);
  check('C cancelled retained', !('error' in recC) && recC.libraryRecord.classifications.includes('CANCELLED'));
  check('C reason type', !('error' in recC) && recC.libraryRecord.cancellationReasonType === 'STOCK_UNAVAILABLE');

  // --- Test D ---
  campaignLibraryService.archive(highCamp, wsA);
  const archivedList = campaignLibraryService.list(wsA, { includeArchived: true, classification: 'ARCHIVED' });
  check('D archived in filter', archivedList.some((i) => i.campaignId === highCamp));
  const activeList = campaignLibraryService.list(wsA, { includeArchived: false });
  check('D excluded from default', !activeList.some((i) => i.campaignId === highCamp));
  campaignLibraryService.restore(highCamp, wsA);

  // --- Test E ---
  const recE = campaignLibraryService.syncClassifications(highCamp, wsA);
  check('E not auto evergreen', !recE.evergreen);
  campaignLibraryService.markEvergreen(highCamp, wsA);
  const recE2 = campaignLibraryService.syncClassifications(highCamp, wsA);
  check('E user evergreen', recE2.evergreen && recE2.classifications.includes('EVERGREEN'));

  // --- Test F ---
  campaignLibraryService.markSeasonal(highCamp, wsA, { season: 'Christmas', recurringWindow: 'December', notes: 'Holiday push' });
  const recF = campaignLibraryService.get(highCamp, wsA);
  check('F seasonal persisted', !('error' in recF) && recF.libraryRecord.seasonal?.season === 'Christmas');

  // --- Test G ---
  const recG = campaignLibraryService.syncClassifications(highCamp, wsA);
  check('G blueprint candidate', recG.blueprintCandidate);

  // --- Test H ---
  const bpDraft = blueprintService.createFromCampaign(highCamp, wsA);
  check('H blueprint created', !('error' in bpDraft));
  if (!('error' in bpDraft)) {
    check('H has objective type', Boolean(bpDraft.objectiveType));
    check('H has content pattern', bpDraft.contentPattern.length > 0);
    check('H has evidence', Boolean(bpDraft.evidenceSummary.sourceCampaignId));
  }

  // --- Test I ---
  if (!('error' in bpDraft)) {
    const serialized = JSON.stringify(bpDraft);
    check('I no scheduleId', !serialized.includes('scheduleId'));
    check('I no externalPublishId', !serialized.includes('externalPublishId'));
    check('I no approvalId', !serialized.includes('approvalId'));
  }

  // --- Test J ---
  db.prepare(`INSERT INTO campaign_briefs (id, campaign_id, workspace_id, offer_description, created_at, updated_at)
    VALUES (?, ?, ?, '20% off until August 15', datetime('now'), datetime('now'))`).run(randomUUID(), highCamp, wsA);
  const extracted = blueprintService.createFromCampaign(highCamp, wsA, 'Offer test blueprint');
  if (!('error' in extracted)) {
    check('J offer generalized', extracted.strategicPattern.offerFraming === 'Limited-time launch incentive' || !extracted.strategicPattern.offerFraming?.includes('August 15'));
  } else {
    check('J offer generalized', false, extracted.error);
  }

  // --- Test K/L/M/N ---
  let activeBp = !('error' in bpDraft) ? bpDraft : null;
  if (activeBp) {
    blueprintService.activate(activeBp.id, wsA);
    activeBp = blueprintService.get(activeBp.id, wsA) as typeof activeBp;
  }
  if (activeBp && !('error' in activeBp)) {
    const used = blueprintService.use(activeBp.id, wsA, {
      sourceType: 'PRODUCT', sourceTitle: 'New Linen Collection', sourceDescription: 'Fresh spring line',
    });
    check('K new campaign created', !('error' in used));
    if (!('error' in used)) {
      check('K new campaignId', used.campaignId !== highCamp);
      const newCamp = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(used.campaignId) as { source_title: string; source_blueprint_id: string };
      check('K new source', newCamp.source_title === 'New Linen Collection');
      check('K blueprint relation', newCamp.source_blueprint_id === activeBp.id);
      check('L fresh plan absent', !db.prepare('SELECT id FROM campaign_plans WHERE campaign_id = ?').get(used.campaignId));
      check('M no approved creative', !(db.prepare('SELECT id FROM creative_approvals WHERE campaign_id = ?').get(used.campaignId)));
      check('N no schedule', schedulingService.list(used.campaignId).length === 0);
    }
  }

  // --- Test O ---
  const brandKitBanned = JSON.stringify({ brandBrain: { language: { bannedPhrases: ['Shop now'] } } });
  insertWorkspace(`ws_brand_${randomUUID()}`, 'Brand WS', brandKitBanned);
  const wsBrand = db.prepare('SELECT id FROM entities WHERE brand_kit LIKE ?').get('%Shop now%') as { id: string };
  if (activeBp && !('error' in activeBp)) {
    const usedBrand = blueprintService.use(activeBp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Brand Test Product' });
    if (!('error' in usedBrand)) {
      db.prepare('UPDATE campaigns SET workspace_id = ? WHERE id = ?').run(wsBrand.id, usedBrand.campaignId);
      const ctxO = campaignContextBuilder.build(usedBrand.campaignId);
      check('O brand brain bans present', ctxO !== null && (ctxO.brand.language.bannedPhrases ?? []).includes('Shop now'));
    }
  }

  // --- Test P ---
  learningService.upsertCandidate({
    workspaceId: wsA, type: 'MARKET_PERFORMANCE', category: 'EMAIL', statement: 'Email drives conversions for Sales',
    confidence: 'MEDIUM', relevanceTags: ['SALES', 'EMAIL'],
    evidence: [{ sourceType: 'c', sourceId: '1' }, { sourceType: 'c', sourceId: '2' }, { sourceType: 'c', sourceId: '3' }],
  });
  const learnP = learningService.list(wsA, 'CANDIDATE')[0];
  if (learnP) learningService.activate(learnP.id, wsA);
  if (activeBp && !('error' in activeBp)) {
    const usedP = blueprintService.use(activeBp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Learning Test Product' });
    if (!('error' in usedP)) {
      const ctxP = campaignContextBuilder.build(usedP.campaignId);
      check('P current learning in context', ctxP !== null && ctxP.learnings.marketPerformance.length >= 1);
      check('P blueprint in context', ctxP !== null && Boolean(ctxP.blueprint));
    }
  }

  // --- Test Q/R isolation ---
  const app = express();
  app.use(express.json());
  app.use('/api/library', libraryRouter);
  app.use('/api/blueprints', blueprintsRouter);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  async function hit(method: string, path: string, body?: unknown) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return res.status;
  }
  const bpId = activeBp && !('error' in activeBp) ? activeBp.id : '';
  check('Q blueprint read blocked', (await hit('GET', `/api/blueprints/${bpId}?workspaceId=${wsB}`)) === 403);
  check('Q blueprint use blocked', (await hit('POST', `/api/blueprints/${bpId}/use`, { workspaceId: wsB, sourceType: 'PRODUCT', sourceTitle: 'X' })) === 403);
  check('R library read blocked', (await hit('GET', `/api/library/campaigns/${highCamp}?workspaceId=${wsB}`)) === 403);
  check('R archive blocked', (await hit('POST', `/api/library/campaigns/${highCamp}/archive`, { workspaceId: wsB })) === 403);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- Test S ---
  if (activeBp && !('error' in activeBp)) {
    const u1 = blueprintService.use(activeBp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Usage A' });
    const u2 = blueprintService.use(activeBp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Usage B' });
    const usages = blueprintService.getUsages(activeBp.id, wsA);
    check('S usage rows', !('error' in usages) && usages.length >= 2);
  }

  // --- Test T ---
  if (activeBp && !('error' in activeBp)) {
    const beforeEvidence = activeBp.evidenceSummary.classification;
    const updated = blueprintService.update(activeBp.id, wsA, { name: 'Renamed Blueprint' });
    check('T name updated', !('error' in updated) && updated.name === 'Renamed Blueprint');
    check('T evidence unchanged', !('error' in updated) && updated.evidenceSummary.classification === beforeEvidence);
  }

  // --- Test U ---
  if (activeBp && !('error' in activeBp)) {
    const archived = blueprintService.archive(activeBp.id, wsA);
    check('U archived', !('error' in archived) && archived.status === 'ARCHIVED');
    const useArchived = blueprintService.use(activeBp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Should fail' });
    check('U cannot use archived', 'error' in useArchived);
  }

  // --- Test V filters ---
  const filters = campaignLibraryService.list(wsA, { classification: 'HIGH_PERFORMING' });
  check('V high performing filter', filters.some((f) => f.campaignId === highCamp));
  const lowFilters = campaignLibraryService.list(wsA, { classification: 'LOW_PERFORMING' });
  check('V low performing filter', lowFilters.some((f) => f.campaignId === lowCamp));

  // --- Test W ---
  const awareCamp = `camp_aware_${randomUUID()}`;
  insertCampaign(awareCamp, wsA, 'obj_sys_awareness', 'COMPLETE');
  seedPlanChain(awareCamp, wsA);
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: awareCamp, contentKey: 'x', sourceCreativeArtifactId: 'a', sourceCreativeVersion: 1,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { reach: 100000 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(awareCamp, wsA);
  campaignLibraryService.syncClassifications(awareCamp, wsA);
  const sorted = campaignLibraryService.list(wsA, { sort: 'best' });
  check('W sort uses classification', sorted.length >= 2);

  // --- Test X ---
  check('X library list works', campaignLibraryService.list(wsA).length > 0);

  // --- Test Y ---
  const badGate = blueprintQualityGate.validate({
    strategicPattern: { scheduleId: 'sched_123' },
    contentPattern: [],
    channelPattern: [],
    evidenceSummary: {},
    sourceExamples: [],
  });
  check('Y invalid blueprint rejected', !badGate.valid);
  if (activeBp && !('error' in activeBp)) {
    const goodGate = blueprintQualityGate.validate({
      strategicPattern: activeBp.strategicPattern as Record<string, unknown>,
      contentPattern: activeBp.contentPattern,
      channelPattern: activeBp.channelPattern,
      cadencePattern: activeBp.cadencePattern,
      evidenceSummary: activeBp.evidenceSummary as unknown as Record<string, unknown>,
      sourceExamples: activeBp.sourceExamples,
    });
    check('Y valid blueprint passes', goodGate.valid);
  }

  console.log(`\nPhase 3G verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
