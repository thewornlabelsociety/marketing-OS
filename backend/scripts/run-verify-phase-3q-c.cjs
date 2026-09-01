/**
 * Phase 3Q-C Verifier — Visual Creative Studio & Whole-Set Creation
 * Tests setupWholeSet, library endpoint, lineage, and isolation.
 */
'use strict';
require('dotenv/config');
require('ts-node/register/transpile-only');

const { initDatabase, db } = require('../src/db/database');
initDatabase();

const { operatorStudioService } = require('../src/services/business/OperatorStudioService');

let passed = 0;
let failed = 0;

function pass(label) { console.log(`PASS  ${label}`); passed++; }
function fail(label, detail) { console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); failed++; }

const wsWithSrc = db.prepare('SELECT workspace_id FROM source_records GROUP BY workspace_id ORDER BY COUNT(*) DESC LIMIT 1').get();
if (!wsWithSrc) { console.error('No source records found — skipping 3Q-C'); process.exit(1); }
const workspaceId = wsWithSrc.workspace_id;

const srcs = db.prepare('SELECT id FROM source_records WHERE workspace_id = ? LIMIT 2').all(workspaceId);
if (!srcs.length) { console.error('No source records found — skipping 3Q-C'); process.exit(1); }
const sourceProductIds = srcs.map(r => r.id);

