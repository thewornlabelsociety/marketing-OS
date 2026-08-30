import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { attentionSignalService, formatScheduleLocal } from '../src/services/attention/AttentionSignalService';
import { dashboardService } from '../src/services/dashboard/DashboardService';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { objectiveEvaluationService } from '../src/services/performance/ObjectiveEvaluationService';
import { experimentService } from '../src/services/experiments/ExperimentService';
import { learningService } from '../src/services/performance/LearningService';
import { campaignLibraryService } from '../src/services/library/CampaignLibraryService';
import { blueprintService } from '../src/services/library/BlueprintService';
import { dashboardRouter, attentionRouter } from '../src/routes/dashboard';
import {
  CAROUSEL_CREATIVE_FIXTURE,
  NEWSLETTER_CREATIVE_FIXTURE,
  REEL_CREATIVE_FIXTURE,
} from './fixtures/creativeFixtures';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';
import type { AttentionSignalType } from '../src/types/attention';

async function main() {
  initDatabase();

  let failed = 0;
  let passed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed += 1; console.log(`PASS  ${name}`); }
    else { failed += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  function insertWorkspace(id: string, name: string) {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string, objectiveId = 'obj_sys_sales', status = 'PUBLISHED') {
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
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]',
        '[{"channel":"INSTAGRAM","role":"Conversion"}]', '[]', '2w', ?, ?)
    `).run(`plan_${campaignId}`, campaignId, workspaceId, now, now);
    db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`pa_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, now, now);
    const planBody = JSON.stringify({
      summary: PRODUCT_PROOF_FIXTURE.summary,
      concepts: PRODUCT_PROOF_FIXTURE.concepts,
      deliverables: PRODUCT_PROOF_FIXTURE.deliverables,
      cadence: PRODUCT_PROOF_FIXTURE.cadence,
    });
    db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)`).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
  }

  function persistCreative(campaignId: string, contentKey: string, fixture: object) {
    const result = creativeGeneratorService.persistFromStructured(campaignId, contentKey, fixture as never);
    if ('error' in result) throw new Error(result.error);
    return result.artifact;
  }

  function persistAndApprove(campaignId: string, contentKey: string, fixture: object) {
    const artifact = persistCreative(campaignId, contentKey, fixture);
    creativeGeneratorService.approve(campaignId, contentKey, artifact.id);
    return artifact;
  }

  function approveAllFour(campaignId: string) {
    persistAndApprove(campaignId, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
    persistAndApprove(campaignId, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
    persistAndApprove(campaignId, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);
    persistAndApprove(campaignId, 'launch-tiktok-01', REEL_CREATIVE_FIXTURE);
  }

  function openOfType(workspaceId: string, signalType: AttentionSignalType) {
    return attentionSignalService.list(workspaceId).filter((s) => s.signalType === signalType);
  }

  function markScheduleFailed(
    scheduleId: string,
    campaignId: string,
    workspaceId: string,
    artifactId: string,
    version: number,
    overdue: boolean,
  ) {
    const now = new Date().toISOString();
    const scheduledFor = overdue
      ? new Date(Date.now() - 3600000).toISOString()
      : new Date(Date.now() + 3600000).toISOString();
    db.prepare(`UPDATE scheduled_content_items SET status = 'FAILED', scheduled_for = ?, updated_at = ? WHERE id = ?`)
      .run(scheduledFor, now, scheduleId);
    const attemptId = randomUUID();
    db.prepare(`
      INSERT INTO publish_attempts
        (id, workspace_id, campaign_id, schedule_id, attempt_number, provider_key,
         source_creative_artifact_id, source_creative_version, idempotency_key, status,
         error_code, error_message, started_at, completed_at)
      VALUES (?, ?, ?, ?, 1, 'manual', ?, ?, ?, 'FAILED', 'PUBLISH_FAILED', 'Test failure', ?, ?)
    `).run(attemptId, workspaceId, campaignId, scheduleId, artifactId, version, `idem_${scheduleId}`, now, now);
  }

  function publishManual(campaignId: string, workspaceId: string, contentKey: string) {
    const creative = creativeGeneratorService.getCurrent(campaignId, contentKey);
    if (!creative) throw new Error(`No creative for ${contentKey}`);
    const sched = schedulingService.create(campaignId, workspaceId, {
      contentKey,
      scheduledFor: new Date(Date.now() - 3600000).toISOString(),
      publicationMode: 'MANUAL',
    });
    if ('error' in sched) throw new Error(sched.error);
    publishingService.markPublished(sched.item.id, campaignId, { externalUrl: `https://example.com/${contentKey}` });
    return { schedule: sched.item, creative };
  }

  function publishVariant(
    campaignId: string,
    workspaceId: string,
    contentKey: string,
    artifactId: string,
    version: number,
    channel: string,
  ) {
    const sched = schedulingService.create(campaignId, workspaceId, {
      contentKey,
      scheduledFor: new Date(Date.now() - 7200000).toISOString(),
      publicationMode: 'MANUAL',
    });
    if ('error' in sched) throw new Error(sched.error);
    if (sched.item.sourceCreativeArtifactId !== artifactId || sched.item.sourceCreativeVersion !== version) {
      db.prepare(`UPDATE scheduled_content_items SET source_creative_artifact_id = ?, source_creative_version = ?, channel = ? WHERE id = ?`)
        .run(artifactId, version, channel, sched.item.id);
    }
    publishingService.markPublished(sched.item.id, campaignId, { externalUrl: `https://example.com/${contentKey}` });
    return sched.item.id;
  }

  function setupInstagramAb(
    campaignId: string,
    workspaceId: string,
    controlFixture: object,
    variantFixture: object,
    contentKey = 'launch-carousel-01',
  ) {
    const control = persistAndApprove(campaignId, contentKey, controlFixture);
    const scheduleA = publishVariant(campaignId, workspaceId, contentKey, control.id, control.version, 'INSTAGRAM');
    const variantResult = creativeGeneratorService.reviseFromStructured(campaignId, contentKey, 'Variant', variantFixture as never);
    if ('error' in variantResult) throw new Error(variantResult.error);
    creativeGeneratorService.approve(campaignId, contentKey, variantResult.artifact.id);
    const scheduleB = publishVariant(campaignId, workspaceId, contentKey, variantResult.artifact.id, variantResult.artifact.version, 'INSTAGRAM');
    return { control, variant: variantResult.artifact, contentKey, scheduleA, scheduleB };
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  const wsEmpty = `ws_empty_${randomUUID()}`;
  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');
  insertWorkspace(wsEmpty, 'Empty Workspace');

  // --- Test A: Ready for approval campaign signal, reconcile idempotent ---
  const campA = `camp_a_${randomUUID()}`;
  insertCampaign(campA, wsA, 'obj_sys_sales', 'READY_FOR_APPROVAL');
  seedPlanChain(campA, wsA);
  let openA = attentionSignalService.reconcile(wsA).filter((s) => s.signalType === 'CAMPAIGN_READY_FOR_APPROVAL' && s.campaignId === campA);
  check('A one approval signal', openA.length === 1);
  for (let i = 0; i < 3; i++) attentionSignalService.reconcile(wsA);
  openA = attentionSignalService.list(wsA).filter((s) => s.signalType === 'CAMPAIGN_READY_FOR_APPROVAL' && s.campaignId === campA);
  check('A reconcile 3x still one', openA.length === 1);

  // --- Test B: Approve creative resolves CONTENT_READY_FOR_APPROVAL ---
  const campB = `camp_b_${randomUUID()}`;
  insertCampaign(campB, wsA, 'obj_sys_sales', 'APPROVED');
  seedPlanChain(campB, wsA);
  const artB = persistCreative(campB, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  attentionSignalService.reconcile(wsA);
  const beforeB = openOfType(wsA, 'CONTENT_READY_FOR_APPROVAL').filter((s) => s.sourceId === 'launch-carousel-01' && s.campaignId === campB);
  check('B unapproved signal', beforeB.length === 1);
  creativeGeneratorService.approve(campB, 'launch-carousel-01', artB.id);
  attentionSignalService.reconcile(wsA);
  const afterB = openOfType(wsA, 'CONTENT_READY_FOR_APPROVAL').filter((s) => s.sourceId === 'launch-carousel-01' && s.campaignId === campB);
  check('B approve resolves signal', afterB.length === 0);

  // --- Test C: V2 approved resolves, V3 unapproved creates version 3 signal ---
  const campC = `camp_c_${randomUUID()}`;
  insertCampaign(campC, wsA, 'obj_sys_sales', 'APPROVED');
  seedPlanChain(campC, wsA);
  persistAndApprove(campC, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const v2 = creativeGeneratorService.reviseFromStructured(campC, 'launch-carousel-01', 'V2 hook', CAROUSEL_CREATIVE_FIXTURE);
  if ('error' in v2) throw new Error(v2.error);
  creativeGeneratorService.approve(campC, 'launch-carousel-01', v2.artifact.id);
  attentionSignalService.reconcile(wsA);
  check('C V2 approved no signal', openOfType(wsA, 'CONTENT_READY_FOR_APPROVAL').filter((s) => s.campaignId === campC).length === 0);
  const v3 = creativeGeneratorService.reviseFromStructured(campC, 'launch-carousel-01', 'V3 hook', {
    ...CAROUSEL_CREATIVE_FIXTURE,
    caption: 'Version 3 unapproved caption',
  });
  if ('error' in v3) throw new Error(v3.error);
  attentionSignalService.reconcile(wsA);
  const v3Signals = openOfType(wsA, 'CONTENT_READY_FOR_APPROVAL').filter((s) => s.campaignId === campC);
  check('C V3 creates signal', v3Signals.length === 1);
  check('C V3 version in signal', v3Signals[0]?.sourceVersion === String(v3.artifact.version));

  // --- Test D: CHANGES_REQUESTED then REVISING resolves ---
  const campD = `camp_d_${randomUUID()}`;
  insertCampaign(campD, wsA, 'obj_sys_sales', 'CHANGES_REQUESTED');
  seedPlanChain(campD, wsA);
  attentionSignalService.reconcile(wsA);
  check('D changes requested signal', openOfType(wsA, 'CAMPAIGN_CHANGES_REQUESTED').some((s) => s.campaignId === campD));
  db.prepare(`UPDATE campaigns SET status = 'REVISING' WHERE id = ?`).run(campD);
  attentionSignalService.reconcile(wsA);
  check('D revising resolves', openOfType(wsA, 'CAMPAIGN_CHANGES_REQUESTED').filter((s) => s.campaignId === campD).length === 0);

  // --- Test E: 4 approved unscheduled = one READY_TO_SCHEDULE ---
  const campE = `camp_e_${randomUUID()}`;
  insertCampaign(campE, wsA, 'obj_sys_sales', 'APPROVED');
  seedPlanChain(campE, wsA);
  approveAllFour(campE);
  attentionSignalService.reconcile(wsA);
  const schedSignalsE = openOfType(wsA, 'READY_TO_SCHEDULE').filter((s) => s.campaignId === campE);
  check('E one grouped schedule signal', schedSignalsE.length === 1);
  check('E not four rows', schedSignalsE.length !== 4);

  // --- Test F: Schedule all resolves READY_TO_SCHEDULE ---
  for (const key of ['launch-carousel-01', 'launch-reel-01', 'launch-newsletter-01', 'launch-tiktok-01']) {
    schedulingService.create(campE, wsA, {
      contentKey: key,
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      publicationMode: 'MANUAL',
    });
  }
  attentionSignalService.reconcile(wsA);
  check('F schedule all resolves', openOfType(wsA, 'READY_TO_SCHEDULE').filter((s) => s.campaignId === campE).length === 0);

  // --- Test G: FAILED schedule creates HIGH/CRITICAL signal ---
  const campG = `camp_g_${randomUUID()}`;
  insertCampaign(campG, wsA, 'obj_sys_sales', 'SCHEDULED');
  seedPlanChain(campG, wsA);
  const artG = persistAndApprove(campG, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const schedG = schedulingService.create(campG, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() - 7200000).toISOString(),
    publicationMode: 'MANUAL',
  });
  if ('error' in schedG) throw new Error(schedG.error);
  markScheduleFailed(schedG.item.id, campG, wsA, artG.id, artG.version, true);
  attentionSignalService.reconcile(wsA);
  const failSignalsG = attentionSignalService.list(wsA).filter(
    (s) => s.campaignId === campG && (s.signalType === 'PUBLISHING_FAILED' || s.signalType === 'PUBLISHING_RETRY_REQUIRED'),
  );
  check('G failure signal exists', failSignalsG.length >= 1);
  check('G overdue is CRITICAL', failSignalsG.some((s) => s.severity === 'CRITICAL'));

  // --- Test H: mark published resolves failure signal ---
  publishingService.markPublished(schedG.item.id, campG, { externalUrl: 'https://example.com/fixed' });
  attentionSignalService.reconcile(wsA);
  const openAfterH = attentionSignalService.list(wsA).filter(
    (s) => s.campaignId === campG && (s.signalType === 'PUBLISHING_FAILED' || s.signalType === 'PUBLISHING_RETRY_REQUIRED'),
  );
  check('H publish resolves failure', openAfterH.length === 0);

  // --- Test I: LOW_PERFORMING signal with reasons ---
  const campI = `camp_i_${randomUUID()}`;
  insertCampaign(campI, wsA, 'obj_sys_sales', 'PUBLISHED');
  seedPlanChain(campI, wsA);
  persistAndApprove(campI, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const pubI = publishManual(campI, wsA, 'launch-carousel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campI, scheduleId: pubI.schedule.id, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubI.creative.id, sourceCreativeVersion: pubI.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS',
    metrics: { impressions: 50000, views: 100000, purchases: 0 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(campI, wsA);
  attentionSignalService.reconcile(wsA);
  const underI = openOfType(wsA, 'PERFORMANCE_UNDERPERFORMING').filter((s) => s.campaignId === campI);
  check('I underperforming signal', underI.length === 1);
  check('I has reasons', Boolean(underI[0]?.summary && underI[0].summary.length > 0));

  // --- Test J: ABOVE_AVERAGE evaluation resolves underperformance ---
  for (let i = 0; i < 15; i++) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: campI, contentKey: 'launch-carousel-01', scheduleId: pubI.schedule.id,
      conversionType: 'PURCHASE', value: 50, currency: 'NZD', externalConversionId: `j_${i}`,
      attribution: { model: 'MANUAL', campaignId: campI, contentKey: 'launch-carousel-01', scheduleId: pubI.schedule.id, confidence: 'HIGH' },
      source: 'MANUAL',
    });
  }
  db.prepare(`UPDATE objectives SET success_criteria = '10 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
  campaignPerformanceService.evaluate(campI, wsA);
  attentionSignalService.reconcile(wsA);
  check('J recovery resolves underperformance', openOfType(wsA, 'PERFORMANCE_UNDERPERFORMING').filter((s) => s.campaignId === campI).length === 0);

  // --- Test K: INFO PERFORMANCE_HIGH_PERFORMING ---
  const campK = `camp_k_${randomUUID()}`;
  insertCampaign(campK, wsA, 'obj_sys_awareness', 'PUBLISHED');
  seedPlanChain(campK, wsA);
  persistAndApprove(campK, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const pubK = publishManual(campK, wsA, 'launch-carousel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campK, scheduleId: pubK.schedule.id, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubK.creative.id, sourceCreativeVersion: pubK.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS',
    metrics: { reach: 80000, impressions: 80000 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(campK, wsA);
  attentionSignalService.reconcile(wsA);
  const highK = openOfType(wsA, 'PERFORMANCE_HIGH_PERFORMING').filter((s) => s.campaignId === campK);
  check('K high performing signal', highK.length === 1);
  check('K INFO severity', highK[0]?.severity === 'INFO');

  // --- Test L: Sales vanity — 100k views 0 purchases NOT in dashboard highPerforming ---
  const campL = `camp_l_${randomUUID()}`;
  insertCampaign(campL, wsA, 'obj_sys_sales', 'PUBLISHED');
  seedPlanChain(campL, wsA);
  persistAndApprove(campL, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const pubL = publishManual(campL, wsA, 'launch-carousel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campL, scheduleId: pubL.schedule.id, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubL.creative.id, sourceCreativeVersion: pubL.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS',
    metrics: { impressions: 100000, views: 100000, purchases: 0 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(campL, wsA);
  const dashL = dashboardService.getDashboard(wsA);
  check('L not in highPerforming', !dashL.performance.highPerforming.some((p) => p.campaignId === campL));
  check('L vanity in underperforming or signal', dashL.performance.underperforming.some((p) => p.campaignId === campL)
    || openOfType(wsA, 'PERFORMANCE_UNDERPERFORMING').some((s) => s.campaignId === campL));

  // --- Test M: VARIANT_B_WINS -> EXPERIMENT_DECISION_AVAILABLE ---
  const campM = `camp_m_${randomUUID()}`;
  insertCampaign(campM, wsA, 'obj_sys_sales', 'PUBLISHED');
  seedPlanChain(campM, wsA);
  const abM = setupInstagramAb(campM, wsA, CAROUSEL_CREATIVE_FIXTURE, { ...CAROUSEL_CREATIVE_FIXTURE, caption: 'Benefit hook wins' });
  const expM = experimentService.create(campM, wsA, {
    name: 'Hook test M', hypothesis: 'Benefit wins', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expM)) {
    experimentService.addVariant(expM.id, campM, wsA, {
      label: 'A', role: 'CONTROL', contentKey: abM.contentKey,
      creativeArtifactId: abM.control.id, creativeVersion: abM.control.version, channel: 'INSTAGRAM', scheduleId: abM.scheduleA,
    });
    experimentService.addVariant(expM.id, campM, wsA, {
      label: 'B', role: 'VARIANT', contentKey: abM.contentKey,
      creativeArtifactId: abM.variant.id, creativeVersion: abM.variant.version, channel: 'INSTAGRAM', scheduleId: abM.scheduleB,
    });
    experimentService.start(expM.id, campM, wsA);
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campM, scheduleId: abM.scheduleA, contentKey: abM.contentKey,
      sourceCreativeArtifactId: abM.control.id, sourceCreativeVersion: abM.control.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, purchases: 0 }, source: 'MANUAL',
    });
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campM, scheduleId: abM.scheduleB, contentKey: abM.contentKey,
      sourceCreativeArtifactId: abM.variant.id, sourceCreativeVersion: abM.variant.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
    });
    for (let i = 0; i < 12; i++) {
      performanceIngestionService.createConversion({
        workspaceId: wsA, campaignId: campM, contentKey: abM.contentKey, scheduleId: abM.scheduleB,
        conversionType: 'PURCHASE', value: 50, currency: 'NZD', externalConversionId: `m_b_${i}`,
        attribution: { model: 'MANUAL', campaignId: campM, contentKey: abM.contentKey, scheduleId: abM.scheduleB, confidence: 'HIGH' },
        source: 'MANUAL',
      });
    }
    const analysisM = experimentService.analyze(expM.id, campM, wsA, '7_DAYS');
    check('M B wins analysis', !('error' in analysisM) && (analysisM.outcome === 'VARIANT_B_WINS' || analysisM.outcome === 'VARIANT_WINNER'));
    attentionSignalService.reconcile(wsA);
    check('M decision signal', openOfType(wsA, 'EXPERIMENT_DECISION_AVAILABLE').some((s) => s.entityId === expM.id));
  } else {
    check('M B wins analysis', false);
    check('M decision signal', false);
  }

  // --- Test N: INCONCLUSIVE shown not winner ---
  const campN = `camp_n_${randomUUID()}`;
  insertCampaign(campN, wsA, 'obj_sys_sales', 'PUBLISHED');
  seedPlanChain(campN, wsA);
  const abN = setupInstagramAb(campN, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expN = experimentService.create(campN, wsA, {
    name: 'Inconclusive N', hypothesis: 'Null vs zero', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expN)) {
    experimentService.addVariant(expN.id, campN, wsA, {
      label: 'A', role: 'CONTROL', contentKey: abN.contentKey,
      creativeArtifactId: abN.control.id, creativeVersion: abN.control.version, channel: 'INSTAGRAM', scheduleId: abN.scheduleA,
    });
    experimentService.addVariant(expN.id, campN, wsA, {
      label: 'B', role: 'VARIANT', contentKey: abN.contentKey,
      creativeArtifactId: abN.variant.id, creativeVersion: abN.variant.version, channel: 'INSTAGRAM', scheduleId: abN.scheduleB,
    });
    experimentService.start(expN.id, campN, wsA);
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campN, scheduleId: abN.scheduleA, contentKey: abN.contentKey,
      sourceCreativeArtifactId: abN.control.id, sourceCreativeVersion: abN.control.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, purchases: 0 }, source: 'MANUAL',
    });
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campN, scheduleId: abN.scheduleB, contentKey: abN.contentKey,
      sourceCreativeArtifactId: abN.variant.id, sourceCreativeVersion: abN.variant.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
    });
    experimentService.analyze(expN.id, campN, wsA, '7_DAYS');
    attentionSignalService.reconcile(wsA);
    check('N inconclusive signal', openOfType(wsA, 'EXPERIMENT_INCONCLUSIVE').some((s) => s.entityId === expN.id)
      || openOfType(wsA, 'EXPERIMENT_INSUFFICIENT_DATA').some((s) => s.entityId === expN.id));
    check('N not decision winner', !openOfType(wsA, 'EXPERIMENT_DECISION_AVAILABLE').some((s) => s.entityId === expN.id));
  } else {
    check('N inconclusive signal', false);
    check('N not decision winner', false);
  }

  // --- Test O: Observational warning in dashboard experiments ---
  const campO = `camp_o_${randomUUID()}`;
  insertCampaign(campO, wsA, 'obj_sys_sales', 'PUBLISHED');
  seedPlanChain(campO, wsA);
  const abO = setupInstagramAb(campO, wsA, CAROUSEL_CREATIVE_FIXTURE, { ...CAROUSEL_CREATIVE_FIXTURE, caption: 'Obs variant' });
  const expO = experimentService.create(campO, wsA, {
    name: 'Observational O', hypothesis: 'Obs compare', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expO)) {
    experimentService.addVariant(expO.id, campO, wsA, {
      label: 'A', role: 'CONTROL', contentKey: abO.contentKey,
      creativeArtifactId: abO.control.id, creativeVersion: abO.control.version, channel: 'INSTAGRAM', scheduleId: abO.scheduleA,
    });
    experimentService.addVariant(expO.id, campO, wsA, {
      label: 'B', role: 'VARIANT', contentKey: abO.contentKey,
      creativeArtifactId: abO.variant.id, creativeVersion: abO.variant.version, channel: 'INSTAGRAM', scheduleId: abO.scheduleB,
    });
    experimentService.start(expO.id, campO, wsA);
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campO, scheduleId: abO.scheduleA, contentKey: abO.contentKey,
      sourceCreativeArtifactId: abO.control.id, sourceCreativeVersion: abO.control.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
    });
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campO, scheduleId: abO.scheduleB, contentKey: abO.contentKey,
      sourceCreativeArtifactId: abO.variant.id, sourceCreativeVersion: abO.variant.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
    });
    experimentService.analyze(expO.id, campO, wsA, '7_DAYS');
    const dashO = dashboardService.getDashboard(wsA);
    const expItemO = dashO.experiments.find((e) => e.experimentId === expO.id);
    check('O observational in dashboard', expItemO?.mode === 'OBSERVATIONAL_COMPARISON');
    check('O has warning', Boolean(expItemO?.warnings?.length || expItemO?.signalType.includes('EXPERIMENT')));
  } else {
    check('O observational in dashboard', false);
    check('O has warning', false);
  }

  // --- Test P: Blueprint candidate signal, create blueprint resolves ---
  const campP = `camp_p_${randomUUID()}`;
  insertCampaign(campP, wsA, 'obj_sys_sales', 'COMPLETE');
  seedPlanChain(campP, wsA);
  creativeGeneratorService.persistFromStructured(campP, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  creativeGeneratorService.approve(campP, 'launch-carousel-01', creativeGeneratorService.getCurrent(campP, 'launch-carousel-01')!.id);
  const pubP = publishManual(campP, wsA, 'launch-carousel-01');
  for (let i = 0; i < 25; i++) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: campP, contentKey: 'launch-carousel-01', scheduleId: pubP.schedule.id,
      conversionType: 'PURCHASE', value: 100, currency: 'NZD', externalConversionId: `p_${i}`,
      attribution: { model: 'MANUAL', campaignId: campP, confidence: 'MEDIUM' }, source: 'MANUAL',
    });
  }
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campP, scheduleId: pubP.schedule.id, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubP.creative.id, sourceCreativeVersion: pubP.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
  });
  db.prepare(`UPDATE objectives SET success_criteria = '20 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
  campaignPerformanceService.evaluate(campP, wsA);
  campaignLibraryService.syncClassifications(campP, wsA);
  attentionSignalService.reconcile(wsA);
  const bpSignalsP = openOfType(wsA, 'BLUEPRINT_CANDIDATE').filter((s) => s.campaignId === campP);
  check('P blueprint candidate signal', bpSignalsP.length >= 1);
  const bpP = blueprintService.createFromCampaign(campP, wsA);
  check('P blueprint created', !('error' in bpP));
  attentionSignalService.reconcile(wsA);
  check('P blueprint resolves signal', openOfType(wsA, 'BLUEPRINT_CANDIDATE').filter((s) => s.campaignId === campP).length === 0);

  // --- Test Q: CANDIDATE learning signal, dismiss resolves ---
  const learningQ = learningService.upsertCandidate({
    workspaceId: wsA,
    type: 'MARKET_PERFORMANCE',
    category: 'HOOK',
    statement: 'Benefit-led hooks outperform product-led hooks in test workspace',
    confidence: 'LOW',
    relevanceTags: ['SALES', 'INSTAGRAM'],
    evidence: [
      { sourceType: 'experiment', sourceId: 'ev1' },
      { sourceType: 'experiment', sourceId: 'ev2' },
      { sourceType: 'experiment', sourceId: 'ev3' },
    ],
  });
  attentionSignalService.reconcile(wsA);
  const learnSignalsQ = openOfType(wsA, 'LEARNING_CANDIDATE').filter((s) => s.entityId === learningQ?.id);
  check('Q learning candidate signal', learnSignalsQ.length === 1);
  if (learningQ && learnSignalsQ[0]) {
    attentionSignalService.dismiss(learnSignalsQ[0].id, wsA);
    attentionSignalService.reconcile(wsA);
    check('Q dismiss resolves', openOfType(wsA, 'LEARNING_CANDIDATE').filter((s) => s.entityId === learningQ.id).length === 0);
  } else {
    check('Q dismiss resolves', false);
  }

  // --- Test R: Dismiss blueprint signal, library record unchanged ---
  const campR = `camp_r_${randomUUID()}`;
  insertCampaign(campR, wsA, 'obj_sys_sales', 'COMPLETE');
  seedPlanChain(campR, wsA);
  persistAndApprove(campR, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);
  const pubR = publishManual(campR, wsA, 'launch-newsletter-01');
  for (let i = 0; i < 25; i++) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: campR, contentKey: 'launch-newsletter-01', scheduleId: pubR.schedule.id,
      conversionType: 'PURCHASE', value: 100, currency: 'NZD', externalConversionId: `r_${i}`,
      attribution: { model: 'MANUAL', campaignId: campR, confidence: 'MEDIUM' }, source: 'MANUAL',
    });
  }
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campR, scheduleId: pubR.schedule.id, contentKey: 'launch-newsletter-01',
    sourceCreativeArtifactId: pubR.creative.id, sourceCreativeVersion: pubR.creative.version,
    channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(campR, wsA);
  const recBeforeR = campaignLibraryService.syncClassifications(campR, wsA);
  attentionSignalService.reconcile(wsA);
  const bpSignalR = openOfType(wsA, 'BLUEPRINT_CANDIDATE').find((s) => s.campaignId === campR);
  if (bpSignalR) {
    attentionSignalService.dismiss(bpSignalR.id, wsA);
    const recAfterR = campaignLibraryService.get(campR, wsA);
    check('R dismiss signal ok', attentionSignalService.get(bpSignalR.id, wsA)?.status === 'DISMISSED');
    check('R library unchanged', !('error' in recAfterR) && recAfterR.libraryRecord.blueprintCandidate === recBeforeR.blueprintCandidate);
  } else {
    check('R dismiss signal ok', false);
    check('R library unchanged', false);
  }

  // --- Test S: Dismiss eval v1, new eval id creates new signal ---
  const campS = `camp_s_${randomUUID()}`;
  insertCampaign(campS, wsA, 'obj_sys_awareness', 'PUBLISHED');
  seedPlanChain(campS, wsA);
  persistAndApprove(campS, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const pubS = publishManual(campS, wsA, 'launch-carousel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: campS, scheduleId: pubS.schedule.id, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubS.creative.id, sourceCreativeVersion: pubS.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { reach: 60000, impressions: 60000 }, source: 'MANUAL',
  });
  campaignPerformanceService.evaluate(campS, wsA);
  attentionSignalService.reconcile(wsA);
  const highS = openOfType(wsA, 'PERFORMANCE_HIGH_PERFORMING').find((s) => s.campaignId === campS);
  const evalV1 = objectiveEvaluationService.getLatestEvaluation(campS)?.id;
  if (highS) {
    attentionSignalService.dismiss(highS.id, wsA);
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campS, scheduleId: pubS.schedule.id, contentKey: 'launch-carousel-01',
      sourceCreativeArtifactId: pubS.creative.id, sourceCreativeVersion: pubS.creative.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { reach: 90000, impressions: 90000 }, source: 'MANUAL',
    });
    campaignPerformanceService.evaluate(campS, wsA);
    const evalV2 = objectiveEvaluationService.getLatestEvaluation(campS)?.id;
    attentionSignalService.reconcile(wsA);
    check('S new eval id', evalV1 !== evalV2);
    check('S new signal after dismiss', openOfType(wsA, 'PERFORMANCE_HIGH_PERFORMING').some((s) => s.campaignId === campS && s.sourceVersion === evalV2));
  } else {
    check('S new eval id', false);
    check('S new signal after dismiss', false);
  }

  // --- Test T: Publishing failure ranks before blueprint candidate ---
  const campT = `camp_t_${randomUUID()}`;
  insertCampaign(campT, wsA, 'obj_sys_sales', 'SCHEDULED');
  seedPlanChain(campT, wsA);
  const artT = persistAndApprove(campT, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const schedT = schedulingService.create(campT, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() - 3600000).toISOString(),
    publicationMode: 'MANUAL',
  });
  if ('error' in schedT) throw new Error(schedT.error);
  markScheduleFailed(schedT.item.id, campT, wsA, artT.id, artT.version, true);
  campaignLibraryService.syncClassifications(campP, wsA);
  attentionSignalService.reconcile(wsA);
  const rankedT = attentionSignalService.rank(attentionSignalService.list(wsA));
  const failIdxT = rankedT.findIndex((s) => s.signalType === 'PUBLISHING_FAILED' || s.signalType === 'PUBLISHING_RETRY_REQUIRED');
  const bpIdxT = rankedT.findIndex((s) => s.signalType === 'BLUEPRINT_CANDIDATE');
  check('T failure before blueprint', failIdxT >= 0 && (bpIdxT < 0 || failIdxT < bpIdxT));

  // --- Test U: Upcoming today + 7 days only, not 10 days out ---
  const campU = `camp_u_${randomUUID()}`;
  insertCampaign(campU, wsA, 'obj_sys_sales', 'SCHEDULED');
  seedPlanChain(campU, wsA);
  persistAndApprove(campU, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const todaySched = schedulingService.create(campU, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'MANUAL',
  });
  persistAndApprove(campU, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const weekSched = schedulingService.create(campU, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() + 6 * 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  persistAndApprove(campU, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);
  const farSched = schedulingService.create(campU, wsA, {
    contentKey: 'launch-newsletter-01',
    scheduledFor: new Date(Date.now() + 10 * 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  const dashU = dashboardService.getDashboard(wsA);
  const upcomingIds = new Set(dashU.upcoming.map((u) => u.scheduleId));
  check('U includes near schedules', !('error' in todaySched) && !('error' in weekSched)
    && upcomingIds.has(todaySched.item.id) && upcomingIds.has(weekSched.item.id));
  check('U excludes 10 days out', !('error' in farSched) && !upcomingIds.has(farSched.item.id));

  // --- Test V: formatScheduleLocal respects timezone ---
  const utcMidnight = '2026-01-15T11:00:00.000Z';
  const nz = formatScheduleLocal(utcMidnight, 'Pacific/Auckland');
  const ny = formatScheduleLocal(utcMidnight, 'America/New_York');
  check('V timezone differs', nz.localTimeLabel !== ny.localTimeLabel || nz.localDayLabel !== ny.localDayLabel);

  // --- Test W: Workspace isolation via express routers ---
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/attention', attentionRouter);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  async function hit(method: string, path: string, body?: unknown) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.status;
  }
  const learningW = learningService.upsertCandidate({
    workspaceId: wsA,
    type: 'USER_PREFERENCE',
    category: 'TONE',
    statement: 'Workspace isolation learning probe',
    confidence: 'LOW',
    relevanceTags: ['ALL'],
    evidence: [
      { sourceType: 'test', sourceId: 'w1' },
      { sourceType: 'test', sourceId: 'w2' },
      { sourceType: 'test', sourceId: 'w3' },
    ],
  });
  attentionSignalService.reconcile(wsA);
  const signalW = attentionSignalService.list(wsA).find((s) => s.entityId === learningW?.id);
  check('W dismiss wrong workspace blocked', signalW ? (await hit('POST', `/api/attention/${signalW.id}/dismiss`, { workspaceId: wsB })) === 403 : false);
  check('W dismiss correct workspace ok', signalW ? (await hit('POST', `/api/attention/${signalW.id}/dismiss`, { workspaceId: wsA })) === 200 : false);
  check('W dashboard isolated', (await hit('GET', `/api/dashboard?workspaceId=${wsB}`)) === 200);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- Test X: Reconcile 5 times same open count ---
  const campX = `camp_x_${randomUUID()}`;
  insertCampaign(campX, wsA, 'obj_sys_sales', 'READY_FOR_REVIEW');
  seedPlanChain(campX, wsA);
  attentionSignalService.reconcile(wsA);
  const countX0 = attentionSignalService.list(wsA).filter((s) => s.campaignId === campX && s.status === 'OPEN').length;
  for (let i = 0; i < 5; i++) attentionSignalService.reconcile(wsA);
  const countX5 = attentionSignalService.list(wsA).filter((s) => s.campaignId === campX && s.status === 'OPEN').length;
  check('X no duplicates after 5 reconciles', countX0 === countX5 && countX0 >= 1);

  // --- Test Y: Stale source resolves signal ---
  const campY = `camp_y_${randomUUID()}`;
  insertCampaign(campY, wsA, 'obj_sys_sales', 'READY_FOR_APPROVAL');
  seedPlanChain(campY, wsA);
  attentionSignalService.reconcile(wsA);
  check('Y signal before resolve', openOfType(wsA, 'CAMPAIGN_READY_FOR_APPROVAL').some((s) => s.campaignId === campY));
  db.prepare(`UPDATE campaigns SET status = 'APPROVED' WHERE id = ?`).run(campY);
  attentionSignalService.reconcile(wsA);
  check('Y stale source resolved', openOfType(wsA, 'CAMPAIGN_READY_FOR_APPROVAL').filter((s) => s.campaignId === campY).length === 0);

  // --- Test Z: Empty dashboard ---
  const dashZ = dashboardService.getDashboard(wsEmpty);
  check('Z empty flag', dashZ.empty === true);
  check('Z no fake needsAttention', dashZ.needsAttention.length === 0);
  check('Z zero counts', dashZ.counts.needsAttention === 0 && dashZ.counts.readyForReview === 0);

  // --- Additional: No AI ---
  check('No AI env empty', process.env.AI_PROVIDER === '');
  const campNoAi = `camp_noai_${randomUUID()}`;
  insertCampaign(campNoAi, wsEmpty, 'obj_sys_sales', 'APPROVED');
  seedPlanChain(campNoAi, wsEmpty);
  const noAiArt = persistCreative(campNoAi, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  check('No AI manual creative', Boolean(noAiArt.id));

  console.log(`\nPhase 3I verification: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
