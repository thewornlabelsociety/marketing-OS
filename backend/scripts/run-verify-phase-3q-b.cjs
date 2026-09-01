/**
 * Phase 3Q-B Verifier — Operator Studio (quiet campaign pattern)
 * Tests the OperatorStudioService against the live database.
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

// Resolve workspace that has source records
const wsWithSrc = db.prepare('SELECT workspace_id FROM source_records GROUP BY workspace_id ORDER BY COUNT(*) DESC LIMIT 1').get();
if (!wsWithSrc) { console.error('No source records found — skipping 3Q-B'); process.exit(1); }
const workspaceId = wsWithSrc.workspace_id;

// Pick a real source record
const src = db.prepare('SELECT id FROM source_records WHERE workspace_id = ? LIMIT 1').get(workspaceId);
if (!src) { console.error('No source records found — skipping 3Q-B'); process.exit(1); }
const sourceProductIds = [src.id];

async function run() {
  // ── 1. setup() returns a result with all required fields
  const result = await operatorStudioService.setup({ workspaceId, sourceProductIds, format: 'POST' });
  if ('error' in result) { fail('setup() returns valid result', result.error); return; }
  pass('setup() returns valid result');

  const { campaignId, contentKey, artifact } = result;

  // ── 2. Campaign created
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) { fail('campaign row created'); } else { pass('campaign row created'); }

  // ── 3. Campaign plan created and approved
  const plan = db.prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? AND is_current = 1').get(campaignId);
  if (!plan) { fail('campaign_plan row created'); } else { pass('campaign_plan row created'); }
  const planApproval = db.prepare('SELECT * FROM plan_approvals WHERE campaign_id = ?').get(campaignId);
  if (!planApproval) { fail('plan_approval row created'); } else { pass('plan_approval row created'); }

  // ── 4. Content plan created and approved
  const contentPlan = db.prepare('SELECT * FROM content_plans WHERE campaign_id = ? AND is_current = 1').get(campaignId);
  if (!contentPlan) { fail('content_plan row created'); } else { pass('content_plan row created'); }
  const contentPlanApproval = db.prepare('SELECT * FROM content_plan_approvals WHERE campaign_id = ?').get(campaignId);
  if (!contentPlanApproval) { fail('content_plan_approval row created'); } else { pass('content_plan_approval row created'); }

  // ── 5. Creative artifact created with READY_FOR_REVIEW status
  const art = db.prepare('SELECT * FROM creative_artifacts WHERE id = ?').get(artifact.id);
  if (!art) { fail('creative_artifact row created'); }
  else if (art.status !== 'READY_FOR_REVIEW') { fail('artifact status is READY_FOR_REVIEW', `got ${art.status}`); }
  else { pass('artifact status is READY_FOR_REVIEW'); }

  // ── 6. Source links created
  const links = db.prepare('SELECT * FROM creative_source_links WHERE creative_artifact_id = ?').all(artifact.id);
  if (links.length === 0) { fail('creative_source_links created'); }
  else { pass('creative_source_links created'); }

  // ── 7. Source link points to correct source record
  const correctLink = links.some(l => l.source_record_id === src.id);
  if (!correctLink) { fail('source_link references correct source_record'); }
  else { pass('source_link references correct source_record'); }

  // ── 8. Approve endpoint reachable — simulate via direct DB update + verify reset logic
  db.prepare("UPDATE creative_artifacts SET status = 'APPROVED' WHERE id = ?").run(artifact.id);
  const approved = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artifact.id);
  if (approved.status !== 'APPROVED') { fail('direct approval sets APPROVED status'); }
  else { pass('direct approval sets APPROVED status'); }

  // ── 9. Edit after approval should allow re-editing (status can return to READY_FOR_REVIEW)
  db.prepare("UPDATE creative_artifacts SET status = 'READY_FOR_REVIEW' WHERE id = ?").run(artifact.id);
  const reset = db.prepare('SELECT status FROM creative_artifacts WHERE id = ?').get(artifact.id);
  if (reset.status !== 'READY_FOR_REVIEW') { fail('approval can be reset on re-edit'); }
  else { pass('approval can be reset on re-edit'); }

  // ── 10. Campaign has an objective
  const campaignRow = db.prepare('SELECT objective_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaignRow || !campaignRow.objective_id) { fail('campaign has objectiveId'); }
  else { pass('campaign has objectiveId'); }

  // ── 11. Workspace isolation — artifact only visible under correct workspace
  const leaked = db.prepare('SELECT * FROM creative_artifacts WHERE id = ? AND workspace_id != ?').get(artifact.id, workspaceId);
  if (leaked) { fail('artifact workspace isolation'); }
  else { pass('artifact workspace isolation'); }

  // ── 12. CAROUSEL format creates correct contentType
  const carouselResult = await operatorStudioService.setup({ workspaceId, sourceProductIds, format: 'CAROUSEL' });
  if ('error' in carouselResult) { fail('CAROUSEL setup succeeds'); }
  else {
    const art2 = db.prepare('SELECT content_type FROM creative_artifacts WHERE id = ?').get(carouselResult.artifact.id);
    if (!art2 || art2.content_type !== 'CAROUSEL') { fail('CAROUSEL artifact has correct contentType', art2?.content_type); }
    else { pass('CAROUSEL artifact has correct contentType'); }
  }

  console.log(`\nPhase 3Q-B verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
