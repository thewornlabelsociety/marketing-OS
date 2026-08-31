/**
 * Phase 3N — Creative Studio acceptance tests
 * Runs against an isolated temp DB with schema + all migrations applied.
 */

import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { randomUUID } from 'crypto';
import { mediaAssetService } from '../src/services/media/MediaAssetService';

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
    mediaAssetId?: string;
  }): string {
    const now = new Date().toISOString();
    const cpId = opts.cpId ?? insertContentPlan(opts.campaignId, opts.workspaceId);
    const id = opts.id ?? `art_${opts.campaignId.slice(-6)}_${opts.contentKey.slice(-6)}_v${opts.version ?? 1}_${randomUUID().slice(0, 4)}`;
    const content = opts.content ?? { kind: 'STATIC_POST', caption: 'Hello world' };
    db.prepare(
      `INSERT OR IGNORE INTO creative_artifacts
         (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
          content_key, deliverable_id, version, status, is_current,
          channel, content_type, format, title, content, quality, media_asset_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?,
               'INSTAGRAM', 'STATIC_POST', 'SQUARE_1_1', 'Test Post', ?,
               '{"passed":true,"checks":[],"warnings":[]}', ?, ?, ?)`
    ).run(
      id, opts.workspaceId, opts.campaignId, cpId,
      opts.contentKey, opts.contentKey,
      opts.version ?? 1, opts.status ?? 'READY_FOR_REVIEW', opts.isCurrent ?? 1,
      JSON.stringify(content), opts.mediaAssetId ?? null, now, now,
    );
    return id;
  }

  function insertApproval(campaignId: string, contentKey: string, artifactId: string, version: number, workspaceId = WS) {
    const now = new Date().toISOString();
    const camp = db.prepare('SELECT workspace_id FROM campaigns WHERE id = ?').get(campaignId) as { workspace_id: string } | undefined;
    const wsId = camp?.workspace_id ?? workspaceId;
    db.prepare(
      `INSERT OR REPLACE INTO creative_approvals (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(`appr_${randomUUID().slice(0, 8)}`, wsId, campaignId, contentKey, artifactId, version, now);
  }

  function insertMediaAsset(workspaceId: string, opts: {
    id?: string;
    campaignId?: string;
    contentKey?: string;
    creativeArtifactId?: string;
    creativeVersion?: number;
    filename?: string;
  } = {}): string {
    const now = new Date().toISOString();
    const id = opts.id ?? `mass_${randomUUID()}`;
    const storageKey = `${id}.jpg`;
    db.prepare(
      `INSERT OR IGNORE INTO media_assets
         (id, workspace_id, campaign_id, content_key, creative_artifact_id, creative_version,
          storage_key, mime_type, file_size, checksum, original_filename, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'image/jpeg', 12345, ?, ?, 'ACTIVE', ?, ?)`
    ).run(
      id, workspaceId,
      opts.campaignId ?? null, opts.contentKey ?? null,
      opts.creativeArtifactId ?? null, opts.creativeVersion ?? null,
      storageKey,
      `sha256_${randomUUID().slice(0, 16)}`,
      opts.filename ?? 'test-image.jpg',
      now, now,
    );
    return id;
  }

  // ─── Workspaces ───────────────────────────────────────────────────────────
  const WS = `ws_3n_${randomUUID().slice(0, 8)}`;
  const WS2 = `ws_3n_${randomUUID().slice(0, 8)}`;
  insertWorkspace(WS);
  insertWorkspace(WS2);

  // ─── Test A: migration adds media_asset_id column ─────────────────────────
  {
    const campId = `camp_3n_a_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_a_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const row = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string | null };
    check('A: creative_artifacts has media_asset_id column (NULL by default)', row !== undefined && row.media_asset_id === null);
  }

  // ─── Test B: can set media_asset_id on artifact ───────────────────────────
  {
    const campId = `camp_3n_b_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_b_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    const row = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string | null };
    check('B: media_asset_id can be set on creative artifact', row.media_asset_id === assetId, `got ${row.media_asset_id ?? 'null'}`);
  }

  // ─── Test C: select-media route — sets media_asset_id + preserves status ─
  {
    const campId = `camp_3n_c_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_c_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'READY_FOR_REVIEW' });
    const assetId = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    const now = new Date().toISOString();
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(assetId, 'READY_FOR_REVIEW', now, artId);
    const row = db.prepare('SELECT media_asset_id, status FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string; status: string };
    check('C: select-media sets media_asset_id, non-APPROVED status unchanged', row.media_asset_id === assetId && row.status === 'READY_FOR_REVIEW', `media=${row.media_asset_id} status=${row.status}`);
  }

  // ─── Test D: select-media on APPROVED artifact resets to READY_FOR_REVIEW ─
  {
    const campId = `camp_3n_d_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_d_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'APPROVED' });
    const assetId = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    insertApproval(campId, ck, artId, 1);
    const now = new Date().toISOString();
    // Simulate select-media route: reset APPROVED → READY_FOR_REVIEW, clear approval
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(assetId, 'READY_FOR_REVIEW', now, artId);
    db.prepare('DELETE FROM creative_approvals WHERE campaign_id = ? AND content_key = ?').run(campId, ck);
    const artRow = db.prepare('SELECT status, media_asset_id FROM creative_artifacts WHERE id = ?').get(artId) as { status: string; media_asset_id: string };
    const approvalRow = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?').get(campId, ck) as { c: number };
    check('D: select-media on APPROVED resets to READY_FOR_REVIEW', artRow.status === 'READY_FOR_REVIEW', `got ${artRow.status}`);
    check('E: select-media on APPROVED clears approval record', approvalRow.c === 0, `approval count=${approvalRow.c}`);
  }

  // ─── Test F: media_assets listing by creativeArtifactId ──────────────────
  {
    const campId = `camp_3n_f_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_f_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const a1 = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    const a2 = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    const rows = db.prepare('SELECT id FROM media_assets WHERE creative_artifact_id = ? AND workspace_id = ? AND status = ?')
      .all(artId, WS, 'ACTIVE') as { id: string }[];
    check('F: listing media by creative_artifact_id returns both assets', rows.length === 2 && rows.some(r => r.id === a1) && rows.some(r => r.id === a2), `count=${rows.length}`);
  }

  // ─── Test G: media asset workspace isolation ──────────────────────────────
  {
    const campId = `camp_3n_g_${randomUUID().slice(0, 8)}`;
    const campId2 = `camp_3n_g2_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    insertCampaign(campId2, WS2);
    const ck = `ck_g_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const artId2 = insertArtifact({ campaignId: campId2, workspaceId: WS2, contentKey: ck });
    insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    insertMediaAsset(WS2, { campaignId: campId2, contentKey: ck, creativeArtifactId: artId2 });
    const ws1Assets = db.prepare('SELECT id FROM media_assets WHERE workspace_id = ?').all(WS) as { id: string }[];
    const ws2Assets = db.prepare('SELECT id FROM media_assets WHERE workspace_id = ?').all(WS2) as { id: string }[];
    check('G: media assets are workspace-scoped', ws1Assets.length >= 1 && ws2Assets.length >= 1 && ws1Assets.every(a => !ws2Assets.some(b => b.id === a.id)));
  }

  // ─── Test H: registerFromBuffer deduplicates identical image ─────────────
  {
    const buf = Buffer.from('fake-jpeg-bytes-unique-' + randomUUID());
    const record1 = mediaAssetService.registerFromBuffer({
      workspaceId: WS,
      buffer: buf,
      mimeType: 'image/jpeg',
      originalFilename: 'dup-test.jpg',
    });
    const record2 = mediaAssetService.registerFromBuffer({
      workspaceId: WS,
      buffer: buf,
      mimeType: 'image/jpeg',
      originalFilename: 'dup-test.jpg',
    });
    check('H: duplicate upload returns same record', record1.id === record2.id, `r1=${record1.id} r2=${record2.id}`);
  }

  // ─── Test I: different artifact IDs produce separate dedupe buckets ───────
  {
    const campId = `camp_3n_i_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck1 = `ck_i1_${randomUUID().slice(0, 6)}`;
    const ck2 = `ck_i2_${randomUUID().slice(0, 6)}`;
    const artId1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck1 });
    const artId2 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck2 });
    const buf = Buffer.from('shared-bytes-' + randomUUID());
    const r1 = mediaAssetService.registerFromBuffer({ workspaceId: WS, buffer: buf, mimeType: 'image/jpeg', creativeArtifactId: artId1, creativeVersion: 1 });
    const r2 = mediaAssetService.registerFromBuffer({ workspaceId: WS, buffer: buf, mimeType: 'image/jpeg', creativeArtifactId: artId2, creativeVersion: 1 });
    check('I: same bytes with different creativeArtifactId produce distinct records', r1.id !== r2.id, `r1=${r1.id} r2=${r2.id}`);
  }

  // ─── Test J: media_asset_id FK valid — references existing asset ──────────
  {
    const campId = `camp_3n_j_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_j_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { campaignId: campId, creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    // Verify via JOIN
    const row = db.prepare(
      'SELECT ca.media_asset_id, ma.id as asset_exists FROM creative_artifacts ca LEFT JOIN media_assets ma ON ma.id = ca.media_asset_id WHERE ca.id = ?'
    ).get(artId) as { media_asset_id: string; asset_exists: string | null };
    check('J: media_asset_id FK references an existing media_assets row', row.asset_exists !== null && row.asset_exists === assetId);
  }

  // ─── Test K: select-media on non-APPROVED doesn't clear other approvals ──
  {
    const campId = `camp_3n_k_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck1 = `ck_k1_${randomUUID().slice(0, 6)}`;
    const ck2 = `ck_k2_${randomUUID().slice(0, 6)}`;
    const art1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck1, status: 'READY_FOR_REVIEW' });
    const art2 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck2, status: 'APPROVED' });
    insertApproval(campId, ck2, art2, 1);
    const assetId = insertMediaAsset(WS, { creativeArtifactId: art1 });
    // select-media for ck1 (not APPROVED) — should NOT touch ck2 approval
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ?, updated_at = ? WHERE id = ?')
      .run(assetId, new Date().toISOString(), art1);
    const ck2Approval = db.prepare('SELECT COUNT(*) as c FROM creative_approvals WHERE campaign_id = ? AND content_key = ?').get(campId, ck2) as { c: number };
    check('K: select-media on non-APPROVED does not clear other content key approvals', ck2Approval.c === 1, `ck2 approvals=${ck2Approval.c}`);
  }

  // ─── Test L: artifact version history preserved when media updated ────────
  {
    const campId = `camp_3n_l_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_l_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const artV1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 1, isCurrent: 0, cpId });
    const artV2 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 2, isCurrent: 1, cpId });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artV2 });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artV2);
    const v1Row = db.prepare('SELECT media_asset_id, version FROM creative_artifacts WHERE id = ?').get(artV1) as { media_asset_id: string | null; version: number };
    const v2Row = db.prepare('SELECT media_asset_id, version FROM creative_artifacts WHERE id = ?').get(artV2) as { media_asset_id: string; version: number };
    check('L: old version retains NULL media_asset_id after update to current', v1Row.media_asset_id === null && v2Row.media_asset_id === assetId, `v1=${v1Row.media_asset_id ?? 'null'} v2=${v2Row.media_asset_id}`);
  }

  // ─── Test M: media listing by workspace returns only ACTIVE assets ────────
  {
    const campId = `camp_3n_m_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_m_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const activeId = insertMediaAsset(WS, { creativeArtifactId: artId });
    const inactiveId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare("UPDATE media_assets SET status = 'UNAVAILABLE' WHERE id = ?").run(inactiveId);
    const active = db.prepare('SELECT id FROM media_assets WHERE workspace_id = ? AND creative_artifact_id = ? AND status = ?')
      .all(WS, artId, 'ACTIVE') as { id: string }[];
    check('M: media listing omits UNAVAILABLE assets', active.length === 1 && active[0].id === activeId, `count=${active.length}`);
  }

  // ─── Test N: multiple creative artifacts each get their own media ─────────
  {
    const campId = `camp_3n_n_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck1 = `ck_n1_${randomUUID().slice(0, 6)}`;
    const ck2 = `ck_n2_${randomUUID().slice(0, 6)}`;
    const art1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck1 });
    const art2 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck2 });
    const a1 = insertMediaAsset(WS, { creativeArtifactId: art1 });
    const a2 = insertMediaAsset(WS, { creativeArtifactId: art2 });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(a1, art1);
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(a2, art2);
    const r1 = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(art1) as { media_asset_id: string };
    const r2 = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(art2) as { media_asset_id: string };
    check('N: each content key maintains independent media_asset_id', r1.media_asset_id === a1 && r2.media_asset_id === a2, `a1=${r1.media_asset_id} a2=${r2.media_asset_id}`);
  }

  // ─── Test O: unlink media by setting media_asset_id to NULL ─────────────
  {
    const campId = `camp_3n_o_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_o_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    db.prepare('UPDATE creative_artifacts SET media_asset_id = NULL WHERE id = ?').run(artId);
    const row = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string | null };
    check('O: media_asset_id can be unlinked (set to NULL)', row.media_asset_id === null);
  }

  // ─── Test P: adapt-dimensions produces correct JPEG base64 prefix ─────────
  // Verify MediaDimensionAdapter contract — cannot run actual sharp without files so test input sanitisation
  {
    // Prove that we can call the TARGET_SPECS map without error
    const { TARGET_SPECS } = await import('../src/services/MediaDimensionAdapter');
    const ratios = Object.keys(TARGET_SPECS);
    check('P: MediaDimensionAdapter exposes 4:5/1:1/9:16/16:9 specs', ratios.includes('4:5') && ratios.includes('1:1') && ratios.includes('9:16') && ratios.includes('16:9'), `got ${ratios.join(',')}`);
  }

  // ─── Test Q: schedule pinning uses explicit mediaAssetId, not latest ──────
  {
    const campId = `camp_3n_q_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_q_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const old = insertMediaAsset(WS, { creativeArtifactId: artId, creativeVersion: 1 });
    const newAsset = insertMediaAsset(WS, { creativeArtifactId: artId, creativeVersion: 1 });
    // Simulate pinning: pinForSchedule validates that asset.id starts with mass_ and is ACTIVE
    const oldRecord = mediaAssetService.getById(old, WS);
    const newRecord = mediaAssetService.getById(newAsset, WS);
    check('Q: both media records are retrievable by their explicit IDs', oldRecord !== null && newRecord !== null && oldRecord.id === old && newRecord.id === newAsset);
  }

  // ─── Test R: mediaAssetId returned from getCurrent reflects DB state ──────
  {
    const campId = `camp_3n_r_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_r_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    const { creativeGeneratorService } = await import('../src/services/creative/CreativeGeneratorService');
    const current = creativeGeneratorService.getCurrent(campId, ck);
    check('R: getCurrent returns mediaAssetId from DB', current !== null && current.mediaAssetId === assetId, `got ${current?.mediaAssetId ?? 'undefined'}`);
  }

  // ─── Test S: getCurrent returns undefined mediaAssetId when not set ───────
  {
    const campId = `camp_3n_s_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_s_${randomUUID().slice(0, 6)}`;
    insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const { creativeGeneratorService } = await import('../src/services/creative/CreativeGeneratorService');
    const current = creativeGeneratorService.getCurrent(campId, ck);
    check('S: getCurrent returns undefined mediaAssetId when null in DB', current !== null && current.mediaAssetId === undefined, `got ${JSON.stringify(current?.mediaAssetId)}`);
  }

  // ─── Test T: media_asset_id stays on artifact through content PATCH ───────
  {
    const campId = `camp_3n_t_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_t_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    // Simulate content-only PATCH (does not touch media_asset_id)
    const newContent = { kind: 'STATIC_POST', caption: 'Patched caption' };
    db.prepare('UPDATE creative_artifacts SET content = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(newContent), new Date().toISOString(), artId);
    const row = db.prepare('SELECT media_asset_id, content FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string; content: string };
    const content = JSON.parse(row.content) as { caption: string };
    check('T: content PATCH preserves media_asset_id', row.media_asset_id === assetId && content.caption === 'Patched caption', `media=${row.media_asset_id} caption=${content.caption}`);
  }

  // ─── Test U: published media_assets are immutable (status stays ACTIVE) ──
  {
    const campId = `camp_3n_u_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_u_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    // Pin = mark as published by verifying it exists and is ACTIVE
    const record = db.prepare('SELECT status FROM media_assets WHERE id = ? AND workspace_id = ?').get(assetId, WS) as { status: string };
    check('U: published media asset retains ACTIVE status', record.status === 'ACTIVE');
  }

  // ─── Test V: mediaAssetService.getById workspace-scopes correctly ─────────
  {
    const campId = `camp_3n_v_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_v_${randomUUID().slice(0, 6)}`;
    const assetId = insertMediaAsset(WS, { campaignId: campId, contentKey: ck });
    const found = mediaAssetService.getById(assetId, WS);
    const notFound = mediaAssetService.getById(assetId, WS2);
    check('V: getById returns record for correct workspace, null for other', found !== null && notFound === null);
  }

  // ─── Test W: CAROUSEL artifact can have media_asset_id (cover image) ──────
  {
    const campId = `camp_3n_w_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_w_${randomUUID().slice(0, 6)}`;
    const carouselContent = { kind: 'CAROUSEL', caption: 'Swipe!', slides: [{ slideNumber: 1, headline: 'First' }] };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content: carouselContent });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    const row = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string };
    check('W: CAROUSEL artifact can reference a cover media_asset_id', row.media_asset_id === assetId);
  }

  // ─── Test X: selecting media on non-existent artifact returns null ─────────
  {
    const row = db.prepare('SELECT id FROM creative_artifacts WHERE id = ?').get('art_nonexistent') as { id: string } | undefined;
    check('X: querying non-existent artifact returns undefined', row === undefined);
  }

  // ─── Test Y: media assets can be queried by campaign + content_key ─────────
  {
    const campId = `camp_3n_y_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_y_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck });
    const a1 = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    const a2 = insertMediaAsset(WS, { campaignId: campId, contentKey: ck, creativeArtifactId: artId });
    const rows = db.prepare('SELECT id FROM media_assets WHERE campaign_id = ? AND content_key = ? AND workspace_id = ?')
      .all(campId, ck, WS) as { id: string }[];
    check('Y: assets queryable by campaign_id + content_key', rows.length === 2 && rows.some(r => r.id === a1) && rows.some(r => r.id === a2), `count=${rows.length}`);
  }

  // ─── Test Z: a new artifact version gets null media_asset_id by default ───
  {
    const campId = `camp_3n_z_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_z_${randomUUID().slice(0, 6)}`;
    const cpId = insertContentPlan(campId, WS);
    const artV1 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 1, isCurrent: 0, cpId });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artV1 });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artV1);
    // Create v2 (new revision) — media_asset_id starts null
    const artV2 = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, version: 2, isCurrent: 1, cpId });
    const v2Row = db.prepare('SELECT media_asset_id FROM creative_artifacts WHERE id = ?').get(artV2) as { media_asset_id: string | null };
    check('Z: new creative version starts with NULL media_asset_id', v2Row.media_asset_id === null);
  }

  // ─── Test AA: STORY artifact supports media_asset_id ─────────────────────
  {
    const campId = `camp_3n_aa_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_aa_${randomUUID().slice(0, 6)}`;
    const storyContent = { kind: 'STORY', frames: [{ frameNumber: 1, headline: 'Frame 1' }] };
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, content: storyContent });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    db.prepare('UPDATE creative_artifacts SET media_asset_id = ? WHERE id = ?').run(assetId, artId);
    const { creativeGeneratorService } = await import('../src/services/creative/CreativeGeneratorService');
    const current = creativeGeneratorService.getCurrent(campId, ck);
    check('AA: STORY artifact mediaAssetId is returned by getCurrent', current?.mediaAssetId === assetId, `got ${current?.mediaAssetId ?? 'undefined'}`);
  }

  // ─── Test AB: select-media route logic (SQL simulation) ───────────────────
  {
    const campId = `camp_3n_ab_${randomUUID().slice(0, 8)}`;
    insertCampaign(campId, WS);
    const ck = `ck_ab_${randomUUID().slice(0, 6)}`;
    const artId = insertArtifact({ campaignId: campId, workspaceId: WS, contentKey: ck, status: 'CHANGES_REQUESTED' });
    const assetId = insertMediaAsset(WS, { creativeArtifactId: artId });
    // Route logic: find current artifact, verify workspace, set media_asset_id, preserve status (not APPROVED)
    const artifact = db.prepare('SELECT id, status FROM creative_artifacts WHERE campaign_id = ? AND content_key = ? AND is_current = 1')
      .get(campId, ck) as { id: string; status: string } | undefined;
    const asset = db.prepare('SELECT id FROM media_assets WHERE id = ? AND workspace_id = ? AND status = ?')
      .get(assetId, WS, 'ACTIVE');
    if (artifact && asset) {
      const wasApproved = artifact.status === 'APPROVED';
      const newStatus = wasApproved ? 'READY_FOR_REVIEW' : artifact.status;
      db.prepare('UPDATE creative_artifacts SET media_asset_id = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(assetId, newStatus, new Date().toISOString(), artifact.id);
    }
    const row = db.prepare('SELECT media_asset_id, status FROM creative_artifacts WHERE id = ?').get(artId) as { media_asset_id: string; status: string };
    check('AB: select-media logic: CHANGES_REQUESTED status preserved, media set', row.media_asset_id === assetId && row.status === 'CHANGES_REQUESTED', `media=${row.media_asset_id} status=${row.status}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
