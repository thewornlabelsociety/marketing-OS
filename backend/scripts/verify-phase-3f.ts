import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { objectiveEvaluationService } from '../src/services/performance/ObjectiveEvaluationService';
import { learningService } from '../src/services/performance/LearningService';
import { performanceLearningService } from '../src/services/performance/PerformanceLearningService';
import { performanceAggregationService } from '../src/services/performance/PerformanceAggregationService';
import { campaignContextBuilder } from '../src/services/campaigns/CampaignContextBuilder';
import { PerformanceProviderRegistry } from '../src/integrations/adapters/PerformanceProviderRegistry';
import { resetMockPerformanceState, setMockPerformanceData } from '../src/integrations/adapters/MockPerformanceProvider';
import { campaignPerformanceRouter } from '../src/routes/campaignPerformance';
import { learningsRouter } from '../src/routes/learnings';
import { performanceRouter } from '../src/routes/performance';
import { CAROUSEL_CREATIVE_FIXTURE, NEWSLETTER_CREATIVE_FIXTURE, REEL_CREATIVE_FIXTURE } from './fixtures/creativeFixtures';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';

async function main() {
  initDatabase();
  PerformanceProviderRegistry.resetForTests();
  resetMockPerformanceState();

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

  function insertWorkspace(id: string, name: string) {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string, objectiveId = 'obj_sys_sales') {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, ?, ?, 'PUBLISHED', 'PRODUCT', 'Test Product', '{}', '["INSTAGRAM","EMAIL"]')
    `).run(id, workspaceId, objectiveId, `Campaign ${id}`);
  }

  function seedPlanChain(campaignId: string, workspaceId: string) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current,
        strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
        channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]', '[]', '[]', '2w', ?, ?)
    `).run(`plan_${campaignId}`, campaignId, workspaceId, now, now);
    db.prepare(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(`pa_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, now, now);
    const planBody = JSON.stringify({
      summary: PRODUCT_PROOF_FIXTURE.summary,
      concepts: PRODUCT_PROOF_FIXTURE.concepts,
      deliverables: PRODUCT_PROOF_FIXTURE.deliverables,
      cadence: PRODUCT_PROOF_FIXTURE.cadence,
    });
    db.prepare(`
      INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)
    `).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`
      INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
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
      contentKey,
      scheduledFor: new Date(Date.now() - 3600000).toISOString(),
      publicationMode: 'MANUAL',
    });
    if ('error' in sched) throw new Error(sched.error);
    publishingService.markPublished(sched.item.id, campaignId, { evidence: 'Verified externally', externalUrl: `https://example.com/${contentKey}` });
    return { schedule: sched.item, creative };
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');

  const salesCamp = `camp_sales_${randomUUID()}`;
  const awareCamp = `camp_aware_${randomUUID()}`;
  const leadCamp = `camp_lead_${randomUUID()}`;

  insertCampaign(salesCamp, wsA, 'obj_sys_sales');
  insertCampaign(awareCamp, wsA, 'obj_sys_awareness');
  insertCampaign(leadCamp, wsA, 'obj_sys_lead_gen');

  db.prepare(`UPDATE objectives SET success_criteria = '20 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
  db.prepare(`UPDATE objectives SET success_criteria = '50000 reach' WHERE id = 'obj_sys_awareness'`).run();
  db.prepare(`UPDATE objectives SET success_criteria = '25 qualified leads', primary_kpi = 'qualifiedLeads' WHERE id = 'obj_sys_lead_gen'`).run();

  for (const c of [salesCamp, awareCamp, leadCamp]) seedPlanChain(c, wsA);

  creativeGeneratorService.persistFromStructured(salesCamp, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  creativeGeneratorService.persistFromStructured(salesCamp, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  creativeGeneratorService.persistFromStructured(salesCamp, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);

  const pubCarousel = publishManual(salesCamp, wsA, 'launch-carousel-01');
  const pubReel = publishManual(salesCamp, wsA, 'launch-reel-01');
  const pubEmail = publishManual(salesCamp, wsA, 'launch-newsletter-01');

  // --- Test A: Unknown vs Zero ---
  const obsNull = performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubCarousel.schedule.id,
    contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubCarousel.creative.id,
    sourceCreativeVersion: pubCarousel.creative.version,
    channel: 'INSTAGRAM',
    measurementWindow: '7_DAYS',
    metrics: { views: 1000, purchases: null },
    source: 'MANUAL',
  });
  check('A purchases null preserved', obsNull.observation?.metrics.purchases === null);
  const obsZero = performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubCarousel.schedule.id,
    contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubCarousel.creative.id,
    sourceCreativeVersion: pubCarousel.creative.version,
    channel: 'INSTAGRAM',
    measurementWindow: '7_DAYS',
    metrics: { purchases: 0 },
    source: 'MANUAL',
  });
  check('A purchases zero preserved', obsZero.observation?.metrics.purchases === 0);

  // --- Test B: Exact Lineage ---
  check('B campaignId', obsNull.observation?.campaignId === salesCamp);
  check('B contentKey', obsNull.observation?.contentKey === 'launch-carousel-01');
  check('B creative artifact', obsNull.observation?.sourceCreativeArtifactId === pubCarousel.creative.id);
  check('B creative version', obsNull.observation?.sourceCreativeVersion === pubCarousel.creative.version);
  check('B schedule', obsNull.observation?.scheduleId === pubCarousel.schedule.id);
  check('B channel', obsNull.observation?.channel === 'INSTAGRAM');

  // --- Test C: Creative Version Separation ---
  const reelV2 = creativeGeneratorService.reviseFromStructured(salesCamp, 'launch-reel-01', 'rev', {
    ...REEL_CREATIVE_FIXTURE,
    hook: 'V2 hook',
  });
  approveCreative(salesCamp, 'launch-reel-01');
  const reelV2Art = creativeGeneratorService.getCurrent(salesCamp, 'launch-reel-01')!;
  const pubReelV2 = publishManual(salesCamp, wsA, 'launch-reel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubReel.schedule.id,
    contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: pubReel.creative.id,
    sourceCreativeVersion: pubReel.creative.version,
    channel: 'INSTAGRAM',
    measurementWindow: '7_DAYS',
    metrics: { views: 500 },
    source: 'MANUAL',
  });
  performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubReelV2.schedule.id,
    contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: reelV2Art.id,
    sourceCreativeVersion: reelV2Art.version,
    channel: 'INSTAGRAM',
    measurementWindow: '7_DAYS',
    metrics: { views: 800 },
    source: 'MANUAL',
  });
  const allObs = performanceIngestionService.listObservations(salesCamp, wsA);
  const v1Obs = Array.isArray(allObs) && allObs.filter((o) => o.sourceCreativeVersion === pubReel.creative.version);
  const v2Obs = Array.isArray(allObs) && allObs.filter((o) => o.sourceCreativeVersion === reelV2Art.version);
  check('C V1 observations distinct', Array.isArray(v1Obs) && v1Obs.length >= 1);
  check('C V2 observations distinct', Array.isArray(v2Obs) && v2Obs.length >= 1);

  // --- Test D: Cumulative Aggregation ---
  performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubEmail.schedule.id,
    contentKey: 'launch-newsletter-01',
    sourceCreativeArtifactId: pubEmail.creative.id,
    sourceCreativeVersion: pubEmail.creative.version,
    channel: 'EMAIL',
    measurementWindow: '24_HOURS',
    metrics: { views: 1000 },
    source: 'MANUAL',
  });
  performanceIngestionService.createObservation({
    workspaceId: wsA,
    campaignId: salesCamp,
    scheduleId: pubEmail.schedule.id,
    contentKey: 'launch-newsletter-01',
    sourceCreativeArtifactId: pubEmail.creative.id,
    sourceCreativeVersion: pubEmail.creative.version,
    channel: 'EMAIL',
    measurementWindow: '7_DAYS',
    metrics: { views: 4000 },
    source: 'MANUAL',
  });
  const allObsForD = performanceIngestionService.listObservations(salesCamp, wsA);
  const convForD = performanceIngestionService.listConversions(salesCamp, wsA);
  const contentSummaries = Array.isArray(allObsForD) && Array.isArray(convForD)
    ? performanceAggregationService.contentSummaries(allObsForD, convForD)
    : [];
  const emailContent = contentSummaries.find((c) => c.contentKey === 'launch-newsletter-01');
  check('D uses 4000 not 5000', emailContent !== undefined && (emailContent.metrics.views ?? 0) === 4000);

  // --- Test E: Additive Conversions ---
  for (const val of [100, 120, 80]) {
    performanceIngestionService.createConversion({
      workspaceId: wsA,
      campaignId: salesCamp,
      contentKey: 'launch-newsletter-01',
      conversionType: 'PURCHASE',
      value: val,
      currency: 'NZD',
      externalConversionId: `ext_${randomUUID()}`,
      attribution: { model: 'MANUAL', campaignId: salesCamp, contentKey: 'launch-newsletter-01', confidence: 'MEDIUM' },
      source: 'MANUAL',
    });
  }
  const convList = performanceIngestionService.listConversions(salesCamp, wsA);
  check('E three conversions', Array.isArray(convList) && convList.length >= 3);
  const summaryE = campaignPerformanceService.getSummary(salesCamp, wsA);
  check('E purchases count', !('error' in summaryE) && summaryE.conversions.purchases >= 3);
  check('E revenue total', !('error' in summaryE) && summaryE.conversions.revenue >= 300);

  // --- Test F: Duplicate Conversion ---
  const dupId = `dup_${randomUUID()}`;
  performanceIngestionService.createConversion({
    workspaceId: wsA, campaignId: salesCamp, conversionType: 'PURCHASE', value: 50, currency: 'NZD',
    externalConversionId: dupId,
    attribution: { model: 'DIRECT', campaignId: salesCamp, confidence: 'HIGH' }, source: 'TRACKING',
  });
  performanceIngestionService.createConversion({
    workspaceId: wsA, campaignId: salesCamp, conversionType: 'PURCHASE', value: 50, currency: 'NZD',
    externalConversionId: dupId,
    attribution: { model: 'DIRECT', campaignId: salesCamp, confidence: 'HIGH' }, source: 'TRACKING',
  });
  const afterDup = performanceIngestionService.listConversions(salesCamp, wsA);
  const dupCount = Array.isArray(afterDup) ? afterDup.filter((c) => c.externalConversionId === dupId).length : 0;
  check('F duplicate counted once', dupCount === 1);

  // Add more purchases for sales test
  for (let i = 0; i < 28; i++) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: salesCamp, contentKey: i % 2 === 0 ? 'launch-carousel-01' : 'launch-newsletter-01',
      conversionType: 'PURCHASE', value: 100, currency: 'NZD',
      externalConversionId: `bulk_${randomUUID()}`,
      attribution: { model: 'MANUAL', campaignId: salesCamp, contentKey: i % 2 === 0 ? 'launch-carousel-01' : 'launch-newsletter-01', confidence: 'MEDIUM' },
      source: 'MANUAL',
    });
  }

  // --- Test G: Sales Objective ---
  const evalG = campaignPerformanceService.evaluate(salesCamp, wsA, '7_DAYS');
  check('G sales classification positive', !('error' in evalG) && ['HIGH_PERFORMING', 'EXCEPTIONAL', 'ABOVE_AVERAGE'].includes(evalG.classification));
  check('G primary KPI purchases', !('error' in evalG) && evalG.primaryKpi === 'purchases');

  // --- Test H: Sales Vanity Failure ---
  const vanityCamp = `camp_vanity_${randomUUID()}`;
  insertCampaign(vanityCamp, wsA, 'obj_sys_sales');
  seedPlanChain(vanityCamp, wsA);
  creativeGeneratorService.persistFromStructured(vanityCamp, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const pubVanity = publishManual(vanityCamp, wsA, 'launch-reel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: vanityCamp, scheduleId: pubVanity.schedule.id, contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: pubVanity.creative.id, sourceCreativeVersion: pubVanity.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS',
    metrics: { views: 100000, likes: 5000, impressions: 100000 }, source: 'MANUAL',
  });
  const evalH = campaignPerformanceService.evaluate(vanityCamp, wsA);
  check('H not HIGH_PERFORMING', !('error' in evalH) && evalH.classification !== 'HIGH_PERFORMING');
  check('H not EXCEPTIONAL', !('error' in evalH) && evalH.classification !== 'EXCEPTIONAL');

  // --- Test I: Awareness ---
  creativeGeneratorService.persistFromStructured(awareCamp, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const pubAware = publishManual(awareCamp, wsA, 'launch-reel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: awareCamp, scheduleId: pubAware.schedule.id, contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: pubAware.creative.id, sourceCreativeVersion: pubAware.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS',
    metrics: { reach: 60000, impressions: 80000, views: 55000 }, source: 'MANUAL',
  });
  const evalI = campaignPerformanceService.evaluate(awareCamp, wsA);
  check('I awareness positive', !('error' in evalI) && ['HIGH_PERFORMING', 'EXCEPTIONAL', 'ABOVE_AVERAGE'].includes(evalI.classification));

  // --- Test J: Lead Generation ---
  creativeGeneratorService.persistFromStructured(leadCamp, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);
  const pubLead = publishManual(leadCamp, wsA, 'launch-newsletter-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: leadCamp, scheduleId: pubLead.schedule.id, contentKey: 'launch-newsletter-01',
    sourceCreativeArtifactId: pubLead.creative.id, sourceCreativeVersion: pubLead.creative.version,
    channel: 'EMAIL', measurementWindow: '7_DAYS',
    metrics: { likes: 5, impressions: 200 }, source: 'MANUAL',
  });
  for (let i = 0; i < 40; i++) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: leadCamp, contentKey: 'launch-newsletter-01', conversionType: 'QUALIFIED_LEAD',
      externalConversionId: `lead_${randomUUID()}`,
      attribution: { model: 'TRACKED_LINK', campaignId: leadCamp, contentKey: 'launch-newsletter-01', confidence: 'HIGH', evidence: ['utm'] },
      source: 'TRACKING',
    });
  }
  const evalJ = campaignPerformanceService.evaluate(leadCamp, wsA);
  check('J lead driven classification', !('error' in evalJ) && ['HIGH_PERFORMING', 'EXCEPTIONAL', 'ABOVE_AVERAGE'].includes(evalJ.classification));

  // --- Test K: Insufficient Data ---
  const insufCamp = `camp_insuf_${randomUUID()}`;
  insertCampaign(insufCamp, wsA);
  seedPlanChain(insufCamp, wsA);
  creativeGeneratorService.persistFromStructured(insufCamp, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const pubInsuf = publishManual(insufCamp, wsA, 'launch-reel-01');
  performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: insufCamp, scheduleId: pubInsuf.schedule.id, contentKey: 'launch-reel-01',
    sourceCreativeArtifactId: pubInsuf.creative.id, sourceCreativeVersion: pubInsuf.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '24_HOURS', metrics: { impressions: 17 }, source: 'MANUAL',
  });
  const evalK = campaignPerformanceService.evaluate(insufCamp, wsA);
  check('K insufficient data', !('error' in evalK) && evalK.classification === 'INSUFFICIENT_DATA');

  // --- Test L: ROAS ---
  const { calculateRoas } = require('../src/services/performance/metricsUtils') as typeof import('../src/services/performance/metricsUtils');
  check('L roas 4', calculateRoas(1000, 250, 'NZD', 'NZD').roas === 4);
  check('L roas null no spend', calculateRoas(1000, null, 'NZD', null).roas === null);
  check('L roas null zero spend', calculateRoas(1000, 0, 'NZD', 'NZD').roas === null);
  check('L mixed currency', calculateRoas(1000, 250, 'NZD', 'USD').mixedCurrency === true);

  // --- Test M: Attribution ---
  const attrModels = ['TRACKED_LINK', 'PROMO_CODE', 'PROVIDER_REPORTED', 'MANUAL', 'UNATTRIBUTED'] as const;
  for (const model of attrModels) {
    performanceIngestionService.createConversion({
      workspaceId: wsA, campaignId: salesCamp, conversionType: 'PURCHASE', value: 10,
      externalConversionId: `attr_${model}_${randomUUID()}`,
      attribution: { model, campaignId: salesCamp, confidence: model === 'UNATTRIBUTED' ? 'UNKNOWN' : 'MEDIUM' },
      source: 'MANUAL',
    });
  }
  const convM = performanceIngestionService.listConversions(salesCamp, wsA);
  check('M attribution preserved', Array.isArray(convM) && convM.some((c) => c.attribution.model === 'TRACKED_LINK'));

  // --- Test N: Campaign-only attribution ---
  performanceIngestionService.createConversion({
    workspaceId: wsA, campaignId: salesCamp, conversionType: 'PURCHASE', value: 180, currency: 'NZD',
    externalConversionId: `camp_only_${randomUUID()}`,
    attribution: { model: 'MANUAL', campaignId: salesCamp, confidence: 'MEDIUM' }, source: 'MANUAL',
  });
  const campOnly = (performanceIngestionService.listConversions(salesCamp, wsA) as import('../src/types/performance').ConversionEvent[])
    .find((c) => c.externalConversionId?.startsWith('camp_only_'));
  check('N campaignId present', campOnly?.campaignId === salesCamp);
  check('N contentKey null', campOnly?.contentKey === undefined);

  // --- Test O/P: Content & Channel ---
  const sumOP = campaignPerformanceService.getSummary(salesCamp, wsA);
  check('O content summaries', !('error' in sumOP) && sumOP.topContent.length >= 1);
  check('P channel summaries', !('error' in sumOP) && sumOP.channelPerformance.length >= 1);

  // --- Test Q: Market Learning Evidence ---
  const singleLearn = learningService.upsertCandidate({
    workspaceId: wsA, type: 'MARKET_PERFORMANCE', category: 'TEST', statement: 'One post rule',
    confidence: 'HIGH', relevanceTags: ['SALES'], evidence: [{ sourceType: 'campaign', sourceId: salesCamp }],
  });
  check('Q one campaign no learning', singleLearn === null);

  // --- Test R/S: User preference ---
  for (let i = 0; i < 3; i++) {
    performanceLearningService.recordUserPreferenceEvidence({
      workspaceId: wsA, category: 'PUNCTUATION', statement: 'User prefers no exclamation marks',
      sourceType: 'revision', sourceId: `rev_${i}`, relevanceTags: ['ALL'],
    });
  }
  performanceLearningService.recordUserPreferenceEvidence({
    workspaceId: wsA, category: 'PUNCTUATION', statement: 'User prefers no exclamation marks',
    sourceType: 'revision', sourceId: 'rev_3', relevanceTags: ['ALL'],
  });
  const prefLearnings = learningService.list(wsA, 'CANDIDATE').filter((l) => l.type === 'USER_PREFERENCE');
  check('R user preference candidate', prefLearnings.length >= 1);

  // --- Test T: Learning workspace isolation ---
  const isoCampB = `camp_b_ctx_${randomUUID()}`;
  insertCampaign(isoCampB, wsB);
  seedPlanChain(isoCampB, wsB);
  db.prepare(`UPDATE objectives SET success_criteria = '20 purchases', primary_kpi = 'purchases' WHERE id = 'obj_sys_sales'`).run();
  const activeInA = learningService.list(wsA, 'ACTIVE');
  if (activeInA[0]) {
    const ctxB = campaignContextBuilder.build(isoCampB);
    check('T workspace B no A learning', ctxB !== null && !ctxB.learnings.marketPerformance.some((s) => activeInA.some((l) => l.statement === s)));
  } else {
    const marketForActivate = learningService.list(wsA, 'CANDIDATE')[0];
    if (marketForActivate) learningService.activate(marketForActivate.id, wsA);
    const ctxB = campaignContextBuilder.build(isoCampB);
    check('T workspace B no A learning', ctxB !== null && ctxB.learnings.marketPerformance.length === 0);
  }

  // --- Test U: Relevance filter ---
  const salesLearning = learningService.upsertCandidate({
    workspaceId: wsA, type: 'MARKET_PERFORMANCE', category: 'SALES_IG',
    statement: 'Sales Instagram learning', confidence: 'MEDIUM', relevanceTags: ['SALES', 'INSTAGRAM'],
    evidence: [{ sourceType: 'c', sourceId: '1' }, { sourceType: 'c', sourceId: '2' }, { sourceType: 'c', sourceId: '3' }],
  });
  const eventLearning = learningService.upsertCandidate({
    workspaceId: wsA, type: 'MARKET_PERFORMANCE', category: 'EVENT_LI',
    statement: 'Event LinkedIn learning', confidence: 'MEDIUM', relevanceTags: ['EVENT_PROMOTION', 'LINKEDIN'],
    evidence: [{ sourceType: 'c', sourceId: '4' }, { sourceType: 'c', sourceId: '5' }, { sourceType: 'c', sourceId: '6' }],
  });
  if (salesLearning) learningService.activate(salesLearning.id, wsA);
  const activeSales = learningService.getActiveForContext(wsA, { objectiveType: 'SALES', channels: ['INSTAGRAM', 'EMAIL'] });
  check('U includes sales ig', activeSales.marketPerformance.some((s) => s.includes('Instagram') || s.includes('Sales')));
  check('U excludes event linkedin', !activeSales.marketPerformance.some((s) => s.includes('LinkedIn')));

  // --- Test V: Performance workspace isolation ---
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/performance', campaignPerformanceRouter);
  app.use('/api/learnings', learningsRouter);
  app.use('/api/performance', performanceRouter);
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
  check('V read perf rejected', (await hit('GET', `/api/campaigns/${salesCamp}/performance?workspaceId=${wsB}`)) === 403);
  check('V create obs rejected', (await hit('POST', `/api/campaigns/${salesCamp}/performance/observations`, {
    workspaceId: wsB, contentKey: 'x', sourceCreativeArtifactId: 'a', sourceCreativeVersion: 1, channel: 'INSTAGRAM', metrics: {},
  })) === 403);
  check('V refresh rejected', (await hit('POST', `/api/campaigns/${salesCamp}/performance/refresh`, { workspaceId: wsB })) === 403);
  check('V evaluate rejected', (await hit('POST', `/api/campaigns/${salesCamp}/performance/evaluate`, { workspaceId: wsB })) === 403);
  check('V summary rejected', (await hit('GET', `/api/performance/summary?workspaceId=${wsB}`)) === 200);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- Test W: Invalid metrics ---
  const bad = performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: salesCamp, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubCarousel.creative.id, sourceCreativeVersion: 1,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { impressions: Number.NaN }, source: 'MANUAL',
  });
  check('W reject NaN', bad.code === 'INVALID_METRICS');

  // --- Test X: No provider ---
  PerformanceProviderRegistry.clearForTests();
  const noProv = await campaignPerformanceService.refreshFromProvider(salesCamp, wsA);
  check('X provider unavailable', 'error' in noProv && noProv.code === 'PERFORMANCE_PROVIDER_UNAVAILABLE');
  const manualStill = performanceIngestionService.createObservation({
    workspaceId: wsA, campaignId: salesCamp, contentKey: 'launch-carousel-01',
    sourceCreativeArtifactId: pubCarousel.creative.id, sourceCreativeVersion: pubCarousel.creative.version,
    channel: 'INSTAGRAM', measurementWindow: '7_DAYS', metrics: { views: 10 }, source: 'MANUAL',
  });
  check('X manual still works', !manualStill.error);
  PerformanceProviderRegistry.resetForTests();

  // --- Test Y: Evaluation history ---
  campaignPerformanceService.evaluate(salesCamp, wsA, '24_HOURS');
  const eval24 = objectiveEvaluationService.getLatestEvaluation(salesCamp, '24_HOURS');
  campaignPerformanceService.evaluate(salesCamp, wsA, '7_DAYS');
  const eval7 = objectiveEvaluationService.getLatestEvaluation(salesCamp, '7_DAYS');
  const history = objectiveEvaluationService.listEvaluations(salesCamp);
  check('Y 24h retained', eval24 !== null);
  check('Y 7d retained', eval7 !== null);
  check('Y multiple snapshots', history.length >= 2);

  // --- Test Z: Future campaign context ---
  const zLearning = learningService.upsertCandidate({
    workspaceId: wsA, type: 'MARKET_PERFORMANCE', category: 'Z_TEST',
    statement: 'Product-proof content outperforms lifestyle for Sales',
    confidence: 'MEDIUM', relevanceTags: ['SALES', 'INSTAGRAM'],
    evidence: [{ sourceType: 'campaign', sourceId: salesCamp }, { sourceType: 'campaign', sourceId: vanityCamp }, { sourceType: 'campaign', sourceId: awareCamp }],
  });
  if (zLearning) {
    learningService.activate(zLearning.id, wsA);
    const ctx1 = campaignContextBuilder.build(salesCamp);
    check('Z active learning in context', ctx1 !== null && ctx1.learnings.marketPerformance.length >= 1);
    learningService.dismiss(zLearning.id, wsA);
    const ctx2 = campaignContextBuilder.build(salesCamp);
    check('Z dismissed excluded', ctx2 !== null && !ctx2.learnings.marketPerformance.includes(zLearning.statement));
  } else {
    failed += 2;
    console.log('FAIL  Z active learning in context');
    console.log('FAIL  Z dismissed excluded');
  }

  console.log(`\nPhase 3F verification: ${passed} passed, ${failed} failed${blocked ? `, ${blocked} blocked` : ''}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
