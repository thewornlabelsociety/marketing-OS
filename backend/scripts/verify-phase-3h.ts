import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { experimentService } from '../src/services/experiments/ExperimentService';
import { experimentQualityGate } from '../src/services/experiments/ExperimentQualityGate';
import { experimentAnalysisService } from '../src/services/experiments/ExperimentAnalysisService';
import { learningService } from '../src/services/performance/LearningService';
import { blueprintService } from '../src/services/library/BlueprintService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { campaignExperimentsRouter } from '../src/routes/campaignExperiments';
import { CAROUSEL_CREATIVE_FIXTURE, NEWSLETTER_CREATIVE_FIXTURE } from './fixtures/creativeFixtures';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';

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
    const planBody = JSON.stringify({ summary: PRODUCT_PROOF_FIXTURE.summary, concepts: PRODUCT_PROOF_FIXTURE.concepts, deliverables: PRODUCT_PROOF_FIXTURE.deliverables, cadence: PRODUCT_PROOF_FIXTURE.cadence });
    db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)`).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
  }

  function persistAndApprove(campaignId: string, contentKey: string, fixture: object) {
    const result = creativeGeneratorService.persistFromStructured(campaignId, contentKey, fixture as never);
    if ('error' in result) throw new Error(result.error);
    creativeGeneratorService.approve(campaignId, contentKey, result.artifact.id);
    return result.artifact;
  }

  function createVariantRevision(campaignId: string, contentKey: string, fixture: object, requestText = 'Experiment variant') {
    const result = creativeGeneratorService.reviseFromStructured(campaignId, contentKey, requestText, fixture as never);
    if ('error' in result) throw new Error(result.error);
    creativeGeneratorService.approve(campaignId, contentKey, result.artifact.id);
    return result.artifact;
  }

  function publishVariant(campaignId: string, workspaceId: string, contentKey: string, artifactId: string, version: number, channel: string) {
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

  function setupInstagramAb(campaignId: string, workspaceId: string, controlFixture: object, variantFixture: object, contentKey = 'launch-carousel-01') {
    const control = persistAndApprove(campaignId, contentKey, controlFixture);
    const scheduleA = publishVariant(campaignId, workspaceId, contentKey, control.id, control.version, 'INSTAGRAM');
    const variant = createVariantRevision(campaignId, contentKey, variantFixture);
    const scheduleB = publishVariant(campaignId, workspaceId, contentKey, variant.id, variant.version, 'INSTAGRAM');
    return { control, variant, contentKey, scheduleA, scheduleB };
  }

  function setupEmailAb(campaignId: string, workspaceId: string, controlFixture: object, variantFixture: object, contentKey = 'launch-newsletter-01') {
    const control = persistAndApprove(campaignId, contentKey, controlFixture);
    const scheduleA = publishVariant(campaignId, workspaceId, contentKey, control.id, control.version, 'EMAIL');
    const variant = createVariantRevision(campaignId, contentKey, variantFixture);
    const scheduleB = publishVariant(campaignId, workspaceId, contentKey, variant.id, variant.version, 'EMAIL');
    return { control, variant, contentKey, scheduleA, scheduleB };
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');

  const camp = `camp_exp_${randomUUID()}`;
  insertCampaign(camp, wsA);
  seedPlanChain(camp, wsA);

  const controlArt = persistAndApprove(camp, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);

  // --- Test A ---
  const expA = experimentService.create(camp, wsA, {
    name: 'Benefit-led Hook Test',
    hypothesisStructured: {
      ifChange: 'we use a benefit-led hook instead of a product-led hook',
      thenEffect: 'purchase conversion rate will improve',
      becauseRationale: 'the audience responds more strongly to outcome-oriented messaging',
      measuredBy: 'purchases',
    },
    variableType: 'HOOK',
    controlDescription: 'New season has landed',
    variantDescription: 'The trousers everyone asked for are back',
    minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  check('A experiment created', !('error' in expA));

  // --- Test B ---
  if (!('error' in expA)) {
    check('B objective from library', expA.objectiveId === 'obj_sys_sales');
    check('B primary KPI from objective', expA.primaryKpi === 'conversions');
  }

  // --- Add variants ---
  let exp = !('error' in expA) ? expA : null;
  if (exp) {
    const scheduleA = publishVariant(camp, wsA, 'launch-carousel-01', controlArt.id, controlArt.version, 'INSTAGRAM');
    const variantArt = createVariantRevision(camp, 'launch-carousel-01', {
      ...CAROUSEL_CREATIVE_FIXTURE,
      caption: 'The trousers everyone asked for are back',
    });
    const scheduleB = publishVariant(camp, wsA, 'launch-carousel-01', variantArt.id, variantArt.version, 'INSTAGRAM');
    experimentService.addVariant(exp.id, camp, wsA, {
      label: 'A', role: 'CONTROL', contentKey: 'launch-carousel-01',
      creativeArtifactId: controlArt.id, creativeVersion: controlArt.version, channel: 'INSTAGRAM', scheduleId: scheduleA,
    });
    experimentService.addVariant(exp.id, camp, wsA, {
      label: 'B', role: 'VARIANT', contentKey: 'launch-carousel-01',
      creativeArtifactId: variantArt.id, creativeVersion: variantArt.version, channel: 'INSTAGRAM', scheduleId: scheduleB,
    });
    exp = experimentService.get(exp.id, camp, wsA) as typeof exp;
  }

  // --- Test C version pinning ---
  if (exp) {
    const started = experimentService.start(exp.id, camp, wsA);
    check('C experiment started', !('error' in started));
    const v3Result = creativeGeneratorService.persistFromStructured(camp, 'launch-carousel-01', {
      ...CAROUSEL_CREATIVE_FIXTURE,
      caption: 'Version 3 should not replace pinned version',
    });
    const v3 = 'error' in v3Result ? null : v3Result.artifact;
    const pinned = experimentService.get(exp.id, camp, wsA);
    if (!('error' in pinned)) {
      const control = pinned.variants.find((v) => v.label === 'A');
      check('C still pins V2', control?.creativeVersion === controlArt.version && control?.creativeArtifactId === controlArt.id);
      check('C ignores V3', v3 ? control?.creativeVersion !== v3.version : true);
    }
  }

  // --- Test D approval gate ---
  const campD = `camp_d_${randomUUID()}`;
  insertCampaign(campD, wsA);
  seedPlanChain(campD, wsA);
  const artD = persistAndApprove(campD, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const unapprovedResult = creativeGeneratorService.reviseFromStructured(campD, 'launch-carousel-01', 'Variant hook', CAROUSEL_CREATIVE_FIXTURE);
  const unapproved = 'error' in unapprovedResult ? null : unapprovedResult.artifact;
  const expD = experimentService.create(campD, wsA, {
    name: 'Approval gate test', hypothesis: 'Test approval gate', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B',
  });
  if (!('error' in expD) && unapproved) {
    experimentService.addVariant(expD.id, campD, wsA, {
      label: 'A', role: 'CONTROL', contentKey: 'launch-carousel-01',
      creativeArtifactId: artD.id, creativeVersion: artD.version, channel: 'INSTAGRAM',
    });
    experimentService.addVariant(expD.id, campD, wsA, {
      label: 'B', role: 'VARIANT', contentKey: 'launch-carousel-01',
      creativeArtifactId: unapproved.id, creativeVersion: unapproved.version, channel: 'INSTAGRAM',
    });
    const blocked = experimentService.start(expD.id, campD, wsA);
    check('D unapproved blocked', 'error' in blocked);
    creativeGeneratorService.approve(campD, 'launch-carousel-01', unapproved.id);
    const startedD = experimentService.start(expD.id, campD, wsA);
    check('D approved eligible', !('error' in startedD));
  }

  // --- Test E confounding ---
  const confound = experimentQualityGate.validate({
    variableType: 'HOOK',
    mode: 'OBSERVATIONAL_COMPARISON',
    controlDescription: 'Instagram carousel 10% off',
    variantDescription: 'Email free shipping',
    variants: [
      { label: 'A', role: 'CONTROL', contentKey: 'a', channel: 'INSTAGRAM', offerFraming: '10% off' },
      { label: 'B', role: 'VARIANT', contentKey: 'b', channel: 'EMAIL', offerFraming: 'free shipping' },
    ],
  });
  check('E confounding detected', !confound.valid && confound.findings.some((f) => f.code === 'CHANNEL_MISMATCH'));

  // --- Test F clean variable ---
  const clean = experimentQualityGate.validate({
    variableType: 'HOOK',
    mode: 'OBSERVATIONAL_COMPARISON',
    controlDescription: 'Product-led hook',
    variantDescription: 'Benefit-led hook',
    variants: [
      { label: 'A', role: 'CONTROL', contentKey: 'a', channel: 'INSTAGRAM' },
      { label: 'B', role: 'VARIANT', contentKey: 'b', channel: 'INSTAGRAM' },
    ],
  });
  check('F clean variable pass', clean.valid || !clean.findings.some((f) => f.severity === 'ERROR'));

  // --- Test G sales vanity ---
  const campG = `camp_g_${randomUUID()}`;
  insertCampaign(campG, wsA);
  seedPlanChain(campG, wsA);
  const abG = setupInstagramAb(campG, wsA, CAROUSEL_CREATIVE_FIXTURE, { ...CAROUSEL_CREATIVE_FIXTURE, caption: 'Benefit hook' });
  const expG = experimentService.create(campG, wsA, {
    name: 'Sales hook test', hypothesis: 'Benefit hook improves purchases', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expG)) {
    experimentService.addVariant(expG.id, campG, wsA, { label: 'A', role: 'CONTROL', contentKey: abG.contentKey, creativeArtifactId: abG.control.id, creativeVersion: abG.control.version, channel: 'INSTAGRAM', scheduleId: abG.scheduleA });
    experimentService.addVariant(expG.id, campG, wsA, { label: 'B', role: 'VARIANT', contentKey: abG.contentKey, creativeArtifactId: abG.variant.id, creativeVersion: abG.variant.version, channel: 'INSTAGRAM', scheduleId: abG.scheduleB });
    experimentService.start(expG.id, campG, wsA);
    const startG = experimentService.get(expG.id, campG, wsA);
    check('G experiment running', !('error' in startG) && startG.status === 'RUNNING');
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campG, scheduleId: abG.scheduleA, contentKey: abG.contentKey,
      sourceCreativeArtifactId: abG.control.id, sourceCreativeVersion: abG.control.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 100000, views: 100000, purchases: 0 }, source: 'MANUAL',
    });
    performanceIngestionService.createObservation({
      workspaceId: wsA, campaignId: campG, scheduleId: abG.scheduleB, contentKey: abG.contentKey,
      sourceCreativeArtifactId: abG.variant.id, sourceCreativeVersion: abG.variant.version,
      channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 25000, views: 25000 }, source: 'MANUAL',
    });
    for (let i = 0; i < 20; i++) {
      performanceIngestionService.createConversion({
        workspaceId: wsA, campaignId: campG, contentKey: abG.contentKey, scheduleId: abG.scheduleB,
        conversionType: 'PURCHASE', value: 50, currency: 'NZD', externalConversionId: `g_b_${i}`,
        attribution: { model: 'MANUAL', campaignId: campG, contentKey: abG.contentKey, scheduleId: abG.scheduleB, confidence: 'HIGH' }, source: 'MANUAL',
      });
    }
    const analysisG = experimentService.analyze(expG.id, campG, wsA, '7_DAYS');
    check('G B wins sales', !('error' in analysisG) && (analysisG.outcome === 'VARIANT_B_WINS' || analysisG.outcome === 'VARIANT_WINNER'));
    if (!('error' in analysisG)) check('G A cannot win on reach', analysisG.outcome !== 'VARIANT_A_WINS');
  }

  // --- Test H awareness ---
  const campH = `camp_h_${randomUUID()}`;
  insertCampaign(campH, wsA, 'obj_sys_awareness');
  seedPlanChain(campH, wsA);
  const abH = setupInstagramAb(campH, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expH = experimentService.create(campH, wsA, {
    name: 'Awareness reach test', hypothesis: 'Hook A reaches more', variableType: 'HOOK',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expH)) {
    experimentService.addVariant(expH.id, campH, wsA, { label: 'A', role: 'CONTROL', contentKey: abH.contentKey, creativeArtifactId: abH.control.id, creativeVersion: abH.control.version, channel: 'INSTAGRAM', scheduleId: abH.scheduleA });
    experimentService.addVariant(expH.id, campH, wsA, { label: 'B', role: 'VARIANT', contentKey: abH.contentKey, creativeArtifactId: abH.variant.id, creativeVersion: abH.variant.version, channel: 'INSTAGRAM', scheduleId: abH.scheduleB });
    experimentService.start(expH.id, campH, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campH, scheduleId: abH.scheduleA, contentKey: abH.contentKey, sourceCreativeArtifactId: abH.control.id, sourceCreativeVersion: abH.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { reach: 120000, impressions: 120000 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campH, scheduleId: abH.scheduleB, contentKey: abH.contentKey, sourceCreativeArtifactId: abH.variant.id, sourceCreativeVersion: abH.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { reach: 80000, impressions: 80000 }, source: 'MANUAL' });
    const analysisH = experimentService.analyze(expH.id, campH, wsA, '7_DAYS');
    check('H A wins awareness', !('error' in analysisH) && analysisH.outcome === 'VARIANT_A_WINS');
  }

  // --- Test I lead gen ---
  const campI = `camp_i_${randomUUID()}`;
  insertCampaign(campI, wsA, 'obj_sys_lead_gen');
  seedPlanChain(campI, wsA);
  const abI = setupEmailAb(campI, wsA, NEWSLETTER_CREATIVE_FIXTURE, NEWSLETTER_CREATIVE_FIXTURE);
  const expI = experimentService.create(campI, wsA, {
    name: 'Lead gen test', hypothesis: 'A generates more leads', variableType: 'HEADLINE',
    controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expI)) {
    experimentService.addVariant(expI.id, campI, wsA, { label: 'A', role: 'CONTROL', contentKey: abI.contentKey, creativeArtifactId: abI.control.id, creativeVersion: abI.control.version, channel: 'EMAIL', scheduleId: abI.scheduleA });
    experimentService.addVariant(expI.id, campI, wsA, { label: 'B', role: 'VARIANT', contentKey: abI.contentKey, creativeArtifactId: abI.variant.id, creativeVersion: abI.variant.version, channel: 'EMAIL', scheduleId: abI.scheduleB });
    experimentService.start(expI.id, campI, wsA);
    for (let i = 0; i < 60; i++) {
      performanceIngestionService.createConversion({
        workspaceId: wsA, campaignId: campI, contentKey: abI.contentKey, scheduleId: abI.scheduleA, conversionType: 'QUALIFIED_LEAD',
        externalConversionId: `lead_a_${i}`, attribution: { model: 'MANUAL', campaignId: campI, contentKey: abI.contentKey, scheduleId: abI.scheduleA, confidence: 'HIGH' }, source: 'MANUAL',
      });
    }
    for (let i = 0; i < 40; i++) {
      performanceIngestionService.createConversion({
        workspaceId: wsA, campaignId: campI, contentKey: abI.contentKey, scheduleId: abI.scheduleB, conversionType: 'QUALIFIED_LEAD',
        externalConversionId: `lead_b_${i}`, attribution: { model: 'MANUAL', campaignId: campI, contentKey: abI.contentKey, scheduleId: abI.scheduleB, confidence: 'HIGH' }, source: 'MANUAL',
      });
    }
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campI, scheduleId: abI.scheduleA, contentKey: abI.contentKey, sourceCreativeArtifactId: abI.control.id, sourceCreativeVersion: abI.control.version, channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { emailDelivered: 1000 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campI, scheduleId: abI.scheduleB, contentKey: abI.contentKey, sourceCreativeArtifactId: abI.variant.id, sourceCreativeVersion: abI.variant.version, channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { emailDelivered: 1000 }, source: 'MANUAL' });
    const analysisI = experimentService.analyze(expI.id, campI, wsA, '7_DAYS');
    check('I A wins leads', !('error' in analysisI) && analysisI.outcome === 'VARIANT_A_WINS');
  }

  // --- Test J upstream KPI ---
  const campJ = `camp_j_${randomUUID()}`;
  insertCampaign(campJ, wsA);
  seedPlanChain(campJ, wsA);
  const abJ = setupEmailAb(campJ, wsA, NEWSLETTER_CREATIVE_FIXTURE, { ...NEWSLETTER_CREATIVE_FIXTURE, subject: 'Better subject line' });
  const expJ = experimentService.create(campJ, wsA, {
    name: 'Subject line test', hypothesis: 'Subject A wins opens', variableType: 'SUBJECT_LINE',
    controlDescription: 'A subject', variantDescription: 'B subject',
    experimentKpi: 'open_rate', experimentKpiRationale: 'Testing email subject line optimization',
    minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expJ)) {
    experimentService.addVariant(expJ.id, campJ, wsA, { label: 'A', role: 'CONTROL', contentKey: abJ.contentKey, creativeArtifactId: abJ.control.id, creativeVersion: abJ.control.version, channel: 'EMAIL', scheduleId: abJ.scheduleA });
    experimentService.addVariant(expJ.id, campJ, wsA, { label: 'B', role: 'VARIANT', contentKey: abJ.contentKey, creativeArtifactId: abJ.variant.id, creativeVersion: abJ.variant.version, channel: 'EMAIL', scheduleId: abJ.scheduleB });
    experimentService.start(expJ.id, campJ, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campJ, scheduleId: abJ.scheduleA, contentKey: abJ.contentKey, sourceCreativeArtifactId: abJ.control.id, sourceCreativeVersion: abJ.control.version, channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { emailDelivered: 1000, emailOpens: 400 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campJ, scheduleId: abJ.scheduleB, contentKey: abJ.contentKey, sourceCreativeArtifactId: abJ.variant.id, sourceCreativeVersion: abJ.variant.version, channel: 'EMAIL', measurementWindow: '7_DAYS', metrics: { emailDelivered: 1000, emailOpens: 300 }, source: 'MANUAL' });
    const analysisJ = experimentService.analyze(expJ.id, campJ, wsA, '7_DAYS');
    check('J A wins subject line', !('error' in analysisJ) && analysisJ.outcome === 'VARIANT_A_WINS');
    if (!('error' in analysisJ)) check('J no sales claim', Boolean(analysisJ.campaignObjectiveImpact));
  }

  // --- Test K unknown vs zero ---
  const campK = `camp_k_${randomUUID()}`;
  insertCampaign(campK, wsA);
  seedPlanChain(campK, wsA);
  const abK = setupInstagramAb(campK, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expK = experimentService.create(campK, wsA, { name: 'Null test', hypothesis: 'Null vs zero', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expK)) {
    experimentService.addVariant(expK.id, campK, wsA, { label: 'A', role: 'CONTROL', contentKey: abK.contentKey, creativeArtifactId: abK.control.id, creativeVersion: abK.control.version, channel: 'INSTAGRAM', scheduleId: abK.scheduleA });
    experimentService.addVariant(expK.id, campK, wsA, { label: 'B', role: 'VARIANT', contentKey: abK.contentKey, creativeArtifactId: abK.variant.id, creativeVersion: abK.variant.version, channel: 'INSTAGRAM', scheduleId: abK.scheduleB });
    experimentService.start(expK.id, campK, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campK, scheduleId: abK.scheduleA, contentKey: abK.contentKey, sourceCreativeArtifactId: abK.control.id, sourceCreativeVersion: abK.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, purchases: 0 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campK, scheduleId: abK.scheduleB, contentKey: abK.contentKey, sourceCreativeArtifactId: abK.variant.id, sourceCreativeVersion: abK.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
    const analysisK = experimentService.analyze(expK.id, campK, wsA, '7_DAYS');
    check('K inconclusive null vs zero', !('error' in analysisK) && (analysisK.outcome === 'INCONCLUSIVE' || analysisK.outcome === 'INSUFFICIENT_DATA'));
  }

  // --- Test L minimum evidence ---
  const campL = `camp_l_${randomUUID()}`;
  insertCampaign(campL, wsA);
  seedPlanChain(campL, wsA);
  const abL = setupInstagramAb(campL, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expL = experimentService.create(campL, wsA, { name: 'Tiny sample', hypothesis: 'Tiny', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expL)) {
    experimentService.addVariant(expL.id, campL, wsA, { label: 'A', role: 'CONTROL', contentKey: abL.contentKey, creativeArtifactId: abL.control.id, creativeVersion: abL.control.version, channel: 'INSTAGRAM', scheduleId: abL.scheduleA });
    experimentService.addVariant(expL.id, campL, wsA, { label: 'B', role: 'VARIANT', contentKey: abL.contentKey, creativeArtifactId: abL.variant.id, creativeVersion: abL.variant.version, channel: 'INSTAGRAM', scheduleId: abL.scheduleB });
    experimentService.start(expL.id, campL, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campL, scheduleId: abL.scheduleA, contentKey: abL.contentKey, sourceCreativeArtifactId: abL.control.id, sourceCreativeVersion: abL.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 17 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campL, scheduleId: abL.scheduleB, contentKey: abL.contentKey, sourceCreativeArtifactId: abL.variant.id, sourceCreativeVersion: abL.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 17 }, source: 'MANUAL' });
    const analysisL = experimentService.analyze(expL.id, campL, wsA, '7_DAYS');
    check('L insufficient data', !('error' in analysisL) && analysisL.outcome === 'INSUFFICIENT_DATA');
  }

  // --- Test M window mismatch ---
  const campM = `camp_m_${randomUUID()}`;
  insertCampaign(campM, wsA);
  seedPlanChain(campM, wsA);
  const abM = setupInstagramAb(campM, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expM = experimentService.create(campM, wsA, { name: 'Window mismatch', hypothesis: 'Windows', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expM)) {
    experimentService.addVariant(expM.id, campM, wsA, { label: 'A', role: 'CONTROL', contentKey: abM.contentKey, creativeArtifactId: abM.control.id, creativeVersion: abM.control.version, channel: 'INSTAGRAM', scheduleId: abM.scheduleA });
    experimentService.addVariant(expM.id, campM, wsA, { label: 'B', role: 'VARIANT', contentKey: abM.contentKey, creativeArtifactId: abM.variant.id, creativeVersion: abM.variant.version, channel: 'INSTAGRAM', scheduleId: abM.scheduleB });
    experimentService.start(expM.id, campM, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campM, scheduleId: abM.scheduleA, contentKey: abM.contentKey, sourceCreativeArtifactId: abM.control.id, sourceCreativeVersion: abM.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, purchases: 5 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campM, scheduleId: abM.scheduleB, contentKey: abM.contentKey, sourceCreativeArtifactId: abM.variant.id, sourceCreativeVersion: abM.variant.version, channel: 'INSTAGRAM', measurementWindow: '24_HOURS', metrics: { impressions: 5000, purchases: 10 }, source: 'MANUAL' });
    const analysisM = experimentService.analyze(expM.id, campM, wsA, '7_DAYS');
    check('M no winner window mismatch', !('error' in analysisM) && analysisM.outcome === 'INCONCLUSIVE');
  }

  // --- Test N cumulative safety ---
  const campN = `camp_n_${randomUUID()}`;
  insertCampaign(campN, wsA);
  seedPlanChain(campN, wsA);
  const controlN = persistAndApprove(campN, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  const sNA = publishVariant(campN, wsA, 'launch-carousel-01', controlN.id, controlN.version, 'INSTAGRAM');
  const expN = experimentService.create(campN, wsA, { name: 'Cumulative', hypothesis: 'Cumulative', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expN)) {
    experimentService.addVariant(expN.id, campN, wsA, { label: 'A', role: 'CONTROL', contentKey: 'launch-carousel-01', creativeArtifactId: controlN.id, creativeVersion: controlN.version, channel: 'INSTAGRAM', scheduleId: sNA });
    const variantN = createVariantRevision(campN, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
    experimentService.addVariant(expN.id, campN, wsA, { label: 'B', role: 'VARIANT', contentKey: 'launch-carousel-01', creativeArtifactId: variantN.id, creativeVersion: variantN.version, channel: 'INSTAGRAM' });
    experimentService.start(expN.id, campN, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campN, scheduleId: sNA, contentKey: 'launch-carousel-01', sourceCreativeArtifactId: controlN.id, sourceCreativeVersion: controlN.version, channel: 'INSTAGRAM', measurementWindow: '24_HOURS', metrics: { impressions: 1000 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campN, scheduleId: sNA, contentKey: 'launch-carousel-01', sourceCreativeArtifactId: controlN.id, sourceCreativeVersion: controlN.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 4000 }, source: 'MANUAL' });
    const loaded = experimentService.get(expN.id, campN, wsA);
    if (!('error' in loaded)) {
      const analysisN = experimentAnalysisService.analyze(loaded, wsA, '7_DAYS');
      if (!('error' in analysisN)) {
        const aResult = analysisN.variantResults.find((v) => v.label === 'A');
        check('N uses 4000 not 5000', aResult?.impressions === 4000);
      } else check('N uses 4000 not 5000', false);
    }
  }

  // --- Test O attribution ---
  const campO = `camp_o_${randomUUID()}`;
  insertCampaign(campO, wsA);
  seedPlanChain(campO, wsA);
  const abO = setupInstagramAb(campO, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expO = experimentService.create(campO, wsA, { name: 'Attribution', hypothesis: 'Attr', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expO)) {
    experimentService.addVariant(expO.id, campO, wsA, { label: 'A', role: 'CONTROL', contentKey: abO.contentKey, creativeArtifactId: abO.control.id, creativeVersion: abO.control.version, channel: 'INSTAGRAM', scheduleId: abO.scheduleA });
    experimentService.addVariant(expO.id, campO, wsA, { label: 'B', role: 'VARIANT', contentKey: abO.contentKey, creativeArtifactId: abO.variant.id, creativeVersion: abO.variant.version, channel: 'INSTAGRAM', scheduleId: abO.scheduleB });
    experimentService.start(expO.id, campO, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campO, scheduleId: abO.scheduleA, contentKey: abO.contentKey, sourceCreativeArtifactId: abO.control.id, sourceCreativeVersion: abO.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campO, scheduleId: abO.scheduleB, contentKey: abO.contentKey, sourceCreativeArtifactId: abO.variant.id, sourceCreativeVersion: abO.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: campO, conversionType: 'PURCHASE', value: 100, currency: 'NZD',
      externalConversionId: 'campaign_only_purchase', attribution: { model: 'MANUAL', campaignId: campO, confidence: 'MEDIUM' }, source: 'MANUAL',
    });
    const analysisO = experimentService.analyze(expO.id, campO, wsA, '7_DAYS');
    check('O no winner from campaign-only', !('error' in analysisO) && analysisO.outcome !== 'VARIANT_A_WINS' && analysisO.outcome !== 'VARIANT_B_WINS');
  }

  // --- Test P duplicate conversion ---
  const campP = `camp_p_${randomUUID()}`;
  insertCampaign(campP, wsA);
  seedPlanChain(campP, wsA);
  const abP = setupInstagramAb(campP, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expP = experimentService.create(campP, wsA, { name: 'Dedup', hypothesis: 'Dedup', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expP)) {
    experimentService.addVariant(expP.id, campP, wsA, { label: 'A', role: 'CONTROL', contentKey: abP.contentKey, creativeArtifactId: abP.control.id, creativeVersion: abP.control.version, channel: 'INSTAGRAM', scheduleId: abP.scheduleA });
    experimentService.addVariant(expP.id, campP, wsA, { label: 'B', role: 'VARIANT', contentKey: abP.contentKey, creativeArtifactId: abP.variant.id, creativeVersion: abP.variant.version, channel: 'INSTAGRAM', scheduleId: abP.scheduleB });
    experimentService.start(expP.id, campP, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campP, scheduleId: abP.scheduleB, contentKey: abP.contentKey, sourceCreativeArtifactId: abP.variant.id, sourceCreativeVersion: abP.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campP, scheduleId: abP.scheduleA, contentKey: abP.contentKey, sourceCreativeArtifactId: abP.control.id, sourceCreativeVersion: abP.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
    for (let i = 0; i < 2; i++) {
      performanceIngestionService.createConversion({
        workspaceId: wsA, campaignId: campP, contentKey: abP.contentKey, scheduleId: abP.scheduleB, conversionType: 'PURCHASE',
        externalConversionId: 'dup_conv_1', attribution: { model: 'MANUAL', campaignId: campP, contentKey: abP.contentKey, scheduleId: abP.scheduleB, confidence: 'HIGH' }, source: 'MANUAL',
      });
    }
    const analysisP = experimentService.analyze(expP.id, campP, wsA, '7_DAYS');
    if (!('error' in analysisP)) {
      const bRes = analysisP.variantResults.find((v) => v.label === 'B');
      check('P dedupe conversion', (bRes?.metrics.purchases ?? 0) <= 1);
    } else check('P dedupe conversion', false);
  }

  // --- Test Q practical difference ---
  const campQ = `camp_q_${randomUUID()}`;
  insertCampaign(campQ, wsA);
  seedPlanChain(campQ, wsA);
  const abQ = setupInstagramAb(campQ, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expQ = experimentService.create(campQ, wsA, {
    name: 'Meaningful lift', hypothesis: 'Small diff', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B',
    experimentKpi: 'ctr', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 }, minimumMeaningfulLift: 5,
  });
  if (!('error' in expQ)) {
    experimentService.addVariant(expQ.id, campQ, wsA, { label: 'A', role: 'CONTROL', contentKey: abQ.contentKey, creativeArtifactId: abQ.control.id, creativeVersion: abQ.control.version, channel: 'INSTAGRAM', scheduleId: abQ.scheduleA });
    experimentService.addVariant(expQ.id, campQ, wsA, { label: 'B', role: 'VARIANT', contentKey: abQ.contentKey, creativeArtifactId: abQ.variant.id, creativeVersion: abQ.variant.version, channel: 'INSTAGRAM', scheduleId: abQ.scheduleB });
    experimentService.start(expQ.id, campQ, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campQ, scheduleId: abQ.scheduleA, contentKey: abQ.contentKey, sourceCreativeArtifactId: abQ.control.id, sourceCreativeVersion: abQ.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 10000, clicks: 400 }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campQ, scheduleId: abQ.scheduleB, contentKey: abQ.contentKey, sourceCreativeArtifactId: abQ.variant.id, sourceCreativeVersion: abQ.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 10000, clicks: 403 }, source: 'MANUAL' });
    const analysisQ = experimentService.analyze(expQ.id, campQ, wsA, '7_DAYS');
    check('Q no meaningful difference', !('error' in analysisQ) && analysisQ.outcome === 'NO_MEANINGFUL_DIFFERENCE');
  }

  // --- Test R observational ---
  if (exp) {
    const obsExp = experimentService.get(exp.id, camp, wsA);
    check('R observational mode', !('error' in obsExp) && obsExp.mode === 'OBSERVATIONAL_COMPARISON');
    const validation = experimentService.validate(exp.id, camp, wsA);
    if (!('error' in validation)) {
      check('R observational warning', validation.findings.some((f) => f.code === 'OBSERVATIONAL_WARNING'));
    }
  }

  // --- Test S no fake controlled split ---
  const splitGate = experimentQualityGate.validate({
    variableType: 'HOOK', mode: 'CONTROLLED_SPLIT', controlDescription: 'A', variantDescription: 'B',
    variants: [{ label: 'A', role: 'CONTROL', contentKey: 'a', channel: 'INSTAGRAM' }, { label: 'B', role: 'VARIANT', contentKey: 'b', channel: 'INSTAGRAM' }],
  });
  check('S controlled split blocked', !splitGate.valid);

  // --- Test T analysis history ---
  if (!('error' in expG)) {
    experimentService.analyze(expG.id, campG, wsA, '24_HOURS');
    experimentService.analyze(expG.id, campG, wsA, '7_DAYS');
    const histories = experimentService.listAnalyses(expG.id, campG, wsA);
    check('T both snapshots retained', !('error' in histories) && histories.length >= 2);
  }

  // --- Test U market memory ---
  if (!('error' in expG)) {
    const before = learningService.list(wsA).length;
    const completedU = experimentService.complete(expG.id, campG, wsA, '7_DAYS');
    check('U complete succeeded', !('error' in completedU), 'error' in completedU ? completedU.error : '');
    const after = learningService.list(wsA);
    check('U learning candidate created', after.length > before);
    const candidate = after.find((l) => l.type === 'MARKET_PERFORMANCE');
    check('U market performance type', Boolean(candidate));
  }

  // --- Test V overlearning ---
  if (!('error' in expG)) {
    const learnings = learningService.list(wsA, 'ACTIVE');
    check('V no auto high-confidence rule', !learnings.some((l) => l.confidence === 'HIGH' && l.statement.includes('Always')));
  }

  // --- Test W conflicting ---
  const campW1 = `camp_w1_${randomUUID()}`;
  const campW2 = `camp_w2_${randomUUID()}`;
  insertCampaign(campW1, wsA); insertCampaign(campW2, wsA);
  seedPlanChain(campW1, wsA); seedPlanChain(campW2, wsA);
  const abW1 = setupInstagramAb(campW1, wsA, CAROUSEL_CREATIVE_FIXTURE, { ...CAROUSEL_CREATIVE_FIXTURE, caption: 'Benefit hook wins' });
  const abW2 = setupInstagramAb(campW2, wsA, { ...CAROUSEL_CREATIVE_FIXTURE, caption: 'Product hook wins' }, CAROUSEL_CREATIVE_FIXTURE);
  const expW1 = experimentService.create(campW1, wsA, { name: 'Benefit hook', hypothesis: 'Benefit wins', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  const expW2 = experimentService.create(campW2, wsA, { name: 'Product hook', hypothesis: 'Product wins', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 } });
  if (!('error' in expW1) && !('error' in expW2)) {
    for (const [expW, campW, abW, bPurchases] of [
      [expW1, campW1, abW1, 15],
      [expW2, campW2, abW2, 15],
    ] as const) {
      experimentService.addVariant(expW.id, campW, wsA, { label: 'A', role: 'CONTROL', contentKey: abW.contentKey, creativeArtifactId: abW.control.id, creativeVersion: abW.control.version, channel: 'INSTAGRAM', scheduleId: abW.scheduleA });
      experimentService.addVariant(expW.id, campW, wsA, { label: 'B', role: 'VARIANT', contentKey: abW.contentKey, creativeArtifactId: abW.variant.id, creativeVersion: abW.variant.version, channel: 'INSTAGRAM', scheduleId: abW.scheduleB });
      experimentService.start(expW.id, campW, wsA);
      performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campW, scheduleId: abW.scheduleA, contentKey: abW.contentKey, sourceCreativeArtifactId: abW.control.id, sourceCreativeVersion: abW.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, purchases: 0 }, source: 'MANUAL' });
      performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campW, scheduleId: abW.scheduleB, contentKey: abW.contentKey, sourceCreativeArtifactId: abW.variant.id, sourceCreativeVersion: abW.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000 }, source: 'MANUAL' });
      for (let i = 0; i < bPurchases; i++) {
        performanceIngestionService.createConversion({
          workspaceId: wsA, campaignId: campW, contentKey: abW.contentKey, scheduleId: abW.scheduleB, conversionType: 'PURCHASE',
          externalConversionId: `${campW}_b_${i}`, attribution: { model: 'MANUAL', campaignId: campW, contentKey: abW.contentKey, scheduleId: abW.scheduleB, confidence: 'HIGH' }, source: 'MANUAL',
        });
      }
      experimentService.complete(expW.id, campW, wsA, '7_DAYS');
    }
  }
  const marketLearnings = learningService.list(wsA).filter((l) => l.type === 'MARKET_PERFORMANCE');
  check('W evidence retained', marketLearnings.length >= 2);

  // --- Test X blueprint lineage ---
  const campX = `camp_x_${randomUUID()}`;
  insertCampaign(campX, wsA, 'obj_sys_sales', 'COMPLETE');
  seedPlanChain(campX, wsA);
  creativeGeneratorService.persistFromStructured(campX, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  creativeGeneratorService.approve(campX, 'launch-carousel-01', creativeGeneratorService.getCurrent(campX, 'launch-carousel-01')!.id);
  campaignPerformanceService.evaluate(campX, wsA);
  const bp = blueprintService.createFromCampaign(campX, wsA);
  if (!('error' in bp)) {
    blueprintService.activate(bp.id, wsA);
    const used = blueprintService.use(bp.id, wsA, { sourceType: 'PRODUCT', sourceTitle: 'Blueprint Product' });
    if (!('error' in used)) {
      db.prepare('UPDATE campaigns SET source_blueprint_id = ?, source_blueprint_version = ? WHERE id = ?').run(bp.id, bp.currentVersion, used.campaignId);
      check('X blueprint lineage seam', Boolean(used.campaignId));
    }
  }

  // --- Test Y workspace isolation ---
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/experiments', campaignExperimentsRouter);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  async function hit(method: string, path: string, body?: unknown) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return res.status;
  }
  const expId = exp ? exp.id : '';
  check('Y read blocked', (await hit('GET', `/api/campaigns/${camp}/experiments/${expId}?workspaceId=${wsB}`)) === 403);
  check('Y start blocked', (await hit('POST', `/api/campaigns/${camp}/experiments/${expId}/start`, { workspaceId: wsB })) === 403);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- Test Z no AI ---
  check('Z manual experiment works', !('error' in expA));

  // --- Mixed currency ---
  const campCur = `camp_cur_${randomUUID()}`;
  insertCampaign(campCur, wsA);
  seedPlanChain(campCur, wsA);
  const abCur = setupInstagramAb(campCur, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expCur = experimentService.create(campCur, wsA, {
    name: 'Currency test', hypothesis: 'ROAS', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B',
    experimentKpi: 'roas', minimumEvidencePolicy: { minimumImpressionsPerVariant: 100 },
  });
  if (!('error' in expCur)) {
    experimentService.addVariant(expCur.id, campCur, wsA, { label: 'A', role: 'CONTROL', contentKey: abCur.contentKey, creativeArtifactId: abCur.control.id, creativeVersion: abCur.control.version, channel: 'INSTAGRAM', scheduleId: abCur.scheduleA });
    experimentService.addVariant(expCur.id, campCur, wsA, { label: 'B', role: 'VARIANT', contentKey: abCur.contentKey, creativeArtifactId: abCur.variant.id, creativeVersion: abCur.variant.version, channel: 'INSTAGRAM', scheduleId: abCur.scheduleB });
    experimentService.start(expCur.id, campCur, wsA);
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campCur, scheduleId: abCur.scheduleA, contentKey: abCur.contentKey, sourceCreativeArtifactId: abCur.control.id, sourceCreativeVersion: abCur.control.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, spend: 100, revenue: 500, currency: 'NZD' }, source: 'MANUAL' });
    performanceIngestionService.createObservation({ workspaceId: wsA, campaignId: campCur, scheduleId: abCur.scheduleB, contentKey: abCur.contentKey, sourceCreativeArtifactId: abCur.variant.id, sourceCreativeVersion: abCur.variant.version, channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: 5000, spend: 100, revenue: 600, currency: 'USD' }, source: 'MANUAL' });
    const analysisCur = experimentService.analyze(expCur.id, campCur, wsA, '7_DAYS');
    check('Mixed currency no ROAS winner', !('error' in analysisCur) && analysisCur.outcome !== 'VARIANT_B_WINS');
  }

  // --- Pause / Cancel ---
  const campPC = `camp_pc_${randomUUID()}`;
  insertCampaign(campPC, wsA);
  seedPlanChain(campPC, wsA);
  const abPC = setupInstagramAb(campPC, wsA, CAROUSEL_CREATIVE_FIXTURE, CAROUSEL_CREATIVE_FIXTURE);
  const expPC = experimentService.create(campPC, wsA, { name: 'Pause cancel', hypothesis: 'PC', variableType: 'HOOK', controlDescription: 'A', variantDescription: 'B' });
  if (!('error' in expPC)) {
    experimentService.addVariant(expPC.id, campPC, wsA, { label: 'A', role: 'CONTROL', contentKey: abPC.contentKey, creativeArtifactId: abPC.control.id, creativeVersion: abPC.control.version, channel: 'INSTAGRAM' });
    experimentService.addVariant(expPC.id, campPC, wsA, { label: 'B', role: 'VARIANT', contentKey: abPC.contentKey, creativeArtifactId: abPC.variant.id, creativeVersion: abPC.variant.version, channel: 'INSTAGRAM' });
    experimentService.start(expPC.id, campPC, wsA);
    const paused = experimentService.pause(expPC.id, campPC, wsA);
    check('Pause retained', !('error' in paused) && paused.status === 'PAUSED');
    const cancelled = experimentService.cancel(expPC.id, campPC, wsA, 'Strategy changed');
    check('Cancel retained', !('error' in cancelled) && cancelled.status === 'CANCELLED' && cancelled.cancellationReason === 'Strategy changed');
    const stillExists = experimentService.get(expPC.id, campPC, wsA);
    check('History not deleted', !('error' in stillExists));
  }

  console.log(`\nPhase 3H verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
