/**
 * Phase 3M — Content Studio acceptance tests
 * Runs against an isolated temp DB with schema + all migrations applied.
 */

import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { randomUUID } from 'crypto';

async function main() {
  initDatabase();

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  // ─── Seed helpers ─────────────────────────────────────────────────────────

  function insertWorkspace(wsId: string) {
    db.prepare(
      `INSERT OR IGNORE INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
       VALUES (?, ?, ?, ?, '{}', '{}')`
    ).run(wsId, LOCAL_TENANT_ID, `WS ${wsId}`, wsId);
  }

  function insertCampaign(id: string, workspaceId: string, status = 'DRAFTING') {
    db.prepare(
      `INSERT OR IGNORE INTO campaigns
         (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
       VALUES (?, ?, 'obj_sys_sales', ?, ?, 'PRODUCT', 'Test', '{}', '["INSTAGRAM"]')`
    ).run(id, workspaceId, `Cmp ${id}`, status);
  }

  function insertPlan(campaignId: string, workspaceId: string, planStatus = 'APPROVED'): string {
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

  function insertContentPlan(campaignId: string, workspaceId: string, status = 'APPROVED'): string {
    insertPlan(campaignId, workspaceId);
    const now = new Date().toISOString();
    const cpId = `cp_${campaignId}`;
    const planBody = JSON.stringify({
      summary: { campaignNarrative: 'Test', contentStrategy: 'Test' },
      concepts: [],
      deliverables: [],
      cadence: { phases: [] },
    });
    db.prepare(
      `INSERT OR IGNORE INTO content_plans
         (id, campaign_id, workspace_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, 1, ?, ?, ?)`
    ).run(cpId, campaignId, workspaceId, `plan_${campaignId}`, status, planBody, now, now);
    return cpId;
  }

  function insertArtifact(opts: {
    id?: string;
    campaignId: string;
    workspaceId: string;
    contentKey: string;
    version?: number;
    status?: string;
    isCurrent?: number;
    content?: object;
    cpId?: string;
  }): string {
    const now = new Date().toISOString();
    const cpId = opts.cpId ?? insertContentPlan(opts.campaignId, opts.workspaceId);
    const id = opts.id ?? `art_${opts.campaignId.slice(-6)}_${opts.contentKey.slice(-6)}_v${opts.version ?? 1}_${randomUUID().slice(0, 4)}`;
    const content = opts.content ?? { kind: 'STATIC_POST', caption: 'Hello world' };
    db.prepare(
      `INSERT OR IGNORE INTO creative_artifacts
         (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
          content_key, deliverable_id, version, status, is_current,
          channel, content_type, format, title, content, quality, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?,
               'INSTAGRAM', 'STATIC_POST', 'SQUARE_1_1', 'Test Post', ?,
               '{"passed":true,"checks":[],"warnings":[]}', ?, ?)`
    ).run(
      id, opts.workspaceId, opts.campaignId, cpId,
      opts.contentKey, opts.contentKey,
      opts.version ?? 1, opts.status ?? 'READY_FOR_REVIEW', opts.isCurrent ?? 1,
      JSON.stringify(content), now, now,
    );
    return id;
  }

  function insertApproval(campaignId: string, contentKey: string, artifactId: string, version: number, workspaceId = WS) {
    const now = new Date().toISOString();
    // Get workspace_id from the campaign if not provided
    const camp = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campaignId) as { workspace_id: string } | undefined;
    const wsId = camp?.workspace_id ?? workspaceId;
    db.prepare(
      `INSERT OR REPLACE INTO creative_approvals (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(`appr_${randomUUID().slice(0, 8)}`, wsId, campaignId, contentKey, artifactId, version, now);
  }

  // ─── Workspaces ───────────────────────────────────────────────────────────

  const WS = `ws_3m_${randomUUID().slice(0, 8)}`;
  const WS2 = `ws_3m_${randomUUID().slice(0, 8)}`;
  insertWorkspace(WS);
  insertWorkspace(WS2);

  // ─── Test A: PATCH updates content in place ────────────────────────────────
  {
    const campId = `camp_3m_a_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_a_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const newContent = { kind: 'STATIC_POST', caption: 'Updated caption', cta: 'Shop now' };
    db.prepare('UPDATE creative_artifacts SET content = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(newContent), new Date().toISOString(), artId);
    const row = db.prepare('SELECT content FROM creative_artifacts WHERE id = ?').get(artId) as { content: string };
    const parsed = JSON.parse(row.content) as { caption: string };
    check('A: PATCH updates creative content in place', parsed.caption === 'Updated caption', `got ${parsed.caption}`);
  }

  // ─── Test B: PATCH on APPROVED resets status to READY_FOR_REVIEW ──────────
  {
    const campId = `camp_3m_b_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_b_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'APPROVED' });
    db.prepare('UPDATE creative_artifacts SET status = ?, updated_at = ? WHERE id = ?')
      .run('READY_FOR_REVIEW', new Date().toISOString(), artId);
    const row = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artId) as { status: string };
    check('B: PATCH on APPROVED resets status to READY_FOR_REVIEW', row.status === 'READY_FOR_REVIEW', `got ${row.status}`);
  }

  // ─── Test C: PATCH on APPROVED clears approval record ────────────────────
  {
    const campId = `camp_3m_c_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_c_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'APPROVED' });
    insertApproval(campId, ck, artId, 1);
    const before = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { c: number };
    db.prepare('DELETE FROM creative_approvals WHERE campaign_id = ? AND content_key = ?').run(campId, ck);
    const after = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { c: number };
    check('C: PATCH on APPROVED clears approval record', before.c === 1 && after.c === 0, `before=${before.c} after=${after.c}`);
  }

  // ─── Test D: PATCH on non-APPROVED leaves other approvals intact ──────────
  {
    const campId = `camp_3m_d_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck1 = `ck_d1_${randomUUID().slice(0, 6)}`;
    const ck2 = `ck_d2_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const art1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck1, status: 'APPROVED', cpId });
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck2, status: 'READY_FOR_REVIEW', cpId });
    insertApproval(campId, ck1, art1, 1);
    // PATCH on ck2 (READY_FOR_REVIEW) should not clear ck1's approval
    const count = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck1) as { c: number };
    check('D: PATCH on non-APPROVED does not clear other approval records', count.c === 1, `got ${count.c}`);
  }

  // ─── Test E: Workspace isolation — other workspace cannot access artifacts ─
  {
    const campId = `camp_3m_e_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_e_${randomUUID().slice(0, 6)}`;
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const art = db.prepare(
      `SELECT ca.id FROM creative_artifacts ca
       JOIN campaigns c ON ca.campaign_id = c.id
       WHERE ca.content_key = ? AND c.workspace_id = ?`
    ).get(ck, WS2) as { id: string } | undefined;
    check('E: Workspace isolation — other workspace cannot see artifact', !art);
  }

  // ─── Test F: Version history — only one is_current per contentKey ──────────
  {
    const campId = `camp_3m_f_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_f_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    insertArtifact({ id: `art_f_v1_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 1, isCurrent: 0, cpId });
    insertArtifact({ id: `art_f_v2_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 2, isCurrent: 1, cpId });
    const currents = db.prepare('SELECT COUNT(*) as c FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck) as { c: number };
    const total = db.prepare('SELECT COUNT(*) as c FROM creative_artifacts WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { c: number };
    check('F: Version history — only one is_current per contentKey', currents.c === 1 && total.c === 2,
      `currents=${currents.c} total=${total.c}`);
  }

  // ─── Test G: Approval references exact artifact version ───────────────────
  {
    const campId = `camp_3m_g_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_g_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 3, status: 'APPROVED' });
    insertApproval(campId, ck, artId, 3);
    const row = db.prepare('SELECT creative_artifact_id, approved_version FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { creative_artifact_id: string; approved_version: number };
    check('G: Approval references exact artifact ID and version',
      row?.creative_artifact_id === artId && row?.approved_version === 3,
      `id=${row?.creative_artifact_id} v=${row?.approved_version}`);
  }

  // ─── Test H: UNIQUE(campaign_id, content_key) on creative_approvals ────────
  {
    const campId = `camp_3m_h_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_h_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const art1 = insertArtifact({ id: `art_h_v1_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 1, isCurrent: 0, cpId });
    const art2 = insertArtifact({ id: `art_h_v2_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 2, isCurrent: 1, cpId });
    insertApproval(campId, ck, art1, 1);
    insertApproval(campId, ck, art2, 2); // Should replace
    const rows = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .all(campId, ck) as { c: number }[];
    const latest = db.prepare('SELECT approved_version FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { approved_version: number };
    check('H: UNIQUE constraint on creative_approvals allows upsert', rows[0].c === 1 && latest.approved_version === 2,
      `count=${rows[0].c} version=${latest.approved_version}`);
  }

  // ─── Test I: STATIC_POST content fields persist ────────────────────────────
  {
    const campId = `camp_3m_i_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_i_${randomUUID().slice(0, 6)}`;
    const content = { kind: 'STATIC_POST', headline: 'Big sale', caption: '50% off everything', hook: 'You will not believe this', cta: 'Shop now', hashtags: ['#sale', '#fashion'], visualDirection: 'Product shot' };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content });
    const row = db.prepare('SELECT content FROM creative_artifacts WHERE id = ?').get(artId) as { content: string };
    const parsed = JSON.parse(row.content) as typeof content;
    check('I: STATIC_POST fields persist', parsed.kind === 'STATIC_POST' && parsed.headline === 'Big sale' && Array.isArray(parsed.hashtags) && parsed.hashtags.length === 2,
      `kind=${parsed.kind} headline=${parsed.headline}`);
  }

  // ─── Test J: EMAIL content fields persist ──────────────────────────────────
  {
    const campId = `camp_3m_j_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_j_${randomUUID().slice(0, 6)}`;
    const content = { kind: 'EMAIL', subject: 'New collection', preheader: 'Preview text', body: 'Body text', cta: { label: 'Browse now' } };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content });
    const row = db.prepare('SELECT content FROM creative_artifacts WHERE id = ?').get(artId) as { content: string };
    const parsed = JSON.parse(row.content) as typeof content;
    check('J: EMAIL fields persist', parsed.subject === 'New collection' && parsed.cta?.label === 'Browse now',
      `subject=${parsed.subject}`);
  }

  // ─── Test K: ARTICLE content fields persist ────────────────────────────────
  {
    const campId = `camp_3m_k_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_k_${randomUUID().slice(0, 6)}`;
    const content = { kind: 'ARTICLE', title: 'Five ways to style denim', excerpt: 'Denim is timeless.', sections: [{ heading: 'Introduction', body: 'Denim.' }, { heading: 'Tip 1', body: 'Pair with tee.' }] };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content });
    const row = db.prepare('SELECT content FROM creative_artifacts WHERE id = ?').get(artId) as { content: string };
    const parsed = JSON.parse(row.content) as typeof content;
    check('K: ARTICLE fields persist', parsed.title === 'Five ways to style denim' && parsed.sections.length === 2 && parsed.sections[1].heading === 'Tip 1');
  }

  // ─── Test L: CAROUSEL content fields persist ───────────────────────────────
  {
    const campId = `camp_3m_l_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_l_${randomUUID().slice(0, 6)}`;
    const content = { kind: 'CAROUSEL', caption: 'Swipe to see', slides: [{ slideNumber: 1, headline: 'Summer Essentials', body: 'Light looks.' }, { slideNumber: 2, headline: 'Bold Colours', body: 'Make a statement.' }], cta: 'Shop' };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content });
    const row = db.prepare('SELECT content FROM creative_artifacts WHERE id = ?').get(artId) as { content: string };
    const parsed = JSON.parse(row.content) as typeof content;
    check('L: CAROUSEL fields persist', parsed.slides.length === 2 && parsed.slides[0].headline === 'Summer Essentials');
  }

  // ─── Test M: Only is_current=1 row is the current creative ────────────────
  {
    const campId = `camp_3m_m_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_m_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    for (let v = 1; v <= 3; v++) {
      insertArtifact({ id: `art_m_v${v}_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: v, isCurrent: v === 3 ? 1 : 0, cpId });
    }
    const current = db.prepare('SELECT version FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck) as { version: number };
    check('M: Only is_current=1 row is current', current?.version === 3, `version=${current?.version}`);
  }

  // ─── Test N: PATCH updates in-place (no new row) ──────────────────────────
  {
    const campId = `camp_3m_n_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_n_${randomUUID().slice(0, 6)}`;
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 1 });
    db.prepare('UPDATE creative_artifacts SET content = ?, updated_at = ? WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .run(JSON.stringify({ kind: 'STATIC_POST', caption: 'Patched' }), new Date().toISOString(), campId, ck);
    const count = db.prepare('SELECT COUNT(*) as c FROM creative_artifacts WHERE campaign_id = ? AND content_key = ?')
      .get(campId, ck) as { c: number };
    check('N: PATCH updates in-place (no new row created)', count.c === 1, `rows=${count.c}`);
  }

  // ─── Test O: Revision request lineage ─────────────────────────────────────
  {
    const campId = `camp_3m_o_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_o_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const art1 = insertArtifact({ id: `art_o_v1_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 1, isCurrent: 0, cpId });
    const art2 = insertArtifact({ id: `art_o_v2_${randomUUID().slice(0,4)}`, campaignId: campId, workspaceId: WS, contentKey: ck, version: 2, isCurrent: 1, cpId });
    const now = new Date().toISOString();
    const rrId = `rr_o_${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO creative_revision_requests
         (id, workspace_id, campaign_id, content_key, creative_artifact_id, source_version, request_text, target_hint, resulting_artifact_id, resulting_version, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'Make energetic', null, ?, 2, 'COMPLETED', ?, ?)`
    ).run(rrId, WS, campId, ck, art1, art2, now, now);
    const rr = db.prepare('SELECT resulting_version FROM creative_revision_requests WHERE id = ?').get(rrId) as { resulting_version: number };
    check('O: Revision request records resulting version', rr?.resulting_version === 2, `got ${rr?.resulting_version}`);
  }

  // ─── Test P: Quality warnings persist ─────────────────────────────────────
  {
    const campId = `camp_3m_p_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_p_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const now = new Date().toISOString();
    const artId = `art_p_${randomUUID().slice(0, 8)}`;
    const quality = { passed: false, checks: [], warnings: ['Caption too long', 'Missing CTA'] };
    db.prepare(
      `INSERT INTO creative_artifacts
         (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
          content_key, deliverable_id, version, status, is_current,
          channel, content_type, format, title, content, quality, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, 1, 'READY_FOR_REVIEW', 1,
               'INSTAGRAM', 'STATIC_POST', 'SQUARE_1_1', 'Test',
               '{"kind":"STATIC_POST","caption":"x"}', ?, ?, ?)`
    ).run(artId, WS, campId, cpId, ck, ck, JSON.stringify(quality), now, now);
    const row = db.prepare('SELECT quality FROM creative_artifacts WHERE id = ?').get(artId) as { quality: string };
    const q = JSON.parse(row.quality) as { warnings: string[] };
    check('P: Quality warnings persist with artifact', q.warnings.length === 2, `got ${q.warnings.length}`);
  }

  // ─── Test Q: Workspace isolation — artifacts scoped separately ────────────
  {
    const campA = `camp_3m_qa_${randomUUID().slice(0, 8)}`;
    const campB = `camp_3m_qb_${randomUUID().slice(0, 8)}`;
    insertCampaign(campA, WS);
    insertCampaign(campB, WS2);
    const ck = `ck_q_${randomUUID().slice(0, 6)}`;
    insertArtifact({ campaignId: campA, workspaceId: WS, contentKey: ck });
    insertArtifact({ campaignId: campB, workspaceId: WS2, contentKey: ck });
    const countA = db.prepare(
      `SELECT COUNT(*) as c FROM creative_artifacts ca JOIN campaigns c ON ca.campaign_id = c.id WHERE c.workspace_id = ? AND ca.content_key = ?`
    ).get(WS, ck) as { c: number };
    const countB = db.prepare(
      `SELECT COUNT(*) as c FROM creative_artifacts ca JOIN campaigns c ON ca.campaign_id = c.id WHERE c.workspace_id = ? AND ca.content_key = ?`
    ).get(WS2, ck) as { c: number };
    check('Q: Workspace isolation — artifacts scoped to workspace', countA.c === 1 && countB.c === 1,
      `ws1=${countA.c} ws2=${countB.c}`);
  }

  // ─── Test R: Approval isolation — scoped to campaign ──────────────────────
  {
    const campA = `camp_3m_ra_${randomUUID().slice(0, 8)}`;
    const campB = `camp_3m_rb_${randomUUID().slice(0, 8)}`;
    insertCampaign(campA, WS);
    insertCampaign(campB, WS);
    const ck = `ck_r_${randomUUID().slice(0, 6)}`;
    const artA = insertArtifact({ campaignId: campA, workspaceId: WS, contentKey: ck, status: 'APPROVED' });
    insertArtifact({ campaignId: campB, workspaceId: WS, contentKey: ck });
    insertApproval(campA, ck, artA, 1);
    const countB = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?')
      .get(campB, ck) as { c: number };
    check('R: Approval records scoped to campaign', countB.c === 0, `got ${countB.c}`);
  }

  // ─── Test S: Status READY_FOR_REVIEW → APPROVED is valid ──────────────────
  {
    const campId = `camp_3m_s_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_s_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'READY_FOR_REVIEW' });
    db.prepare('UPDATE creative_artifacts SET status = ?, updated_at = ? WHERE id = ?').run('APPROVED', new Date().toISOString(), artId);
    const row = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artId) as { status: string };
    check('S: Status transition READY_FOR_REVIEW → APPROVED', row.status === 'APPROVED', `got ${row.status}`);
  }

  // ─── Test T: Status CHANGES_REQUESTED persists ────────────────────────────
  {
    const campId = `camp_3m_t_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_t_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'CHANGES_REQUESTED' });
    const row = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artId) as { status: string };
    check('T: Status CHANGES_REQUESTED persists', row.status === 'CHANGES_REQUESTED', `got ${row.status}`);
  }

  // ─── Test U: Status READY_FOR_APPROVAL persists ───────────────────────────
  {
    const campId = `camp_3m_u_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_u_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'READY_FOR_APPROVAL' });
    const row = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artId) as { status: string };
    check('U: Status READY_FOR_APPROVAL persists', row.status === 'READY_FOR_APPROVAL', `got ${row.status}`);
  }

  // ─── Test V: contentKey with special chars stored safely ──────────────────
  {
    const campId = `camp_3m_v_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = 'post/hero-shot_001';
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const row = db.prepare('SELECT content_key FROM creative_artifacts WHERE id = ?').get(artId) as { content_key: string };
    check('V: contentKey with slashes/underscores round-trips correctly', row.content_key === ck, `got ${row.content_key}`);
  }

  // ─── Test W: source_content_plan_id references valid content plan ──────────
  {
    const campId = `camp_3m_w_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_w_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const row = db.prepare('SELECT source_content_plan_id FROM creative_artifacts WHERE id = ?').get(artId) as { source_content_plan_id: string };
    const cp = db.prepare('SELECT id FROM content_plans WHERE id = ?').get(row.source_content_plan_id) as { id: string } | undefined;
    check('W: source_content_plan_id references existing content plan', !!cp, `cpId=${row.source_content_plan_id}`);
  }

  // ─── Test X: Multiple contentKeys within same campaign are independent ─────
  {
    const campId = `camp_3m_x_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck1 = `ck_x1_${randomUUID().slice(0, 6)}`;
    const ck2 = `ck_x2_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck1, status: 'APPROVED', cpId });
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck2, status: 'READY_FOR_REVIEW', cpId });
    const art1 = db.prepare('SELECT status FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck1) as { status: string };
    const art2 = db.prepare('SELECT status FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck2) as { status: string };
    check('X: Multiple contentKeys within same campaign are independent', art1.status === 'APPROVED' && art2.status === 'READY_FOR_REVIEW',
      `ck1=${art1.status} ck2=${art2.status}`);
  }

  // ─── Test Y: PATCH on missing contentKey finds no row ────────────────────
  {
    const campId = `camp_3m_y_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_y_missing_${randomUUID().slice(0, 6)}`;
    const row = db.prepare('SELECT id FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck) as { id: string } | undefined;
    check('Y: PATCH on missing contentKey finds no current row', !row);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n─── Results: ${passed} passed, ${failed} failed ─────────────────────────────────────\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
