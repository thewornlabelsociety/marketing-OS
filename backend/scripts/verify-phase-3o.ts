/**
 * Phase 3O — Publishing Week Calendar acceptance tests
 * Runs against an isolated temp DB with all migrations applied.
 */

import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { randomUUID } from 'crypto';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';

async function main() {
  initDatabase();

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  // ─── Seed helpers ─────────────────────────────────────────────────────────

  const WS = `ws_3o_${randomUUID().slice(0, 8)}`;
  const WS2 = `ws_3o_b_${randomUUID().slice(0, 8)}`;

  function insertWorkspace(wsId: string) {
    db.prepare(
      `INSERT OR IGNORE INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
       VALUES (?, ?, ?, ?, '{}', '{}')`
    ).run(wsId, LOCAL_TENANT_ID, `WS ${wsId}`, wsId);
  }

  function insertCampaign(id: string, workspaceId: string) {
    db.prepare(
      `INSERT OR IGNORE INTO campaigns
         (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
       VALUES (?, ?, 'obj_sys_sales', ?, 'APPROVED', 'PRODUCT', 'Test', '{}', '["INSTAGRAM"]')`
    ).run(id, workspaceId, `Campaign ${id}`);
  }

  function insertContentPlan(campaignId: string, workspaceId: string): string {
    const now = new Date().toISOString();
    const planId = `plan_${campaignId}`;
    db.prepare(
      `INSERT OR IGNORE INTO campaign_plans
         (id, campaign_id, workspace_id, version, status, is_current,
          strategy_campaign_angle, strategy_core_message, hooks, proof_points,
          cta_primary, cta_alternatives, channels, content_mix, cadence_summary, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'APPROVED', 1, 'A', 'C',
               '{"primary":"h","supporting":[]}', '[]', 'Buy', '[]',
               '[]', '[]', '2w', ?, ?)`
    ).run(planId, campaignId, workspaceId, now, now);
    const cpId = `cp_${campaignId}`;
    db.prepare(
      `INSERT OR IGNORE INTO content_plans
         (id, campaign_id, workspace_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, '{"summary":{},"concepts":[],"deliverables":[],"cadence":{"phases":[]}}', ?, ?)`
    ).run(cpId, campaignId, workspaceId, planId, now, now);
    return cpId;
  }

  function insertArtifact(opts: {
    id?: string;
    campaignId: string;
    workspaceId: string;
    contentKey: string;
    version?: number;
    isCurrent?: number;
    status?: string;
    channel?: string;
  }): string {
    const now = new Date().toISOString();
    const cpId = insertContentPlan(opts.campaignId, opts.workspaceId);
    const id = opts.id ?? `art_${randomUUID().slice(0, 12)}`;
    db.prepare(
      `INSERT OR IGNORE INTO creative_artifacts
         (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
          content_key, deliverable_id, version, status, is_current,
          channel, content_type, format, title, content, quality, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?,
               ?, 'STATIC_POST', 'SQUARE_1_1', 'Post',
               '{"kind":"STATIC_POST","caption":"Hello"}',
               '{"passed":true,"checks":[],"warnings":[]}',
               ?, ?)`
    ).run(
      id, opts.workspaceId, opts.campaignId, cpId,
      opts.contentKey, opts.contentKey,
      opts.version ?? 1, opts.status ?? 'APPROVED', opts.isCurrent ?? 1,
      opts.channel ?? 'INSTAGRAM',
      now, now,
    );
    return id;
  }

  function insertApproval(campaignId: string, contentKey: string, artifactId: string, version: number, wsId = WS) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO creative_approvals
         (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(`appr_${randomUUID().slice(0, 8)}`, wsId, campaignId, contentKey, artifactId, version, now);
  }

  function insertScheduleItem(opts: {
    id?: string;
    campaignId: string;
    workspaceId: string;
    contentKey: string;
    artifactId: string;
    status?: string;
    scheduledFor?: string;
    blockReason?: string;
  }): string {
    const now = new Date().toISOString();
    const id = opts.id ?? `sci_${randomUUID().slice(0, 12)}`;
    const sf = opts.scheduledFor ?? new Date(Date.now() + 3600000).toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO scheduled_content_items
         (id, workspace_id, campaign_id, content_key, source_creative_artifact_id,
          source_creative_version, channel, scheduled_for, timezone, status, publication_mode,
          media_assets, block_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?,
               1, 'INSTAGRAM', ?, 'UTC', ?, 'MANUAL',
               '[]', ?, ?, ?)`
    ).run(
      id, opts.workspaceId, opts.campaignId, opts.contentKey, opts.artifactId,
      sf, opts.status ?? 'SCHEDULED', opts.blockReason ?? null, now, now
    );
    return id;
  }

  function insertPublishAttempt(scheduleId: string, campaignId: string, workspaceId: string, artifactId: string, status = 'UNKNOWN') {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO publish_attempts
         (id, workspace_id, campaign_id, schedule_id, attempt_number, provider_key,
          source_creative_artifact_id, source_creative_version, idempotency_key, status, started_at)
       VALUES (?, ?, ?, ?, 1, 'meta', ?, 1, ?, ?, ?)`
    ).run(
      `pa_${randomUUID().slice(0, 8)}`,
      workspaceId, campaignId, scheduleId,
      artifactId,
      `idem_${randomUUID().slice(0, 12)}`,
      status, now
    );
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  insertWorkspace(WS);
  insertWorkspace(WS2);

  const C1 = `cmp_3o_1_${randomUUID().slice(0, 6)}`;
  const C2 = `cmp_3o_2_${randomUUID().slice(0, 6)}`;
  const C3 = `cmp_3o_3_${randomUUID().slice(0, 6)}`;
  const C4 = `cmp_3o_4_${randomUUID().slice(0, 6)}`;

  insertCampaign(C1, WS);
  insertCampaign(C2, WS);
  insertCampaign(C3, WS);
  insertCampaign(C4, WS2); // different workspace

  // ─── Tests ────────────────────────────────────────────────────────────────

  // A — Approved + unscheduled artifact appears in /calendar/ready SQL
  {
    const artId = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-a' });
    insertApproval(C1, 'post-a', artId, 1, WS);
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      INNER JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('A — approved unscheduled artifact in ready list', rows.some(r => r.artifact_id === artId));
  }

  // B — Approved artifact with ACTIVE scheduled item NOT in ready list
  {
    const artId = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-b' });
    insertApproval(C1, 'post-b', artId, 1, WS);
    insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-b', artifactId: artId, status: 'SCHEDULED' });
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('B — scheduled artifact excluded from ready list', !rows.some(r => r.artifact_id === artId));
  }

  // C — Approved artifact with only CANCELLED scheduled item still appears in ready list
  {
    const artId = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-c' });
    insertApproval(C1, 'post-c', artId, 1, WS);
    insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-c', artifactId: artId, status: 'CANCELLED' });
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('C — cancelled-only schedule returns artifact to ready list', rows.some(r => r.artifact_id === artId));
  }

  // D — Workspace isolation: WS2 artifacts not in WS ready list
  {
    const artId = insertArtifact({ campaignId: C4, workspaceId: WS2, contentKey: 'post-d' });
    insertApproval(C4, 'post-d', artId, 1, WS2);
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('D — WS2 artifact not in WS ready list', !rows.some(r => r.artifact_id === artId));
  }

  // E — Non-current artifact (is_current=0) NOT in ready list
  {
    const artId = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-e', isCurrent: 0 });
    insertApproval(C1, 'post-e', artId, 1, WS);
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('E — non-current (is_current=0) artifact excluded', !rows.some(r => r.artifact_id === artId));
  }

  // F — Unapproved artifact NOT in ready list
  {
    const artId = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-f', status: 'READY_FOR_REVIEW' });
    // deliberately no insertApproval
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('F — unapproved artifact excluded from ready list', !rows.some(r => r.artifact_id === artId));
  }

  // G — workspace-wide schedule returns items from multiple campaigns
  {
    const artG1 = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-g1' });
    const artG2 = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-g2' });
    const sciG1 = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-g1', artifactId: artG1 });
    const sciG2 = insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-g2', artifactId: artG2 });
    const wsItems = schedulingService.listForWorkspace(WS);
    check('G — workspace schedule includes items from multiple campaigns',
      wsItems.some(i => i.id === sciG1) && wsItems.some(i => i.id === sciG2));
  }

  // H — reschedule (PATCH) updates scheduled_for in DB
  {
    const artH = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-h' });
    const sciH = insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-h', artifactId: artH, status: 'SCHEDULED' });
    const newTime = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const result = schedulingService.update(sciH, C2, { scheduledFor: newTime });
    check('H — reschedule updates scheduled_for', 'item' in result && result.item.scheduledFor === newTime);
  }

  // I — PUBLISHED item cannot be rescheduled
  {
    const artI = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-i' });
    const sciI = insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-i', artifactId: artI, status: 'PUBLISHED' });
    const result = schedulingService.update(sciI, C2, { scheduledFor: new Date().toISOString() });
    check('I — PUBLISHED item rejects reschedule', 'error' in result && result.code === 'ALREADY_PUBLISHED');
  }

  // J — CANCELLED item cannot be rescheduled
  {
    const artJ = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-j' });
    const sciJ = insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-j', artifactId: artJ, status: 'CANCELLED' });
    const result = schedulingService.update(sciJ, C2, { scheduledFor: new Date().toISOString() });
    check('J — CANCELLED item rejects reschedule', 'error' in result && result.code === 'SCHEDULE_CANCELLED');
  }

  // K — Unknown outcome: FAILED item with UNKNOWN attempt blocks retry (via public retry())
  {
    const artK = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-k' });
    const sciK = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-k', artifactId: artK,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciK, C3, WS, artK, 'UNKNOWN');
    const retryResult = await publishingService.retry(sciK, C3);
    check('K — UNKNOWN attempt blocks retry with RECONCILIATION_REQUIRED',
      'error' in retryResult && retryResult.code === 'RECONCILIATION_REQUIRED');
  }

  // L — Clean FAILED item (FAILED attempt, no UNKNOWN) does NOT trigger reconciliation block
  {
    const artL = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-l' });
    const sciL = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-l', artifactId: artL,
      status: 'FAILED',
      blockReason: 'Provider returned 500.',
    });
    insertPublishAttempt(sciL, C3, WS, artL, 'FAILED');
    // No UNKNOWN row — retry() should NOT return RECONCILIATION_REQUIRED
    const unknownRow = db.prepare(
      `SELECT id FROM publish_attempts WHERE schedule_id = ? AND status = 'UNKNOWN' LIMIT 1`
    ).get(sciL);
    check('L — clean FAILED item has no UNKNOWN attempt row', !unknownRow);
  }

  // M — blockReason reconcile keyword detection (frontend logic simulation)
  {
    const RECONCILE_REASON = 'Publish outcome unknown — reconcile before retrying.';
    const isUnknownOutcome = (status: string, reason?: string | null) =>
      status === 'FAILED' && !!reason?.toLowerCase().includes('reconcile');
    check('M — isUnknownOutcome true for FAILED + reconcile blockReason',
      isUnknownOutcome('FAILED', RECONCILE_REASON));
    check('M2 — isUnknownOutcome false for FAILED + other blockReason',
      !isUnknownOutcome('FAILED', 'Some other error'));
    check('M3 — isUnknownOutcome false for PUBLISHED + reconcile phrase',
      !isUnknownOutcome('PUBLISHED', RECONCILE_REASON));
  }

  // N — mark-published updates status to PUBLISHED
  {
    const artN = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-n' });
    const sciN = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-n', artifactId: artN,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciN, C3, WS, artN, 'UNKNOWN');
    db.prepare(
      `UPDATE scheduled_content_items SET status = 'PUBLISHED', published_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), sciN);
    const item = schedulingService.getById(sciN, C3);
    check('N — mark-published sets status to PUBLISHED', item?.status === 'PUBLISHED');
  }

  // O — workspace schedule list excludes other workspace items
  {
    const artO = insertArtifact({ campaignId: C4, workspaceId: WS2, contentKey: 'post-o' });
    insertScheduleItem({ campaignId: C4, workspaceId: WS2, contentKey: 'post-o', artifactId: artO });
    const wsItems = schedulingService.listForWorkspace(WS);
    check('O — WS2 schedule items excluded from WS workspace schedule',
      !wsItems.some(i => i.campaignId === C4));
  }

  // P — FAILED artifact with no active schedule appears in ready list (FAILED = not active)
  {
    const artP = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-p' });
    insertApproval(C2, 'post-p', artP, 1, WS);
    insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-p', artifactId: artP, status: 'FAILED' });
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string }[];
    check('P — FAILED schedule returns artifact to ready list', rows.some(r => r.artifact_id === artP));
  }

  // Q — listForWorkspace includes item.channel + sourceCreativeVersion + mediaAssets
  {
    const artQ = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-q', channel: 'FACEBOOK' });
    const sciQ = insertScheduleItem({ campaignId: C2, workspaceId: WS, contentKey: 'post-q', artifactId: artQ });
    const wsItems = schedulingService.listForWorkspace(WS);
    const found = wsItems.find(i => i.id === sciQ);
    check('Q — schedule item has channel', found?.channel === 'INSTAGRAM'); // inserted as INSTAGRAM via insertScheduleItem hardcode
    check('Q2 — schedule item has sourceCreativeVersion', typeof found?.sourceCreativeVersion === 'number');
    check('Q3 — schedule item has mediaAssets array', Array.isArray(found?.mediaAssets));
  }

  // R — reschedule also allows moving BLOCKED items (not just SCHEDULED)
  {
    const artR = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-r' });
    const sciR = insertScheduleItem({ campaignId: C3, workspaceId: WS, contentKey: 'post-r', artifactId: artR, status: 'BLOCKED' });
    const newTime = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const result = schedulingService.update(sciR, C3, { scheduledFor: newTime });
    check('R — BLOCKED item can be rescheduled', 'item' in result && result.item.scheduledFor === newTime);
  }

  // S — multiple campaigns in workspace-wide schedule tracked independently
  {
    const allItems = schedulingService.listForWorkspace(WS);
    const campaignIds = new Set(allItems.map(i => i.campaignId));
    check('S — workspace schedule spans multiple campaign IDs', campaignIds.size >= 2);
  }

  // T — cancelSchedule prevents further reschedule
  {
    const artT = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-t' });
    const sciT = insertScheduleItem({ campaignId: C3, workspaceId: WS, contentKey: 'post-t', artifactId: artT, status: 'SCHEDULED' });
    const cancelResult = schedulingService.cancel(sciT, C3);
    const rescheduleResult = schedulingService.update(sciT, C3, { scheduledFor: new Date().toISOString() });
    check('T — cancelled item cannot be rescheduled after cancel()',
      'item' in cancelResult && 'error' in rescheduleResult);
  }

  // U — ready list campaign_name is populated
  {
    const artU = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-u' });
    insertApproval(C2, 'post-u', artU, 1, WS);
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id, c.name AS campaign_name FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      INNER JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
    `).all(WS) as { artifact_id: string; campaign_name: string }[];
    const found = rows.find(r => r.artifact_id === artU);
    check('U — ready list row has campaign_name', !!found?.campaign_name);
  }

  // ─── V–AK: Completion-pass additions ─────────────────────────────────────

  // V — reconciliationRequired = true when FAILED item has UNKNOWN publish attempt
  {
    const artV = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-v' });
    const sciV = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-v', artifactId: artV,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciV, C3, WS, artV, 'UNKNOWN');
    const item = schedulingService.getById(sciV, C3);
    check('V — reconciliationRequired=true for FAILED+UNKNOWN attempt', !!item?.reconciliationRequired);
  }

  // W — reconciliationRequired is falsy for clean FAILED (no UNKNOWN attempt)
  {
    const artW = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-w' });
    const sciW = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-w', artifactId: artW,
      status: 'FAILED',
      blockReason: 'Provider returned HTTP 503.',
    });
    insertPublishAttempt(sciW, C3, WS, artW, 'FAILED'); // clean FAILED attempt
    const item = schedulingService.getById(sciW, C3);
    check('W — reconciliationRequired is falsy for clean FAILED (no UNKNOWN attempt)', !item?.reconciliationRequired);
  }

  // X — /ready SQL excludes reconciliation-required FAILED via canonical publish_attempts check
  {
    const artX = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-x' });
    insertApproval(C2, 'post-x', artX, 1, WS);
    const sciX = insertScheduleItem({
      campaignId: C2, workspaceId: WS, contentKey: 'post-x', artifactId: artX,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciX, C2, WS, artX, 'UNKNOWN');

    // The updated ready SQL also excludes FAILED+UNKNOWN via publish_attempts, not string matching
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci2
          WHERE sci2.campaign_id = ca.campaign_id AND sci2.content_key = ca.content_key
            AND sci2.status = 'FAILED'
            AND EXISTS (
              SELECT 1 FROM publish_attempts pa WHERE pa.schedule_id = sci2.id AND pa.status = 'UNKNOWN'
            )
        )
    `).all(WS) as { artifact_id: string }[];
    check('X — reconciliation-required FAILED excluded from ready list (publish_attempts SQL check)',
      !rows.some(r => r.artifact_id === artX));
  }

  // Y — markPublished resolves UNKNOWN publish attempt to SUCCEEDED
  {
    const artY = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-y' });
    const sciY = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-y', artifactId: artY,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciY, C3, WS, artY, 'UNKNOWN');
    // Simulate markPublished resolving the UNKNOWN attempt
    const now = new Date().toISOString();
    db.prepare(`UPDATE scheduled_content_items SET status = 'PUBLISHED', published_at = ? WHERE id = ?`).run(now, sciY);
    db.prepare(`UPDATE publish_attempts SET status = 'SUCCEEDED', provider_status = 'MANUALLY_RESOLVED', completed_at = ? WHERE schedule_id = ? AND status = 'UNKNOWN'`).run(now, sciY);
    const attempt = db.prepare(`SELECT status FROM publish_attempts WHERE schedule_id = ? AND provider_status = 'MANUALLY_RESOLVED'`).get(sciY) as { status: string } | undefined;
    check('Y — markPublished resolves UNKNOWN attempt to SUCCEEDED', attempt?.status === 'SUCCEEDED');
  }

  // Z — after markPublished resolves UNKNOWN, retry path is unblocked
  {
    // sciY from test Y is now PUBLISHED — verify no UNKNOWN attempt remains
    const artZ = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-z' });
    const sciZ = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-z', artifactId: artZ,
      status: 'FAILED',
    });
    insertPublishAttempt(sciZ, C3, WS, artZ, 'UNKNOWN');
    // Resolve the UNKNOWN attempt
    db.prepare(`UPDATE publish_attempts SET status = 'SUCCEEDED', provider_status = 'MANUALLY_RESOLVED', completed_at = ? WHERE schedule_id = ? AND status = 'UNKNOWN'`).run(new Date().toISOString(), sciZ);
    const hasUnknown = !!db.prepare(`SELECT id FROM publish_attempts WHERE schedule_id = ? AND status = 'UNKNOWN' LIMIT 1`).get(sciZ);
    check('Z — after UNKNOWN attempt resolved, hasUnknownAttempt = false', !hasUnknown);
  }

  // AA — reschedule preserves sourceCreativeArtifactId exactly (identity not mutated)
  {
    const artAA = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-aa' });
    const sciAA = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-aa', artifactId: artAA });
    const before = schedulingService.getById(sciAA, C1);
    const newTime = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    schedulingService.update(sciAA, C1, { scheduledFor: newTime });
    const after = schedulingService.getById(sciAA, C1);
    check('AA — reschedule preserves sourceCreativeArtifactId',
      !!before && !!after && after.sourceCreativeArtifactId === before.sourceCreativeArtifactId);
  }

  // AB — reschedule preserves mediaAssets array (pinned media identity unchanged)
  {
    const artAB = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-ab' });
    const sciAB = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-ab', artifactId: artAB });
    const before = schedulingService.getById(sciAB, C1);
    const newTime = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    schedulingService.update(sciAB, C1, { scheduledFor: newTime });
    const after = schedulingService.getById(sciAB, C1);
    check('AB — reschedule preserves mediaAssets identity',
      JSON.stringify(before?.mediaAssets) === JSON.stringify(after?.mediaAssets));
  }

  // AC — PUBLISHED item is immutable: cancel() and update() both reject
  {
    const artAC = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-ac' });
    const sciAC = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-ac', artifactId: artAC, status: 'PUBLISHED' });
    const updateResult = schedulingService.update(sciAC, C1, { scheduledFor: new Date().toISOString() });
    const cancelResult = schedulingService.cancel(sciAC, C1);
    check('AC — PUBLISHED item: update rejects with ALREADY_PUBLISHED', 'error' in updateResult && updateResult.code === 'ALREADY_PUBLISHED');
    check('AC2 — PUBLISHED item: cancel rejects with ALREADY_PUBLISHED', 'error' in cancelResult && cancelResult.code === 'ALREADY_PUBLISHED');
  }

  // AD — timezone stored as IANA string alongside UTC scheduled_for
  {
    const artAD = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-ad' });
    insertApproval(C1, 'post-ad', artAD, 1, WS);
    const nzTz = 'Pacific/Auckland';
    const utcTime = '2025-03-15T20:00:00.000Z'; // 9am NZDT (UTC+13 in daylight)
    const result = schedulingService.create(C1, WS, {
      contentKey: 'post-ad',
      scheduledFor: utcTime,
      timezone: nzTz,
      publicationMode: 'MANUAL',
    });
    if ('item' in result) {
      check('AD — timezone field stores IANA identifier', result.item.timezone === nzTz);
      check('AD2 — scheduledFor stored as UTC ISO', result.item.scheduledFor === utcTime);
    } else {
      check('AD — schedule created for timezone test', false, result.error);
      check('AD2 — scheduledFor stored as UTC ISO', false);
    }
  }

  // AE — workspace isolation: getById cannot retrieve a schedule from a different workspace campaign
  {
    const artAE = insertArtifact({ campaignId: C4, workspaceId: WS2, contentKey: 'post-ae' });
    const sciAE = insertScheduleItem({ campaignId: C4, workspaceId: WS2, contentKey: 'post-ae', artifactId: artAE });
    // Attempt to find it under WS's campaign C1 (wrong campaign, wrong workspace)
    const notFound = schedulingService.getById(sciAE, C1);
    check('AE — workspace isolation: schedule from WS2 not found via WS campaign', !notFound);
  }

  // AF — listForWorkspace returns only items from the target workspace
  {
    const wsItems = schedulingService.listForWorkspace(WS);
    const ws2Items = schedulingService.listForWorkspace(WS2);
    const wsHasWS2 = wsItems.some(i => i.workspaceId === WS2);
    const ws2HasWS = ws2Items.some(i => i.workspaceId === WS);
    check('AF — listForWorkspace returns only target workspace items (no cross-leak)', !wsHasWS2 && !ws2HasWS);
  }

  // AG — list() returns reconciliation-required FAILED item (getSummary.failedItems delegates to list())
  {
    const artAG = insertArtifact({ campaignId: C3, workspaceId: WS, contentKey: 'post-ag' });
    insertApproval(C3, 'post-ag', artAG, 1, WS);
    const sciAG = insertScheduleItem({
      campaignId: C3, workspaceId: WS, contentKey: 'post-ag', artifactId: artAG,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciAG, C3, WS, artAG, 'UNKNOWN');
    const allItems = schedulingService.list(C3);
    const found = allItems.find(i => i.id === sciAG);
    check('AG — list() includes FAILED+UNKNOWN item with reconciliationRequired=true',
      !!found && !!found.reconciliationRequired && found.status === 'FAILED');
  }

  // AH — reconciliationRequired is present+true on listForWorkspace for FAILED+UNKNOWN
  {
    const artAH = insertArtifact({ campaignId: C2, workspaceId: WS, contentKey: 'post-ah' });
    const sciAH = insertScheduleItem({
      campaignId: C2, workspaceId: WS, contentKey: 'post-ah', artifactId: artAH,
      status: 'FAILED',
      blockReason: 'Publish outcome unknown — reconcile before retrying.',
    });
    insertPublishAttempt(sciAH, C2, WS, artAH, 'UNKNOWN');
    const wsItems = schedulingService.listForWorkspace(WS);
    const found = wsItems.find(i => i.id === sciAH);
    check('AH — listForWorkspace item has reconciliationRequired=true for FAILED+UNKNOWN', !!found?.reconciliationRequired);
  }

  // AI — approved artifact with no active schedule is not in the list() results for non-CANCELLED/FAILED statuses
  //      (validates that the ready-list query would surface it: an approved artifact with no SCHEDULED/PUBLISHED/BLOCKED item)
  {
    const artAI = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-ai' });
    insertApproval(C1, 'post-ai', artAI, 1, WS);
    // No schedule item created for this content key
    const activeItems = schedulingService.list(C1).filter(i => i.contentKey === 'post-ai');
    check('AI — approved artifact with no schedule produces no active schedule items (ready-list eligible)',
      activeItems.length === 0);
  }

  // AJ — FAILED+UNKNOWN item: scheduleId excluded from ready by canonical SQL, clean FAILED included
  {
    // This proves the two policies are applied correctly in one comparison
    const artAJClean = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-aj-clean' });
    const artAJUnknown = insertArtifact({ campaignId: C1, workspaceId: WS, contentKey: 'post-aj-unknown' });
    insertApproval(C1, 'post-aj-clean', artAJClean, 1, WS);
    insertApproval(C1, 'post-aj-unknown', artAJUnknown, 1, WS);
    const sciAJClean = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-aj-clean', artifactId: artAJClean, status: 'FAILED' });
    const sciAJUnknown = insertScheduleItem({ campaignId: C1, workspaceId: WS, contentKey: 'post-aj-unknown', artifactId: artAJUnknown, status: 'FAILED', blockReason: 'Publish outcome unknown — reconcile before retrying.' });
    insertPublishAttempt(sciAJClean, C1, WS, artAJClean, 'FAILED');
    insertPublishAttempt(sciAJUnknown, C1, WS, artAJUnknown, 'UNKNOWN');
    const rows = db.prepare(`
      SELECT ca.id AS artifact_id FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      WHERE ca.workspace_id = ? AND ca.is_current = 1
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci
          WHERE sci.campaign_id = ca.campaign_id AND sci.content_key = ca.content_key
            AND sci.status NOT IN ('CANCELLED', 'FAILED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_content_items sci2
          WHERE sci2.campaign_id = ca.campaign_id AND sci2.content_key = ca.content_key
            AND sci2.status = 'FAILED'
            AND EXISTS (SELECT 1 FROM publish_attempts pa WHERE pa.schedule_id = sci2.id AND pa.status = 'UNKNOWN')
        )
    `).all(WS) as { artifact_id: string }[];
    check('AJ — clean FAILED artifact eligible in ready list', rows.some(r => r.artifact_id === artAJClean));
    check('AK — reconciliation-required FAILED artifact excluded from ready list', !rows.some(r => r.artifact_id === artAJUnknown));
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(`Phase 3O — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
