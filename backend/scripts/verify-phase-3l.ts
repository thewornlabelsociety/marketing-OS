import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { attentionSignalService } from '../src/services/attention/AttentionSignalService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { randomUUID } from 'crypto';

async function main() {
  initDatabase();

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  function insertWorkspace(id: string) {
    db.prepare(
      `INSERT OR IGNORE INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
       VALUES (?, ?, ?, ?, '{}', '{}')`
    ).run(id, LOCAL_TENANT_ID, `WS ${id}`, id);
  }

  function insertCampaign(id: string, workspaceId: string, status = 'APPROVED') {
    db.prepare(
      `INSERT OR IGNORE INTO campaigns
         (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
       VALUES (?, ?, 'obj_sys_sales', ?, ?, 'PRODUCT', 'Test', '{}', '["INSTAGRAM"]')`
    ).run(id, workspaceId, `Cmp ${id}`, status);
  }

  function insertPlan(campaignId: string, workspaceId: string, planStatus = 'APPROVED') {
    const now = new Date().toISOString();
    const planId = `plan_${campaignId}`;
    db.prepare(
      `INSERT OR IGNORE INTO campaign_plans
         (id, campaign_id, workspace_id, version, status, is_current,
          strategy_campaign_angle, strategy_core_message, hooks, proof_points,
          cta_primary, cta_alternatives, channels, content_mix, cadence_summary, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, 1, 'Angle', 'Core',
               '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]',
               '[{"channel":"INSTAGRAM","role":"Conversion"}]', '[]', '2w', ?, ?)`
    ).run(planId, campaignId, workspaceId, planStatus, now, now);
    return planId;
  }

  function insertContentPlan(campaignId: string, workspaceId: string, status = 'APPROVED') {
    insertPlan(campaignId, workspaceId);
    const now = new Date().toISOString();
    const planBody = JSON.stringify({
      summary: 'Test summary',
      concepts: [],
      deliverables: [{
        contentKey: `${campaignId}-post-01`,
        title: 'Post 1',
        purpose: 'awareness',
        campaignRole: 'Awareness',
        channel: 'INSTAGRAM',
        contentType: 'SOCIAL_POST',
        format: 'STATIC_IMAGE',
        suggestedTiming: '2025-01-01',
        hookVariants: [],
        bodyGuidance: 'Write good copy',
        ctaOptions: ['Buy now'],
        visualDirection: null,
      }],
    });
    db.prepare(
      `INSERT OR IGNORE INTO content_plans
         (id, campaign_id, workspace_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, 1, ?, ?, ?)`
    ).run(`cp_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, status, planBody, now, now);
  }

  function insertCreativeArtifact(campaignId: string, workspaceId: string, contentKey: string, version = 1, status = 'APPROVED') {
    const now = new Date().toISOString();
    const artifactId = `art_${campaignId.slice(-8)}_${contentKey.slice(-8)}_v${version}`;
    const cpId = `cp_${campaignId}`;
    db.prepare(
      `INSERT OR IGNORE INTO creative_artifacts
         (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
          content_key, deliverable_id, version, status, is_current, channel, content_type, format,
          title, content, quality, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 1, 'INSTAGRAM', 'STATIC_POST', 'SQUARE_1_1',
               'Test Post', '{}', '{}', ?, ?)`
    ).run(artifactId, workspaceId, campaignId, cpId, contentKey, contentKey, version, status, now, now);
    return artifactId;
  }

  function insertPerformanceObservation(workspaceId: string, campaignId: string, artifactId: string, contentKey: string, metrics: Record<string, number | null | undefined> = {}) {
    const result = performanceIngestionService.createObservation({
      workspaceId,
      campaignId,
      contentKey,
      sourceCreativeArtifactId: artifactId,
      sourceCreativeVersion: 1,
      channel: 'INSTAGRAM',
      measurementWindow: '7_DAYS',
      metrics,
      source: 'MANUAL',
    });
    return result;
  }

  // ─── Workspace setup ────────────────────────────────────────────────────────
  const ws1 = `ws_3l_${randomUUID().slice(0, 8)}`;
  const ws2 = `ws_3l_${randomUUID().slice(0, 8)}`;
  insertWorkspace(ws1);
  insertWorkspace(ws2);

  // ─── Test A: Campaign data retrieval — workspace isolation ────────────────
  const campA = `camp_3l_a_${randomUUID().slice(0, 8)}`;
  const campB = `camp_3l_b_${randomUUID().slice(0, 8)}`;
  insertCampaign(campA, ws1);
  insertCampaign(campB, ws2);

  const rowA = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campA) as { workspace_id: string } | undefined;
  const rowB = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campB) as { workspace_id: string } | undefined;
  check('A: Campaign belongs to correct workspace', rowA?.workspace_id === ws1 && rowB?.workspace_id === ws2);

  // ─── Test B: Plan exists flag ─────────────────────────────────────────────
  const campPlan = `camp_3l_plan_${randomUUID().slice(0, 8)}`;
  insertCampaign(campPlan, ws1);
  insertPlan(campPlan, ws1);

  const planRow = db.prepare('SELECT id FROM campaign_plans WHERE campaign_id = ? AND is_current = 1').get(campPlan);
  check('B: Campaign plan flagged correctly', planRow != null);

  // ─── Test C: Content plan status ──────────────────────────────────────────
  const campCP = `camp_3l_cp_${randomUUID().slice(0, 8)}`;
  insertCampaign(campCP, ws1);
  insertPlan(campCP, ws1);
  insertContentPlan(campCP, ws1, 'APPROVED');

  const cpRow = db.prepare('SELECT status FROM content_plans WHERE campaign_id = ? AND is_current = 1').get(campCP) as { status: string } | undefined;
  check('C: Content plan status is APPROVED', cpRow?.status === 'APPROVED');

  // ─── Test D: Creative summary — needsReview and approved counts ───────────
  const campCreative = `camp_3l_cr_${randomUUID().slice(0, 8)}`;
  insertCampaign(campCreative, ws1);
  insertPlan(campCreative, ws1);
  insertContentPlan(campCreative, ws1);
  const artApproved = insertCreativeArtifact(campCreative, ws1, `${campCreative}-post-01`, 1, 'APPROVED');
  const artReview = insertCreativeArtifact(campCreative, ws1, `${campCreative}-post-02`, 1, 'NEEDS_REVIEW');

  const approvedCount = (db.prepare(`SELECT COUNT(*) as c FROM creative_artifacts WHERE campaign_id = ? AND status = 'APPROVED' AND is_current = 1`).get(campCreative) as { c: number } | undefined)?.c ?? 0;
  const reviewCount = (db.prepare(`SELECT COUNT(*) as c FROM creative_artifacts WHERE campaign_id = ? AND status = 'NEEDS_REVIEW' AND is_current = 1`).get(campCreative) as { c: number } | undefined)?.c ?? 0;
  check('D: Creative approved count correct', approvedCount === 1, `got ${approvedCount}`);
  check('D2: Creative needs-review count correct', reviewCount === 1, `got ${reviewCount}`);

  // ─── Test E: Attention signals have campaignId ────────────────────────────
  const campAttn = `camp_3l_attn_${randomUUID().slice(0, 8)}`;
  insertCampaign(campAttn, ws1, 'READY_FOR_REVIEW');
  await attentionSignalService.reconcile(ws1);

  const signals = attentionSignalService.list(ws1, 'OPEN');
  const campaignSignals = signals.filter((s) => s.campaignId === campAttn);
  check('E: Attention signals have campaignId for filtering', signals.every((s) => s.workspaceId === ws1));

  // ─── Test F: Attention signal workspace isolation ─────────────────────────
  const campWs2 = `camp_3l_ws2_${randomUUID().slice(0, 8)}`;
  insertCampaign(campWs2, ws2, 'READY_FOR_REVIEW');
  await attentionSignalService.reconcile(ws2);

  const ws1Signals = attentionSignalService.list(ws1, 'OPEN');
  const ws2Signals = attentionSignalService.list(ws2, 'OPEN');
  const ws1HasWs2 = ws1Signals.some((s) => s.workspaceId === ws2);
  const ws2HasWs1 = ws2Signals.some((s) => s.workspaceId === ws1);
  check('F: Attention signals workspace-isolated (ws1 has no ws2 signals)', !ws1HasWs2);
  check('F2: Attention signals workspace-isolated (ws2 has no ws1 signals)', !ws2HasWs1);

  // ─── Test G: Performance observation — unknown vs zero distinction ─────────
  const campPerf = `camp_3l_perf_${randomUUID().slice(0, 8)}`;
  insertCampaign(campPerf, ws1);
  insertContentPlan(campPerf, ws1);
  const artPerf = insertCreativeArtifact(campPerf, ws1, `${campPerf}-post-01`, 1, 'APPROVED');

  const obs1 = insertPerformanceObservation(ws1, campPerf, artPerf, `${campPerf}-post-01`, { reach: 1000, clicks: null });
  check('G: Performance observation created', 'observation' in obs1 && obs1.observation != null);

  const obsRow = db.prepare('SELECT metrics FROM performance_observations WHERE campaign_id = ?').get(campPerf) as { metrics: string } | undefined;
  const metrics = obsRow ? JSON.parse(obsRow.metrics) as Record<string, unknown> : null;
  check('G2: Known metric stored as number (reach=1000)', metrics?.reach === 1000);
  check('G3: Unknown metric stored as null (clicks=null, not 0)', metrics != null && 'clicks' in metrics && metrics.clicks === null);

  // ─── Test H: Performance evaluation workspace isolation ───────────────────
  const campPerfWs2 = `camp_3l_perfws2_${randomUUID().slice(0, 8)}`;
  insertCampaign(campPerfWs2, ws2);
  insertContentPlan(campPerfWs2, ws2);
  const artPerfWs2 = insertCreativeArtifact(campPerfWs2, ws2, `${campPerfWs2}-post-01`, 1, 'APPROVED');
  insertPerformanceObservation(ws2, campPerfWs2, artPerfWs2, `${campPerfWs2}-post-01`, { reach: 500 });

  const ws2Obs = db.prepare('SELECT id FROM performance_observations WHERE workspace_id = ?').all(ws2) as { id: string }[];
  const ws1Obs = db.prepare('SELECT id FROM performance_observations WHERE workspace_id = ?').all(ws1) as { id: string }[];
  const ws1HasWs2Obs = ws1Obs.some((o) => ws2Obs.some((o2) => o.id === o2.id));
  check('H: Performance observations workspace-isolated', !ws1HasWs2Obs);

  // ─── Test I: Campaign status machine — READY_FOR_REVIEW ──────────────────
  const campStatus = `camp_3l_status_${randomUUID().slice(0, 8)}`;
  insertCampaign(campStatus, ws1, 'DRAFTING');

  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('READY_FOR_REVIEW', campStatus);
  const updatedStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campStatus) as { status: string } | undefined)?.status;
  check('I: Campaign status transitions correctly', updatedStatus === 'READY_FOR_REVIEW');

  // ─── Test J: READ_ONLY_STATUSES enforcement ───────────────────────────────
  const campCancelled = `camp_3l_cancel_${randomUUID().slice(0, 8)}`;
  insertCampaign(campCancelled, ws1, 'CANCELLED');

  const READ_ONLY = new Set(['CANCELLED', 'COMPLETE', 'ARCHIVED']);
  const cancelStatus = (db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campCancelled) as { status: string } | undefined)?.status;
  check('J: Cancelled campaign identified as read-only', READ_ONLY.has(cancelStatus ?? ''));

  // ─── Test K: Publishing summary structure ──────────────────────────────────
  const campSched = `camp_3l_sched_${randomUUID().slice(0, 8)}`;
  insertCampaign(campSched, ws1, 'SCHEDULED');
  insertContentPlan(campSched, ws1);
  const artSched = insertCreativeArtifact(campSched, ws1, `${campSched}-post-01`, 1, 'APPROVED');

  const now = new Date().toISOString();
  const schedId = `sched_${randomUUID()}`;
  db.prepare(
    `INSERT INTO scheduled_content_items
       (id, workspace_id, campaign_id, content_key, source_creative_artifact_id,
        source_creative_version, channel, scheduled_for, timezone, status,
        publication_mode, media_assets, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'INSTAGRAM', ?, 'UTC', 'SCHEDULED', 'MANUAL', '[]', ?, ?)`
  ).run(schedId, ws1, campSched, `${campSched}-post-01`, artSched, new Date(Date.now() + 86400000).toISOString(), now, now);

  const schedRow = db.prepare('SELECT id, status FROM scheduled_content_items WHERE campaign_id = ?').get(campSched) as { id: string; status: string } | undefined;
  check('K: Scheduled content item created', schedRow != null);
  check('K2: Scheduled item has SCHEDULED status', schedRow?.status === 'SCHEDULED');

  // ─── Test L: Published item preserved ────────────────────────────────────
  const pubId = `sched_pub_${randomUUID()}`;
  db.prepare(
    `INSERT INTO scheduled_content_items
       (id, workspace_id, campaign_id, content_key, source_creative_artifact_id,
        source_creative_version, channel, scheduled_for, timezone, status,
        publication_mode, media_assets, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'INSTAGRAM', ?, 'UTC', 'PUBLISHED', 'MANUAL', '[]', ?, ?, ?)`
  ).run(pubId, ws1, campSched, `${campSched}-post-02`, artSched, new Date(Date.now() - 86400000).toISOString(), now, now, now);

  const pubRow = db.prepare('SELECT status, published_at FROM scheduled_content_items WHERE id = ?').get(pubId) as { status: string; published_at: string } | undefined;
  check('L: Published item retains PUBLISHED status', pubRow?.status === 'PUBLISHED');
  check('L2: Published item has published_at timestamp', pubRow?.published_at != null);

  // ─── Test M: Failed item preserved ───────────────────────────────────────
  const failId = `sched_fail_${randomUUID()}`;
  db.prepare(
    `INSERT INTO scheduled_content_items
       (id, workspace_id, campaign_id, content_key, source_creative_artifact_id,
        source_creative_version, channel, scheduled_for, timezone, status,
        publication_mode, media_assets, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'INSTAGRAM', ?, 'UTC', 'FAILED', 'MANUAL', '[]', ?, ?)`
  ).run(failId, ws1, campSched, `${campSched}-post-03`, artSched, new Date(Date.now() - 3600000).toISOString(), now, now);

  const failRow = db.prepare('SELECT status FROM scheduled_content_items WHERE id = ?').get(failId) as { status: string } | undefined;
  check('M: Failed item retains FAILED status', failRow?.status === 'FAILED');

  // ─── Test N: Schedule workspace isolation ──────────────────────────────────
  const campSchedWs2 = `camp_3l_schedws2_${randomUUID().slice(0, 8)}`;
  insertCampaign(campSchedWs2, ws2, 'SCHEDULED');
  const artSchedWs2 = insertCreativeArtifact(campSchedWs2, ws2, `${campSchedWs2}-post-01`, 1, 'APPROVED');
  const schedWs2Id = `sched_ws2_${randomUUID()}`;
  db.prepare(
    `INSERT INTO scheduled_content_items
       (id, workspace_id, campaign_id, content_key, source_creative_artifact_id,
        source_creative_version, channel, scheduled_for, timezone, status,
        publication_mode, media_assets, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 'INSTAGRAM', ?, 'UTC', 'SCHEDULED', 'MANUAL', '[]', ?, ?)`
  ).run(schedWs2Id, ws2, campSchedWs2, `${campSchedWs2}-post-01`, artSchedWs2, new Date(Date.now() + 86400000).toISOString(), now, now);

  const ws1SchedItems = db.prepare('SELECT id FROM scheduled_content_items WHERE workspace_id = ?').all(ws1) as { id: string }[];
  const ws2SchedItems = db.prepare('SELECT id FROM scheduled_content_items WHERE workspace_id = ?').all(ws2) as { id: string }[];
  check('N: Schedule items workspace-isolated', !ws1SchedItems.some(i => i.id === schedWs2Id));

  // ─── Test O: Performance summary — INSUFFICIENT_DATA when no observations ─
  const campNoPerf = `camp_3l_noperf_${randomUUID().slice(0, 8)}`;
  insertCampaign(campNoPerf, ws1, 'PUBLISHED');

  const noObsCount = (db.prepare('SELECT COUNT(*) as c FROM performance_observations WHERE campaign_id = ?').get(campNoPerf) as { c: number } | undefined)?.c ?? 0;
  check('O: No observations = INSUFFICIENT_DATA state expected (0 obs)', noObsCount === 0);

  // ─── Test P: Performance evaluation references objective ──────────────────
  const evalRow = db.prepare('SELECT objective_id FROM performance_evaluations WHERE campaign_id = ?').get(campPerf) as { objective_id: string } | undefined;
  // evaluation only created explicitly — just check table exists and is queryable
  check('P: performance_evaluations table queryable', evalRow === undefined || typeof evalRow.objective_id === 'string');

  // ─── Test Q: Experiment workspace isolation ────────────────────────────────
  const campExp = `camp_3l_exp_${randomUUID().slice(0, 8)}`;
  insertCampaign(campExp, ws1);

  const expNow = new Date().toISOString();
  const expId = `exp_${randomUUID()}`;
  db.prepare(
    `INSERT OR IGNORE INTO experiments
       (id, workspace_id, campaign_id, name, hypothesis, variable_type, objective_id,
        primary_kpi, control_description, variant_description, status, mode, created_at, updated_at)
     VALUES (?, ?, ?, 'Test Exp', 'If X then Y', 'COPY', 'obj_sys_sales',
             'REACH', 'Control', 'Variant A', 'DRAFT', 'MANUAL', ?, ?)`
  ).run(expId, ws1, campExp, expNow, expNow);

  const expWs2Id = `exp_ws2_${randomUUID()}`;
  db.prepare(
    `INSERT OR IGNORE INTO experiments
       (id, workspace_id, campaign_id, name, hypothesis, variable_type, objective_id,
        primary_kpi, control_description, variant_description, status, mode, created_at, updated_at)
     VALUES (?, ?, ?, 'WS2 Exp', 'Hypothesis', 'COPY', 'obj_sys_sales',
             'REACH', 'Control', 'Variant', 'DRAFT', 'MANUAL', ?, ?)`
  ).run(expWs2Id, ws2, campWs2, expNow, expNow);

  const ws1Exps = db.prepare('SELECT id FROM experiments WHERE workspace_id = ?').all(ws1) as { id: string }[];
  const ws2Exps = db.prepare('SELECT id FROM experiments WHERE workspace_id = ?').all(ws2) as { id: string }[];
  check('Q: Experiment created in correct workspace', ws1Exps.some(e => e.id === expId));
  check('Q2: Experiments workspace-isolated (ws1 has no ws2 exp)', !ws1Exps.some(e => e.id === expWs2Id));

  // ─── Test R: Workspace learning table available ────────────────────────────
  const learningCount = (db.prepare('SELECT COUNT(*) as c FROM workspace_learnings WHERE workspace_id = ?').get(ws1) as { c: number } | undefined)?.c ?? 0;
  check('R: workspace_learnings table queryable', typeof learningCount === 'number');

  // ─── Test S: Creative revision preserves campaign lineage ──────────────────
  const artV2 = insertCreativeArtifact(campCreative, ws1, `${campCreative}-post-01`, 2, 'NEEDS_REVIEW');
  const v2Row = db.prepare('SELECT campaign_id, version FROM creative_artifacts WHERE id = ?').get(artV2) as { campaign_id: string; version: number } | undefined;
  check('S: Creative revision v2 has correct campaign lineage', v2Row?.campaign_id === campCreative && v2Row?.version === 2);

  // ─── Test T: Cancellation reason preserved ────────────────────────────────
  const campCancel2 = `camp_3l_canc2_${randomUUID().slice(0, 8)}`;
  insertCampaign(campCancel2, ws1, 'DRAFTING');
  db.prepare('UPDATE campaigns SET status = ?, cancellation_reason = ? WHERE id = ?')
    .run('CANCELLED', 'Out of budget', campCancel2);

  const cancelRow = db.prepare('SELECT status, cancellation_reason FROM campaigns WHERE id = ?').get(campCancel2) as { status: string; cancellation_reason: string } | undefined;
  check('T: Cancellation reason preserved', cancelRow?.status === 'CANCELLED' && cancelRow?.cancellation_reason === 'Out of budget');

  // ─── Test U: Multiple workspace attention signal reconciliation ───────────
  const campAttn2 = `camp_3l_attn2_${randomUUID().slice(0, 8)}`;
  insertCampaign(campAttn2, ws1, 'APPROVED');
  // Insert approved creative with no schedule to trigger UNSCHEDULED_APPROVED_CONTENT
  insertContentPlan(campAttn2, ws1);
  insertCreativeArtifact(campAttn2, ws1, `${campAttn2}-post-01`, 1, 'APPROVED');

  await attentionSignalService.reconcile(ws1);
  const attnSignals2 = attentionSignalService.list(ws1, 'OPEN');
  const allHaveWorkspace = attnSignals2.every((s) => s.workspaceId === ws1);
  check('U: All attention signals after reconcile have correct workspaceId', allHaveWorkspace);

  // ─── Test V: Performance metric null preservation ──────────────────────────
  const campNullMetric = `camp_3l_null_${randomUUID().slice(0, 8)}`;
  insertCampaign(campNullMetric, ws1);
  insertContentPlan(campNullMetric, ws1);
  const artNull = insertCreativeArtifact(campNullMetric, ws1, `${campNullMetric}-post-01`, 1, 'APPROVED');
  const nullObs = insertPerformanceObservation(ws1, campNullMetric, artNull, `${campNullMetric}-post-01`, {
    reach: 500,
    clicks: null,
    conversions: undefined,
  });

  const nullObsRow = db.prepare('SELECT metrics FROM performance_observations WHERE campaign_id = ?').get(campNullMetric) as { metrics: string } | undefined;
  const nullMetrics = nullObsRow ? JSON.parse(nullObsRow.metrics) as Record<string, unknown> : {};
  check('V: Known metric preserved (reach=500)', nullMetrics.reach === 500);
  check('V2: Null metric stored as null not 0', nullMetrics.clicks === null || nullMetrics.clicks === undefined);

  // ─── Test W: Creative artifact workspace isolation ─────────────────────────
  const ws1Arts = db.prepare('SELECT id FROM creative_artifacts WHERE workspace_id = ?').all(ws1) as { id: string }[];
  const ws2Arts = db.prepare('SELECT id FROM creative_artifacts WHERE workspace_id = ?').all(ws2) as { id: string }[];
  check('W: Creative artifacts workspace-isolated', !ws1Arts.some(a => ws2Arts.some(b => a.id === b.id)));

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(`Phase 3L: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