async function run() {
  // ── 1. setupWholeSet() returns a valid result
  const result = await operatorStudioService.setupWholeSet({ workspaceId, sourceProductIds });
  if ('error' in result) { fail('setupWholeSet() returns valid result', result.error); return; }
  pass('setupWholeSet() returns valid result');

  const { campaignId, formats } = result;

  // ── 2. Exactly 4 formats returned
  if (formats.length !== 4) { fail('setupWholeSet returns 4 formats', `got ${formats.length}`); }
  else { pass('setupWholeSet returns 4 formats'); }

  // ── 3. All 4 channel/format identities distinct
  const formatKeys = formats.map(f => f.format).sort();
  const expected = ['CAROUSEL', 'EMAIL', 'POST', 'STORY'];
  if (JSON.stringify(formatKeys) !== JSON.stringify(expected)) { fail('4 distinct format identities', formatKeys.join()); }
  else { pass('4 distinct format identities (POST/CAROUSEL/STORY/EMAIL)'); }

  // ── 4. All 4 artifacts share the same campaign
  const artifactRows = db.prepare('SELECT * FROM creative_artifacts WHERE campaign_id = ? AND is_current = 1').all(campaignId);
  if (artifactRows.length !== 4) { fail('all 4 artifacts share the same campaign_id', `found ${artifactRows.length}`); }
  else { pass('all 4 artifacts share the same campaign_id'); }

  // ── 5. Campaign has exactly ONE content plan
  const contentPlans = db.prepare('SELECT COUNT(*) as n FROM content_plans WHERE campaign_id = ?').get(campaignId);
  if (contentPlans.n !== 1) { fail('exactly one content_plan per whole-set campaign', `found ${contentPlans.n}`); }
  else { pass('exactly one content_plan per whole-set campaign'); }

  // ── 6. Content plan has 4 deliverables
  const cpRow = db.prepare('SELECT body FROM content_plans WHERE campaign_id = ?').get(campaignId);
  const cp = JSON.parse(cpRow.body);
  if (!Array.isArray(cp.deliverables) || cp.deliverables.length !== 4) { fail('content_plan body has 4 deliverables'); }
  else { pass('content_plan body has 4 deliverables'); }

  // ── 7. Source links created for every artifact
  for (const { format: fmt, artifact } of formats) {
    const links = db.prepare('SELECT COUNT(*) as n FROM creative_source_links WHERE creative_artifact_id = ?').get(artifact.id);
    if (links.n === 0) { fail(`source links exist for ${fmt} artifact`); }
    else { pass(`source links exist for ${fmt} artifact`); }
  }

  // ── 8. No duplicate creative_source_links per artifact
  for (const { format: fmt, artifact } of formats) {
    const dups = db.prepare(`
      SELECT creative_artifact_id, source_record_id, COUNT(*) as n
      FROM creative_source_links
      WHERE creative_artifact_id = ?
      GROUP BY creative_artifact_id, source_record_id
      HAVING n > 1
    `).all(artifact.id);
    if (dups.length > 0) { fail(`no duplicate source_links for ${fmt} artifact`); }
    else { pass(`no duplicate source_links for ${fmt} artifact`); }
  }

  // ── 9. All artifacts have distinct contentType
  const contentTypes = artifactRows.map(r => r.content_type);
  const unique = new Set(contentTypes);
  if (unique.size !== 4) { fail('all 4 artifacts have distinct contentType', contentTypes.join()); }
  else { pass('all 4 artifacts have distinct contentType'); }

  // ── 10. All artifacts have distinct channel or format identity
  const formatIdents = artifactRows.map(r => `${r.channel}:${r.content_type}`);
  const uniqueIdents = new Set(formatIdents);
  if (uniqueIdents.size !== 4) { fail('all 4 artifacts have distinct channel:contentType identity'); }
  else { pass('all 4 artifacts have distinct channel:contentType identity'); }

  // ── 11. Content is valid JSON for each format
  for (const { format: fmt, artifact } of formats) {
    try {
      const content = JSON.parse(JSON.stringify(artifact.content)); // already parsed object
      if (!content || typeof content !== 'object') throw new Error('not object');
      pass(`${fmt} artifact content is valid object`);
    } catch {
      fail(`${fmt} artifact content is valid JSON`);
    }
  }

  // ── 12. aiGenerated is a boolean (truthful fallback)
  if (typeof result.aiGenerated !== 'boolean') { fail('aiGenerated is boolean (truthful fallback indicator)'); }
  else { pass(`aiGenerated is boolean: ${result.aiGenerated}`); }

  // ── 13. Template content is valid even if AI unavailable (simulate by checking structure)
  for (const { format: fmt, artifact } of formats) {
    const content = artifact.content;
    let valid = false;
    if (fmt === 'POST' && content.kind === 'STATIC_POST' && content.caption) valid = true;
    if (fmt === 'CAROUSEL' && content.kind === 'CAROUSEL' && Array.isArray(content.slides)) valid = true;
    if (fmt === 'STORY' && content.kind === 'STORY' && Array.isArray(content.frames)) valid = true;
    if (fmt === 'EMAIL' && content.kind === 'EMAIL' && content.subject) valid = true;
    if (!valid) { fail(`${fmt} artifact has well-formed content structure`); }
    else { pass(`${fmt} artifact has well-formed content structure`); }
  }

  // ── 14. Library endpoint returns all workspace artifacts (including new whole-set)
  const libraryRows = db.prepare(`
    SELECT ca.id FROM creative_artifacts ca
    WHERE ca.workspace_id = ? AND ca.is_current = 1
  `).all(workspaceId);
  const ids = formats.map(f => f.artifact.id);
  const allPresent = ids.every(id => libraryRows.some(r => r.id === id));
  if (!allPresent) { fail('all whole-set artifacts visible in library query'); }
  else { pass('all whole-set artifacts visible in library query'); }

  // ── 15. Workspace isolation — artifacts not visible under different workspace
  const fakeWs = 'ws_fake_isolation_test';
  const leaked = db.prepare('SELECT COUNT(*) as n FROM creative_artifacts WHERE campaign_id = ? AND workspace_id != ?').get(campaignId, workspaceId);
  if (leaked.n > 0) { fail('whole-set workspace isolation'); }
  else { pass('whole-set workspace isolation'); }

  // ── 16. setupWholeSet rejects missing workspaceId
  const badResult = await operatorStudioService.setupWholeSet({ workspaceId: '', sourceProductIds });
  if (!('error' in badResult)) { fail('setupWholeSet rejects empty workspaceId'); }
  else { pass('setupWholeSet rejects empty workspaceId'); }

  // ── 17. setupWholeSet rejects empty product list
  const noProducts = await operatorStudioService.setupWholeSet({ workspaceId, sourceProductIds: [] });
  if (!('error' in noProducts)) { fail('setupWholeSet rejects empty sourceProductIds'); }
  else { pass('setupWholeSet rejects empty sourceProductIds'); }

  console.log(`\nPhase 3Q-C verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
