import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { campaignsRouter } from '../src/routes/campaigns';

async function main() {
  initDatabase();

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) {
      passed += 1;
      console.log(`PASS  ${name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // Set up Express app
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns', campaignsRouter);

  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const base = `http://localhost:${port}/api/campaigns`;

  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as Record<string, unknown>;
    return { status: res.status, body: json };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  function insertWorkspace(id: string) {
    db.prepare(`INSERT OR IGNORE INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
      VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, id, id);
  }

  function insertCampaign(
    id: string,
    workspaceId: string,
    opts: { name?: string; status?: string; sourceTitle?: string; sourceDescription?: string | null; brief?: string | null } = {},
  ) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaigns
        (id, workspace_id, objective_id, name, status, source_type, source_title, source_description,
         source_metadata, channels, brief, created_at, updated_at)
      VALUES (?, ?, 'obj_sys_sales', ?, ?, 'PRODUCT', ?, ?, '{}', '[]', ?, ?, ?)
    `).run(
      id, workspaceId,
      opts.name ?? `Campaign ${id}`,
      opts.status ?? 'DRAFTING',
      opts.sourceTitle ?? 'Test Product',
      opts.sourceDescription ?? null,
      opts.brief ?? null,
      now, now,
    );
  }

  function insertRelatedData(campaignId: string, workspaceId: string) {
    const now = new Date().toISOString();
    // plan
    const planId = `plan_${randomUUID()}`;
    db.prepare(`INSERT INTO campaign_plans
      (id, campaign_id, workspace_id, version, status, is_current,
       strategy_campaign_angle, strategy_core_message, hooks, proof_points,
       cta_primary, cta_alternatives, channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Angle', 'Core', '{"primary":"h","supporting":[]}', '[]',
              'Buy', '[]', '[]', '[]', '4w', ?, ?)`)
      .run(planId, campaignId, workspaceId, now, now);
    db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .run(`pa_${randomUUID()}`, campaignId, workspaceId, planId, now, now);

    // content plan
    const cpId = `cplan_${randomUUID()}`;
    const body = JSON.stringify({ summary: 's', concepts: [], deliverables: [], cadence: { phases: [] } });
    db.prepare(`INSERT INTO content_plans
      (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, ?, ?, ?)`)
      .run(cpId, workspaceId, campaignId, planId, body, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .run(`cpa_${randomUUID()}`, campaignId, workspaceId, cpId, now, now);

    // creative artifact
    const artId = `cart_${randomUUID()}`;
    db.prepare(`INSERT INTO creative_artifacts
      (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
       content_key, deliverable_id, version, status, is_current, channel, content_type, format,
       title, content, quality, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 'key1', 'del1', 1, 'APPROVED', 1, 'INSTAGRAM', 'STATIC_POST', 'SQUARE_1_1',
              'Title', '{}', '{}', ?, ?)`)
      .run(artId, workspaceId, campaignId, cpId, now, now);

    // schedule
    const schedId = `sched_${randomUUID()}`;
    db.prepare(`INSERT INTO scheduled_content_items
      (id, workspace_id, campaign_id, source_creative_artifact_id, source_creative_version,
       content_key, channel, publication_mode, status, scheduled_for, timezone, media_assets, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 'key1', 'INSTAGRAM', 'MANUAL', 'SCHEDULED', ?, 'UTC', '[]', ?, ?)`)
      .run(schedId, workspaceId, campaignId, artId,
        new Date(Date.now() + 86400000).toISOString(), now, now);

    return { planId, cpId, artId, schedId };
  }

  // ── workspace setup ───────────────────────────────────────────────────

  const wsA = `ws_edit_a_${randomUUID()}`;
  const wsB = `ws_edit_b_${randomUUID()}`;
  insertWorkspace(wsA);
  insertWorkspace(wsB);

  // ── 1. Edit Campaign appears in the overflow menu (backend: PATCH returns updated) ──
  // (UI tests are runtime; here we confirm the endpoint is reachable and works)
  const campA = `camp_edit_a_${randomUUID()}`;
  insertCampaign(campA, wsA, { name: 'Original Name', sourceTitle: 'Original Title' });

  // ── 2. Drawer opens with current campaign values (GET returns all fields) ──
  const getA = await req('GET', `/${campA}`);
  check('2 GET returns current campaign values',
    getA.status === 200 && getA.body.name === 'Original Name' && getA.body.sourceTitle === 'Original Title',
    `status=${getA.status} name=${getA.body.name as string}`);

  // ── 3. Editing campaign name saves via PATCH ──
  const patch3 = await req('PATCH', `/${campA}`, { workspaceId: wsA, name: 'Updated Name' });
  check('3 PATCH updates campaign name',
    patch3.status === 200 && patch3.body.name === 'Updated Name',
    `status=${patch3.status} name=${patch3.body.name as string}`);

  // ── 4. Editing brief saves correctly ──
  const patch4 = await req('PATCH', `/${campA}`, { workspaceId: wsA, brief: 'New planning notes' });
  check('4 PATCH updates brief',
    patch4.status === 200 && patch4.body.brief === 'New planning notes',
    `brief=${patch4.body.brief as string}`);

  // ── 5. Leaving a field unchanged preserves its value ──
  const patch5 = await req('PATCH', `/${campA}`, { workspaceId: wsA, sourceTitle: 'New Title' });
  check('5 Unchanged field (name) preserved',
    patch5.status === 200 && patch5.body.name === 'Updated Name',
    `name=${patch5.body.name as string}`);

  // ── 6. Successful edit updates campaign without creating a duplicate ──
  const before6 = db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE workspace_id = ?').get(wsA) as { n: number };
  await req('PATCH', `/${campA}`, { workspaceId: wsA, sourceDescription: 'Added detail' });
  const after6 = db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE workspace_id = ?').get(wsA) as { n: number };
  check('6 No duplicate campaign created on edit', before6.n === after6.n);

  // ── 7. Campaign ID remains unchanged ──
  const get7 = await req('GET', `/${campA}`);
  check('7 Campaign ID unchanged after edit', get7.body.id === campA);

  // ── 8. Related data (plan, creative, schedule) intact after edit ──
  const campB = `camp_edit_b_${randomUUID()}`;
  insertCampaign(campB, wsA);
  const related = insertRelatedData(campB, wsA);

  await req('PATCH', `/${campB}`, { workspaceId: wsA, name: 'Edited After Related Data' });

  const planStillThere = db.prepare('SELECT id FROM campaign_plans WHERE id = ?').get(related.planId);
  const paStillThere = db.prepare('SELECT id FROM plan_approvals WHERE campaign_id = ?').get(campB);
  const cpStillThere = db.prepare('SELECT id FROM content_plans WHERE id = ?').get(related.cpId);
  const cpaStillThere = db.prepare('SELECT id FROM content_plan_approvals WHERE campaign_id = ?').get(campB);
  const artStillThere = db.prepare('SELECT id FROM creative_artifacts WHERE id = ?').get(related.artId);
  const schedStillThere = db.prepare('SELECT id FROM scheduled_content_items WHERE id = ?').get(related.schedId);

  check('8a Plan approval preserved after edit', Boolean(paStillThere));
  check('8b Content plan approval preserved after edit', Boolean(cpaStillThere));
  check('8c Creative artifact preserved after edit', Boolean(artStillThere));
  check('8d Schedule preserved after edit', Boolean(schedStillThere));
  check('8 Campaign plan preserved after edit', Boolean(planStillThere) && Boolean(cpStillThere));

  // ── 9. Failed PATCH (bad field) returns error without discarding (omit workspaceId check: use bad status) ──
  const patch9 = await req('PATCH', `/${campA}`, { workspaceId: wsA, status: 'NOT_A_REAL_STATUS' });
  check('9 Invalid status returns 400', patch9.status === 400, `status=${patch9.status}`);
  // Field values unchanged on the server
  const get9 = await req('GET', `/${campA}`);
  check('9b Campaign unchanged after failed PATCH', get9.body.name === 'Updated Name');

  // ── 10. Cancel Campaign still works independently ──
  const campC = `camp_edit_c_${randomUUID()}`;
  insertCampaign(campC, wsA, { status: 'DRAFTING' });
  const cancel10 = await req('PATCH', `/${campC}`, { status: 'CANCELLED', cancellationReason: 'Test cancel' });
  check('10 Cancel Campaign still works', cancel10.status === 200 && cancel10.body.status === 'CANCELLED',
    `status=${cancel10.status} campStatus=${cancel10.body.status as string}`);

  // ── 11. Workspace isolation enforced ──
  const campD = `camp_edit_d_${randomUUID()}`;
  insertCampaign(campD, wsB, { name: 'Workspace B campaign' });
  const patch11 = await req('PATCH', `/${campD}`, { workspaceId: wsA, name: 'Attacked' });
  check('11 Wrong workspaceId returns 403', patch11.status === 403,
    `status=${patch11.status}`);
  const get11 = await req('GET', `/${campD}`);
  check('11b Campaign name unchanged after failed cross-workspace patch', get11.body.name === 'Workspace B campaign',
    `name=${get11.body.name as string}`);

  // ── 12. CANCELLED campaign: PATCH returns 409 (server-enforced read-only) ──
  const campE = `camp_edit_e_${randomUUID()}`;
  insertCampaign(campE, wsA, { status: 'CANCELLED' });
  const patch12 = await req('PATCH', `/${campE}`, { workspaceId: wsA, name: 'Post-cancel rename attempt' });
  check('12 CANCELLED PATCH returns 409',
    patch12.status === 409,
    `status=${patch12.status}`);

  // ── 13. CANCELLED: campaign unchanged after rejected PATCH ──
  const get13 = await req('GET', `/${campE}`);
  check('13 CANCELLED campaign name unchanged after rejected PATCH',
    get13.body.name === `Campaign ${campE}`,
    `name=${get13.body.name as string}`);

  // ── 14. COMPLETE: PATCH returns 409 ──
  const campF = `camp_edit_f_${randomUUID()}`;
  insertCampaign(campF, wsA, { status: 'COMPLETE' });
  const patch14 = await req('PATCH', `/${campF}`, { workspaceId: wsA, name: 'Complete rename attempt' });
  check('14 COMPLETE PATCH returns 409', patch14.status === 409, `status=${patch14.status}`);

  // ── 15. ARCHIVED: PATCH returns 409 ──
  const campG2 = `camp_edit_g_${randomUUID()}`;
  insertCampaign(campG2, wsA, { status: 'ARCHIVED' });
  const patch15 = await req('PATCH', `/${campG2}`, { workspaceId: wsA, name: 'Archive rename attempt' });
  check('15 ARCHIVED PATCH returns 409', patch15.status === 409, `status=${patch15.status}`);

  // ── 16. Editable status (SCHEDULED) PATCH succeeds ──
  const campH = `camp_edit_h_${randomUUID()}`;
  insertCampaign(campH, wsA, { status: 'SCHEDULED', name: 'Scheduled campaign' });
  const patch16 = await req('PATCH', `/${campH}`, { workspaceId: wsA, name: 'Updated Scheduled' });
  check('16 SCHEDULED (editable) PATCH returns 200', patch16.status === 200, `status=${patch16.status}`);

  // ── 17. Wrong workspace rejected even for read-only campaign ──
  const campI2 = `camp_edit_i_${randomUUID()}`;
  insertCampaign(campI2, wsA, { status: 'CANCELLED', name: 'WS-B locked' });
  const patch17 = await req('PATCH', `/${campI2}`, { workspaceId: wsB, name: 'Cross-ws attack on locked' });
  // Workspace guard fires first (403), editability guard is secondary (409).
  check('17 Wrong workspace on locked campaign returns 403', patch17.status === 403, `status=${patch17.status}`);

  // ── 18. Cancel flow unbroken: DRAFTING → CANCELLED still returns 200 ──
  const campJ = `camp_edit_j_${randomUUID()}`;
  insertCampaign(campJ, wsA, { status: 'DRAFTING' });
  const patch18 = await req('PATCH', `/${campJ}`, { workspaceId: wsA, status: 'CANCELLED', cancellationReason: 'No longer needed' });
  check('18 Cancel flow (DRAFTING → CANCELLED) returns 200',
    patch18.status === 200 && patch18.body.status === 'CANCELLED',
    `status=${patch18.status} campStatus=${patch18.body.status as string}`);

  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
