'use strict';
/**
 * Phase 4B verifier — Marketing Expert / Recommendations
 * Run: node scripts/run-verify-phase-4b.cjs
 * Checks: schema, service contracts, API wiring, frontend integration, WLS read-only.
 */

require('dotenv/config');
require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Live DB ──────────────────────────────────────────────────────────────────

const { initDatabase, db } = require('../src/db/database');
initDatabase();

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      r.then(() => { console.log(`PASS  ${name}`); passed++; })
       .catch(err => { console.error(`FAIL  ${name} — ${err.message}`); failed++; });
      return r;
    }
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}
function assertEqual(a, b, label) {
  if (a !== b) throw new Error(`${label ?? 'assertEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function readSrc(rel) {
  const p = path.join(__dirname, '..', rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function readFrontend(rel) {
  const p = path.join(__dirname, '../..', 'frontend/src', rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

const now = new Date().toISOString();

// ─── [1] Migration schema ─────────────────────────────────────────────────────

console.log('\n[1] Migration — 021-marketing-recommendations.sql');

const m021 = readSrc('src/db/migrations/021-marketing-recommendations.sql');
test('021 migration file exists', () => assert(m021 !== null));
test('021 creates marketing_recommendations table', () => assert(m021.includes('CREATE TABLE IF NOT EXISTS marketing_recommendations')));
test('021 creates UNIQUE(workspace_id, fingerprint)', () => assert(m021.includes('UNIQUE(workspace_id, fingerprint)')));
test('021 adds recommendation_id to campaigns', () => assert(m021.includes('ALTER TABLE campaigns ADD COLUMN recommendation_id')));
test('021 adds last_recommendation_context_sig to workspace_ai_budget', () => assert(m021.includes('last_recommendation_context_sig')));
test('021 adds last_recommendation_generated_at to workspace_ai_budget', () => assert(m021.includes('last_recommendation_generated_at')));
test('021 includes objective_id FK ON DELETE SET NULL', () => assert(m021.includes('objective_id TEXT REFERENCES objectives(id) ON DELETE SET NULL')));

// ─── [2] Live schema checks ───────────────────────────────────────────────────

console.log('\n[2] Live DB schema');

test('marketing_recommendations table exists in live DB', () => {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='marketing_recommendations'").get();
  assert(t, 'marketing_recommendations table missing from live DB — run migrations');
});

test('marketing_recommendations has all required columns', () => {
  const cols = db.prepare('PRAGMA table_info(marketing_recommendations)').all().map(r => r.name);
  const required = [
    'id','workspace_id','fingerprint','status','recommendation_type','generation_source',
    'title','summary','rationale','priority','confidence','marketing_scopes_json',
    'objective_id','primary_channel','secondary_channels_json','content_type','creative_direction',
    'source_product_ids_json','source_seller_ids_json','hook','angle','cta','talking_points_json',
    'suggested_duration_seconds','accepted_campaign_id','accepted_artifact_id',
    'expires_at','accepted_at','dismissed_at','completed_at','created_at','updated_at',
  ];
  for (const col of required) {
    assert(cols.includes(col), `Missing column: ${col}`);
  }
});

test('campaigns.recommendation_id column exists in live DB', () => {
  const cols = db.prepare('PRAGMA table_info(campaigns)').all().map(r => r.name);
  assert(cols.includes('recommendation_id'), 'campaigns.recommendation_id missing — run migration 021');
});

test('workspace_ai_budget.last_recommendation_context_sig exists', () => {
  const cols = db.prepare('PRAGMA table_info(workspace_ai_budget)').all().map(r => r.name);
  assert(cols.includes('last_recommendation_context_sig'));
});

test('workspace_ai_budget.last_recommendation_generated_at exists', () => {
  const cols = db.prepare('PRAGMA table_info(workspace_ai_budget)').all().map(r => r.name);
  assert(cols.includes('last_recommendation_generated_at'));
});

test('Index idx_marketing_recommendations_workspace_status exists', () => {
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_marketing_recommendations_workspace_status'").get();
  assert(idx, 'Index missing');
});

// ─── [3] Fingerprint idempotency via live DB ──────────────────────────────────

console.log('\n[3] Fingerprint idempotency');

// Find a workspace that exists
const ws = db.prepare("SELECT id FROM entities WHERE id LIKE 'ws_%' OR id LIKE 'ent_%' LIMIT 1").get()
  ?? db.prepare('SELECT id FROM entities LIMIT 1').get();

test('UNIQUE(workspace_id, fingerprint) prevents duplicate INSERT', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  const fp = 'test_fp_phase4b_' + Date.now();
  const baseParams = [ws.id, fp, 'FEATURE_NEW_ARRIVALS', 'RULE_BASED', 'T', 'S', 'R', now, now];
  db.prepare(`INSERT OR IGNORE INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('fp_dup_a_4b',?,?,'NEW',?,?,'T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(ws.id, fp, 'FEATURE_NEW_ARRIVALS', 'RULE_BASED', now, now);
  let threw = false;
  try {
    db.prepare(`INSERT INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('fp_dup_b_4b',?,?,'NEW',?,?,'T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(ws.id, fp, 'FEATURE_NEW_ARRIVALS', 'RULE_BASED', now, now);
  } catch (e) { threw = true; }
  assert(threw, 'Expected UNIQUE violation on duplicate fingerprint');
  db.prepare('DELETE FROM marketing_recommendations WHERE fingerprint = ?').run(fp);
});

test('INSERT OR IGNORE on duplicate fingerprint silently succeeds', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  const fp = 'test_ioi_phase4b_' + Date.now();
  db.prepare(`INSERT OR IGNORE INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('ioi_1_4b',?,?,'NEW','FILL_CALENDAR_GAP','RULE_BASED','T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(ws.id, fp, now, now);
  db.prepare(`INSERT OR IGNORE INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('ioi_2_4b',?,?,'NEW','FILL_CALENDAR_GAP','RULE_BASED','T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(ws.id, fp, now, now);
  const count = db.prepare('SELECT COUNT(*) AS n FROM marketing_recommendations WHERE fingerprint = ?').get(fp).n;
  assertEqual(count, 1, 'Only 1 row despite 2 INSERT OR IGNORE calls');
  db.prepare('DELETE FROM marketing_recommendations WHERE fingerprint = ?').run(fp);
});

// ─── [4] Status lifecycle ─────────────────────────────────────────────────────

console.log('\n[4] Status lifecycle');

test('status: NEW → DISMISSED transition', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  const fp = 'lifecycle_dis_' + Date.now();
  db.prepare(`INSERT INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('lc_dis_4b',?,?,'NEW','FEATURE_NEW_ARRIVALS','RULE_BASED','T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(ws.id, fp, now, now);
  db.prepare("UPDATE marketing_recommendations SET status='DISMISSED', dismissed_at=?, updated_at=? WHERE id='lc_dis_4b'").run(now, now);
  const r = db.prepare("SELECT status FROM marketing_recommendations WHERE id='lc_dis_4b'").get();
  assertEqual(r.status, 'DISMISSED', 'status after dismiss');
  db.prepare("DELETE FROM marketing_recommendations WHERE id='lc_dis_4b'").run();
});

test('status: NEW → ACCEPTED with campaign+artifact linkage', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  const ts = Date.now();
  const fp = 'lifecycle_acc_' + ts;
  const rowId = 'lc_acc_4b_' + ts;
  // Find real campaign + artifact IDs to satisfy FK constraints
  const camp = db.prepare('SELECT id FROM campaigns LIMIT 1').get();
  const art = db.prepare('SELECT id FROM creative_artifacts LIMIT 1').get();
  db.prepare(`INSERT INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES (?,?,?,'NEW','FEATURE_CURRENT_STOCK','RULE_BASED','T','S','R',50,'[]','instagram','[]','[]','[]',?,?)`).run(rowId, ws.id, fp, now, now);
  const campId = camp?.id ?? null;
  const artId = art?.id ?? null;
  db.prepare('UPDATE marketing_recommendations SET status=\'ACCEPTED\', accepted_campaign_id=?, accepted_artifact_id=?, accepted_at=?, updated_at=? WHERE id=?').run(campId, artId, now, now, rowId);
  const r = db.prepare('SELECT * FROM marketing_recommendations WHERE id=?').get(rowId);
  assertEqual(r.status, 'ACCEPTED');
  assert(r.accepted_campaign_id === campId, 'accepted_campaign_id set');
  assert(r.accepted_artifact_id === artId, 'accepted_artifact_id set');
  db.prepare('DELETE FROM marketing_recommendations WHERE id=?').run(rowId);
});

test('status: NEW → EXPIRED on past expires_at', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  const fp = 'lifecycle_exp_' + Date.now();
  db.prepare(`INSERT INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,expires_at,created_at,updated_at) VALUES ('lc_exp_4b',?,?,'NEW','REDUCE_POSTING_FREQUENCY','RULE_BASED','T','S','R',50,'[]','instagram','[]','[]','[]',datetime('now','-1 day'),?,?)`).run(ws.id, fp, now, now);
  db.prepare("UPDATE marketing_recommendations SET status='EXPIRED', updated_at=? WHERE workspace_id=? AND status='NEW' AND expires_at IS NOT NULL AND expires_at < datetime('now')").run(now, ws.id);
  const r = db.prepare("SELECT status FROM marketing_recommendations WHERE id='lc_exp_4b'").get();
  assertEqual(r.status, 'EXPIRED');
  db.prepare("DELETE FROM marketing_recommendations WHERE id='lc_exp_4b'").run();
});

// ─── [5] Objective lineage ────────────────────────────────────────────────────

console.log('\n[5] Objective lineage');

test('recommendation stores objective_id', () => {
  if (!ws) { console.log('  (skip — no workspace found)'); return; }
  // Find a valid objective
  const obj = db.prepare('SELECT id FROM objectives WHERE is_active=1 LIMIT 1').get();
  if (!obj) { console.log('  (skip — no objectives)'); return; }
  const fp = 'obj_lin_4b_' + Date.now();
  db.prepare(`INSERT INTO marketing_recommendations (id,workspace_id,fingerprint,status,recommendation_type,generation_source,title,summary,rationale,priority,marketing_scopes_json,objective_id,primary_channel,secondary_channels_json,source_product_ids_json,source_seller_ids_json,created_at,updated_at) VALUES ('obj_lin_4b_r',?,?,'NEW','FEATURE_NEW_ARRIVALS','RULE_BASED','T','S','R',50,'[]',?,'instagram','[]','[]','[]',?,?)`).run(ws.id, fp, obj.id, now, now);
  const r = db.prepare("SELECT objective_id FROM marketing_recommendations WHERE id='obj_lin_4b_r'").get();
  assertEqual(r.objective_id, obj.id);
  db.prepare("DELETE FROM marketing_recommendations WHERE id='obj_lin_4b_r'").run();
});

test('recommendation objective_id FK is ON DELETE SET NULL', () => {
  const m021sql = readSrc('src/db/migrations/021-marketing-recommendations.sql');
  assert(m021sql.includes('objective_id TEXT REFERENCES objectives(id) ON DELETE SET NULL'), 'FK must be ON DELETE SET NULL');
});

// ─── [6] MarketingExpertService contract ──────────────────────────────────────

console.log('\n[6] MarketingExpertService');

const expertSvc = readSrc('src/services/intelligence/MarketingExpertService.ts');

test('MarketingExpertService.ts exists', () => assert(expertSvc !== null));
test('generateRecommendations returns RecommendationGenerationResult', () => {
  assert(expertSvc.includes('async generateRecommendations('), 'generateRecommendations method');
  assert(expertSvc.includes('RecommendationGenerationResult'), 'Returns RecommendationGenerationResult');
});
test('buildBrief is exported as public method', () => assert(expertSvc.includes('buildBrief') && (expertSvc.includes('export { MarketingExpertService') || expertSvc.includes('export {marketingExpertService'))));
test('computeFingerprint is exported', () => assert(expertSvc.includes('computeFingerprint')));
test('listRecommendations filters by workspace_id', () => assert(expertSvc.includes('listRecommendations') && expertSvc.includes('workspace_id = ?')));
test('dismissRecommendation updates only the correct workspace', () => {
  const content = expertSvc;
  assert(content.includes('workspace_id = ? AND status ='), 'dismissRecommendation checks workspace + status');
});
test('generateRecommendations checks context signature for caching', () => {
  assert(expertSvc.includes('last_recommendation_context_sig') && expertSvc.includes('isCached'), 'Context signature caching exists');
});
test('generateRecommendations has rule-based fallback', () => assert(expertSvc.includes('generateRuleBasedRecommendations')));
test('AI output validation checks types, channels, scopes, products', () => {
  assert(expertSvc.includes('VALID_TYPES') && expertSvc.includes('VALID_CHANNELS') && expertSvc.includes('VALID_SCOPES'));
  assert(expertSvc.includes('candidateIdSet'), 'Product IDs validated against candidate set');
});
test('AMPLIFY_HIGH_PERFORMER only allowed when high performer exists', () => {
  assert(expertSvc.includes("type === 'AMPLIFY_HIGH_PERFORMER' && !ctx.highPerformingCampaign"), 'AMPLIFY guard exists');
});
test('SALE_EDIT (not CLEAR_SALE_STOCK) is a valid type in the service', () => {
  assert(expertSvc.includes("'SALE_EDIT'"), 'SALE_EDIT used');
  assert(!expertSvc.includes("'CLEAR_SALE_STOCK'"), 'CLEAR_SALE_STOCK must not appear');
});
test('expireStale method exists', () => assert(expertSvc.includes('expireStale(')));
test('INSERT uses ON CONFLICT(workspace_id, fingerprint) DO NOTHING', () => {
  assert(expertSvc.includes('ON CONFLICT(workspace_id, fingerprint) DO NOTHING'), 'Fingerprint idempotency enforced in INSERT');
});

// ─── [7] RecommendationContextAssembler contract ──────────────────────────────

console.log('\n[7] RecommendationContextAssembler');

const assembler = readSrc('src/services/intelligence/RecommendationContextAssembler.ts');

test('RecommendationContextAssembler.ts exists', () => assert(assembler !== null));
test('assemble() returns RecommendationContext with all 8 streams', () => {
  const streams = ['brandKnowledge','activeObjective','inventory','calendar','channels','recentContent','highPerformingCampaign','recentDismissals'];
  for (const s of streams) assert(assembler.includes(s), `Stream missing: ${s}`);
});
test('resolveActiveObjective uses 3-step chain', () => {
  assert(assembler.includes('workspace_id = ?') && assembler.includes('workspace_id IS NULL'), '3-step chain present');
  assert(assembler.includes('fromCampaign') || assembler.includes('from_campaign'), 'campaign fallback present');
});
test('computeContextSignature uses sha256', () => assert(assembler.includes("'sha256'")));
test('assemble() exported as singleton', () => assert(assembler.includes('export const recommendationContextAssembler')));
test('inventory query uses 4 filters: new_arrivals, current, sale, not_featured', () => {
  assert(assembler.includes("'new_arrivals'") && assembler.includes("'current'") && assembler.includes("'sale'") && assembler.includes("'not_featured'"));
});

// ─── [8] Routes ───────────────────────────────────────────────────────────────

console.log('\n[8] Routes');

const recRoute = readSrc('src/routes/recommendations.ts');

test('recommendations.ts route file exists', () => assert(recRoute !== null));
test("GET '/' lists recommendations", () => assert(recRoute.includes("router.get('/',")));
test("POST '/generate' triggers generation", () => assert(recRoute.includes("router.post('/generate',")));
test("POST '/:id/dismiss' dismisses a recommendation", () => assert(recRoute.includes("router.post('/:id/dismiss',")));
test('recommendations router uses LOCAL_TENANT_ID', () => assert(recRoute.includes('LOCAL_TENANT_ID')));

const serverSrc = readSrc('src/server.ts');
test('server.ts imports recommendationsRouter', () => assert(serverSrc.includes('recommendationsRouter')));
test("server.ts mounts at '/api/recommendations'", () => assert(serverSrc.includes("'/api/recommendations'")));

// ─── [9] OperatorStudioService changes ───────────────────────────────────────

console.log('\n[9] OperatorStudioService');

const studioSvc = readSrc('src/services/business/OperatorStudioService.ts');

test('setupFounderContent() method exists', () => assert(studioSvc.includes('async setupFounderContent(')));
test('setup() accepts optional recommendationId', () => assert(studioSvc.includes('recommendationId?: string | null')));
test('setupWholeSet() accepts optional recommendationId', () => {
  // Both methods should have the param
  const setupWholeIdx = studioSvc.indexOf('async setupWholeSet(');
  const paramIdx = studioSvc.indexOf('recommendationId?: string | null', setupWholeIdx);
  assert(paramIdx > setupWholeIdx, 'setupWholeSet has recommendationId param');
});
test('campaigns INSERT includes recommendation_id column', () => {
  assert(studioSvc.includes('recommendation_id, name, status, source_type'), 'recommendation_id in INSERT');
});
test('atomic acceptance: UPDATE marketing_recommendations SET status=ACCEPTED inside transaction', () => {
  assert(studioSvc.includes("status = 'ACCEPTED'") && studioSvc.includes('accepted_campaign_id'), 'atomic acceptance');
});
test('objective validation checks workspace_id = ? OR workspace_id IS NULL', () => {
  assert(studioSvc.includes('workspace_id = ? OR workspace_id IS NULL'), 'Objective validation checks workspace scope');
});
test('recommendation rejection returns 409 CONFLICT for non-NEW status', () => {
  const bsRoute = readSrc('src/routes/businessSources.ts');
  assert(bsRoute.includes('409') && bsRoute.includes("CONFLICT"), '409 returned for CONFLICT');
});
test('/studio/founder POST route exists', () => {
  const bsRoute = readSrc('src/routes/businessSources.ts');
  assert(bsRoute.includes("businessSourcesRouter.post('/studio/founder'"));
});
test('setupFounderContent creates TALKING_POINTS artifact', () => {
  assert(studioSvc.includes("'TALKING_POINTS'") && studioSvc.includes('FOUNDER_CONTENT'), 'TALKING_POINTS artifact created');
});
test('setupFounderContent atomically accepts recommendation', () => {
  const founderIdx = studioSvc.indexOf('async setupFounderContent(');
  const acceptIdx = studioSvc.indexOf("status = 'ACCEPTED'", founderIdx);
  assert(acceptIdx > founderIdx, 'Acceptance inside setupFounderContent');
});

// ─── [10] Frontend integration ────────────────────────────────────────────────

console.log('\n[10] Frontend integration');

const appCtx = readFrontend('app/AppContext.tsx');
test('AppContext exports RecommendationSeed interface', () => assert(appCtx.includes('export interface RecommendationSeed')));
test('AppContext has launchFromRecommendation', () => assert(appCtx.includes('launchFromRecommendation')));
test('AppContext has recommendationSeed state', () => assert(appCtx.includes('recommendationSeed')));
test('launchFromRecommendation sets selectedSourceProductIds from seed', () => assert(appCtx.includes('seed.sourceProductIds')));
test('launchFromRecommendation increments studioKey', () => assert(appCtx.includes('setStudioKey')));
test('newStudioSession clears recommendationSeed', () => assert(appCtx.includes("setRecommendationSeed(null)") && appCtx.includes('newStudioSession')));

const dashboard = readFrontend('features/dashboard/DashboardPage.tsx');
test('DashboardPage has generateRecommendations for explicit operator action (not on mount)', () => assert(dashboard.includes('generateRecommendations') && dashboard.includes('getRecommendations')));
test('DashboardPage renders recommendation cards', () => assert(dashboard.includes('launchFromRecommendation') || dashboard.includes('launchRec')));
test('DashboardPage can dismiss recommendations', () => assert(dashboard.includes('dismissRec') || dashboard.includes('dismissRecommendation')));
test('DashboardPage imports X icon for dismiss', () => assert(dashboard.includes("X }")));

const studioPage = readFrontend('features/studio/OperatorStudioPage.tsx');
test('OperatorStudioPage defines TalkingPointsContent interface', () => assert(studioPage.includes("kind: 'TALKING_POINTS'")));
test('OperatorStudioPage has isTalkingPoints branch', () => assert(studioPage.includes('isTalkingPoints')));
test('OperatorStudioPage passes recommendationId to createStudioSession', () => assert(studioPage.includes('recommendationSeed?.recommendationId')));
test('OperatorStudioPage clears recommendationSeed after launch', () => assert(studioPage.includes('setRecommendationSeed(null)')));

const apiSvc = readFrontend('services/api.ts');
test('api.ts has getRecommendations', () => assert(apiSvc.includes('getRecommendations')));
test('api.ts has generateRecommendations', () => assert(apiSvc.includes('generateRecommendations')));
test('api.ts has dismissRecommendation', () => assert(apiSvc.includes('dismissRecommendation')));
test('api.ts has createFounderContent', () => assert(apiSvc.includes('createFounderContent')));
test('api.ts createStudioSession accepts recommendationId', () => {
  const idx = apiSvc.indexOf('createStudioSession:');
  assert(idx > -1 && apiSvc.includes('recommendationId', idx), 'createStudioSession has recommendationId param');
});

// ─── [11] WLS read-only constraint ────────────────────────────────────────────

console.log('\n[11] WLS read-only');

test('MarketingExpertService imports no WLS connector', () => {
  assert(!expertSvc.includes('WornLabelConnector'), 'No WLS connector import in ExpertService');
  assert(!expertSvc.includes('wlsClient'), 'No wlsClient reference in ExpertService');
});
test('RecommendationContextAssembler makes no WLS write calls', () => {
  assert(!assembler.includes('INSERT INTO source_records'), 'No source_records INSERT');
  assert(!assembler.includes('UPDATE source_records'), 'No source_records UPDATE');
  assert(!assembler.includes('DELETE FROM source_records'), 'No source_records DELETE');
});
test('Recommendations routes make no inventory write calls', () => {
  assert(!recRoute.includes('updateInventory') && !recRoute.includes('updateListing') && !recRoute.includes('write'), 'No write calls in recommendations route');
});

// ─── [12a] Cost-control: GET must not invoke generation ──────────────────────

console.log('\n[12a] Cost-control');

test('GET /recommendations route calls listRecommendations, not generateRecommendations', () => {
  const route = readSrc('src/routes/recommendations.ts');
  // The GET '/' handler must only reference listRecommendations
  const getRouteBody = route.slice(route.indexOf("router.get('/'"), route.indexOf("router.post('/generate'"));
  assert(getRouteBody.includes('listRecommendations'), 'GET route calls listRecommendations');
  assert(!getRouteBody.includes('generateRecommendations'), 'GET route must NOT call generateRecommendations');
});

test('POST /generate is the only route endpoint capable of invoking aiOrchestrator', () => {
  // Only the service's generateRecommendations method calls aiOrchestrator.generate
  // listRecommendations and dismissRecommendation must not reference aiOrchestrator
  const svc = readSrc('src/services/intelligence/MarketingExpertService.ts');
  // Find where aiOrchestrator.generate is called
  const generateCallIdx = svc.indexOf('aiOrchestrator.generate(');
  assert(generateCallIdx > -1, 'aiOrchestrator.generate call exists');
  // Must be inside generateRecommendations method (appears after its declaration)
  const generateMethodIdx = svc.indexOf('async generateRecommendations(');
  assert(generateCallIdx > generateMethodIdx, 'aiOrchestrator.generate is inside generateRecommendations');
  // listRecommendations body must not contain aiOrchestrator
  const listMethodIdx = svc.indexOf('listRecommendations(');
  const listMethodEnd = svc.indexOf('\n  }', listMethodIdx);
  const listBody = svc.slice(listMethodIdx, listMethodEnd);
  assert(!listBody.includes('aiOrchestrator'), 'listRecommendations does NOT call aiOrchestrator');
});

test('DashboardPage mount calls getRecommendations (GET), not generateRecommendations (POST)', () => {
  const dash = readFrontend('features/dashboard/DashboardPage.tsx');
  // The mount useEffect (the one directly tied to workspaceId on initial load) must use getRecommendations
  assert(dash.includes('api.getRecommendations()'), 'api.getRecommendations() is called on mount');
  // generateRecommendations must NOT appear inside a useEffect with [workspaceId] dependency
  // Confirm it only appears in the explicit handler function
  const mountEffectIdx = dash.indexOf('api.getRecommendations()');
  const generateIdx = dash.indexOf('api.generateRecommendations()');
  // generateRecommendations must appear in a named callback (generateRecs), not in a mount useEffect
  assert(dash.includes('generateRecs'), 'generateRecs function exists for explicit operator action');
  assert(generateIdx > -1, 'api.generateRecommendations() exists');
  assert(!dash.includes('useEffect(() => {\n    if (!workspaceId) return;\n    void api.generateRecommendations()'),
    'generateRecommendations must not be in a mount useEffect');
});

test('MarketingExpertService uses aiOrchestrator (provider-neutral), not a hardcoded OpenAI call', () => {
  const svc = readSrc('src/services/intelligence/MarketingExpertService.ts');
  assert(svc.includes("import { aiOrchestrator }"), 'aiOrchestrator imported');
  assert(!svc.includes("new OpenAI("), 'No direct OpenAI client instantiation');
  assert(!svc.includes("openai.chat.completions"), 'No hardcoded OpenAI chat completions call');
  // Model is read from aiEnv config, not hardcoded
  assert(svc.includes('aiEnv.campaignModel'), 'Model comes from aiEnv config (provider-neutral)');
  assert(!svc.includes('"gpt-4o"') && !svc.includes("'gpt-4o'"), 'No hardcoded gpt-4o model string');
});

// ─── [12] MarketingRecommendation types ───────────────────────────────────────

console.log('\n[12] Type definitions');

const types = readSrc('src/types/marketingRecommendations.ts');
test('marketingRecommendations.ts exists', () => assert(types !== null));
test('RecommendationType includes SALE_EDIT', () => assert(types.includes("'SALE_EDIT'")));
test('RecommendationType includes FOUNDER_CONTENT', () => assert(types.includes("'FOUNDER_CONTENT'")));
test('RecommendationType includes EDITORIAL_CONTENT', () => assert(types.includes("'EDITORIAL_CONTENT'")));
test('RecommendationContentType includes TALKING_POINTS', () => assert(types.includes("'TALKING_POINTS'")));
test('RecommendationGenerationResult has cached field', () => assert(types.includes('cached: boolean')));
test('RecommendationGenerationResult has createdCount + reusedCount + expiredCount', () => {
  assert(types.includes('createdCount') && types.includes('reusedCount') && types.includes('expiredCount'));
});
test('RecommendationContext has all 8 streams defined', () => {
  const streams = ['brandKnowledge','activeObjective','inventory','calendar','channels','recentContent','highPerformingCampaign','recentDismissals'];
  for (const s of streams) assert(types.includes(s), `Stream missing: ${s}`);
});
test('MarketingRecommendationRow DB row type exists', () => assert(types.includes('MarketingRecommendationRow')));

const marketingTypes = readSrc('src/types/marketing.ts');
test('AITaskType includes MARKETING_RECOMMENDATION', () => assert(marketingTypes.includes("'MARKETING_RECOMMENDATION'")));

// ─── Summary ─────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log('─────────────────────────────────────────');
  console.log(`Phase 4B: ${passed} passed, ${failed} failed`);
  console.log('─────────────────────────────────────────');
  if (failed > 0) process.exit(1);
}, 200);
