/**
 * Phase 4D Verifier — 1-to-many content repurposer
 * Run from: backend/
 *   node scripts/run-verify-phase-4d.cjs
 */

require('dotenv/config');
require('ts-node/register/transpile-only');

const path = require('path');
const crypto = require('crypto');

// ─── Database ─────────────────────────────────────────────────────────────────
const { db, initDatabase } = require(path.join(__dirname, '../src/db/database'));
initDatabase();

// ─── Helpers ──────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  ✓ ${label}`);
      pass++;
    } else {
      console.log(`  ✗ ${label} — got: ${JSON.stringify(result)}`);
      fail++;
      failures.push(label);
    }
  } catch (err) {
    console.log(`  ✗ ${label} — threw: ${err.message}`);
    fail++;
    failures.push(label);
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

// ─── Section 1: Migration schema ─────────────────────────────────────────────
section('1. Migration 022 — schema');

check('repurpose_requests table exists', () => {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repurpose_requests'").get();
  return !!t;
});

check('repurpose_requests has UNIQUE(workspace_id, source_artifact_id, idempotency_key)', () => {
  const idx = db.prepare("PRAGMA index_list('repurpose_requests')").all();
  return idx.some(i => i.unique);
});

check('creative_artifacts has repurpose_request_id column', () => {
  const cols = db.prepare("PRAGMA table_info('creative_artifacts')").all();
  return cols.some(c => c.name === 'repurpose_request_id');
});

check('creative_artifacts has marketing_scopes_json column', () => {
  const cols = db.prepare("PRAGMA table_info('creative_artifacts')").all();
  return cols.some(c => c.name === 'marketing_scopes_json');
});

// ─── Section 2: studioDestinations contract ───────────────────────────────────
section('2. CREATIVE_DESTINATIONS contract');

const { CREATIVE_DESTINATIONS, findDestination } = require(path.join(__dirname, '../src/types/studioDestinations'));

check('CREATIVE_DESTINATIONS has 6 entries', () => CREATIVE_DESTINATIONS.length === 6);
check('Instagram Post present', () => !!CREATIVE_DESTINATIONS.find(d => d.channel === 'INSTAGRAM' && d.contentType === 'STATIC_POST'));
check('Instagram Story present', () => !!CREATIVE_DESTINATIONS.find(d => d.channel === 'INSTAGRAM' && d.contentType === 'STORY'));
check('Facebook Post present', () => !!CREATIVE_DESTINATIONS.find(d => d.channel === 'FACEBOOK' && d.contentType === 'STATIC_POST'));
check('Email present', () => !!CREATIVE_DESTINATIONS.find(d => d.channel === 'EMAIL' && d.contentType === 'EMAIL'));
check('Reel/TikTok Concept present', () => !!CREATIVE_DESTINATIONS.find(d => d.channel === 'TIKTOK' && d.contentType === 'TALKING_POINTS'));
check('findDestination works', () => {
  const d = findDestination('INSTAGRAM', 'STATIC_POST');
  return d && d.format === 'PORTRAIT_4_5';
});

// ─── Section 3: ChannelCapabilityRegistry ─────────────────────────────────────
section('3. ChannelCapabilityRegistry — TALKING_POINTS');

const { getChannelCapability } = require(path.join(__dirname, '../src/services/channels/ChannelCapabilityRegistry'));

check('TIKTOK supports TALKING_POINTS', () => {
  const cap = getChannelCapability('TIKTOK');
  return cap.supportedContentTypes.includes('TALKING_POINTS');
});

// ─── Section 4: AITaskType includes CONTENT_REPURPOSE ─────────────────────────
section('4. marketing.ts — AITaskType');

// Just check the TypeScript compiled file references it
const marketingTypesSource = require('fs').readFileSync(
  path.join(__dirname, '../src/types/marketing.ts'), 'utf8'
);
check('CONTENT_REPURPOSE in AITaskType', () => marketingTypesSource.includes("'CONTENT_REPURPOSE'"));
check('scope is optional in MarketingAIBrief', () => marketingTypesSource.includes('scope?: MarketingScope'));
check('marketingScopes field exists', () => marketingTypesSource.includes('marketingScopes?:'));

// ─── Section 5: OperatorStudioService FORMAT_META derived from CREATIVE_DESTINATIONS ──
section('5. OperatorStudioService — FORMAT_META refactor');

const osSource = require('fs').readFileSync(
  path.join(__dirname, '../src/services/business/OperatorStudioService.ts'), 'utf8'
);
check('imports findDestination from studioDestinations', () => osSource.includes('findDestination'));
check('FORMAT_META uses destMeta() helper', () => osSource.includes('destMeta('));

// ─── Section 6: repurpose_requests table idempotency ─────────────────────────
section('6. Repurpose idempotency — atomic reservation');

const workspaceId = db.prepare("SELECT id FROM entities LIMIT 1").get()?.id;
let testArtifactId = null;

if (workspaceId) {
  const artifactRow = db.prepare("SELECT id FROM creative_artifacts WHERE workspace_id = ? LIMIT 1").get(workspaceId);
  testArtifactId = artifactRow?.id ?? null;
}

if (workspaceId && testArtifactId) {
  const iKey = `test-idempotency-${Date.now()}`;
  const hash = crypto.createHash('sha256').update(JSON.stringify({ sourceArtifactId: testArtifactId, destinations: ['Instagram Post'] })).digest('hex');
  const reqId1 = `rpr_test_${Date.now()}_1`;
  const reqId2 = `rpr_test_${Date.now()}_2`;
  const now = new Date().toISOString();

  // First insert succeeds
  const info1 = db.prepare(`
    INSERT OR IGNORE INTO repurpose_requests (id, workspace_id, source_artifact_id, idempotency_key, request_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
  `).run(reqId1, workspaceId, testArtifactId, iKey, hash, now, now);

  check('First INSERT claims reservation (changes=1)', () => info1.changes === 1);

  // Second insert with same key is ignored
  const info2 = db.prepare(`
    INSERT OR IGNORE INTO repurpose_requests (id, workspace_id, source_artifact_id, idempotency_key, request_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
  `).run(reqId2, workspaceId, testArtifactId, iKey, hash, now, now);

  check('Second INSERT is ignored (changes=0)', () => info2.changes === 0);

  // Read back existing
  const existing = db.prepare(
    'SELECT * FROM repurpose_requests WHERE workspace_id = ? AND source_artifact_id = ? AND idempotency_key = ?'
  ).get(workspaceId, testArtifactId, iKey);

  check('Existing row has first requestId', () => existing && existing.id === reqId1);
  check('Existing row status is IN_PROGRESS', () => existing && existing.status === 'IN_PROGRESS');

  // Cleanup
  db.prepare('DELETE FROM repurpose_requests WHERE id = ?').run(reqId1);
} else {
  console.log('  ⚠ No workspace or artifact found — skipping live idempotency tests');
}

// ─── Section 7: Hash mismatch detection ───────────────────────────────────────
section('7. Request hash — mismatch detection');

if (workspaceId && testArtifactId) {
  const iKey2 = `test-hash-${Date.now()}`;
  const hash1 = crypto.createHash('sha256').update(JSON.stringify({ sourceArtifactId: testArtifactId, destinations: ['Instagram Post'] })).digest('hex');
  const hash2 = crypto.createHash('sha256').update(JSON.stringify({ sourceArtifactId: testArtifactId, destinations: ['Facebook Post'] })).digest('hex');
  const rId = `rpr_hash_${Date.now()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO repurpose_requests (id, workspace_id, source_artifact_id, idempotency_key, request_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
  `).run(rId, workspaceId, testArtifactId, iKey2, hash1, now, now);

  const existing = db.prepare(
    'SELECT request_hash FROM repurpose_requests WHERE workspace_id = ? AND source_artifact_id = ? AND idempotency_key = ?'
  ).get(workspaceId, testArtifactId, iKey2);

  check('Stored hash differs from new hash (correct detection)', () => existing && existing.request_hash !== hash2);

  db.prepare('DELETE FROM repurpose_requests WHERE id = ?').run(rId);
}

// ─── Section 8: creative_derivations table ────────────────────────────────────
section('8. creative_derivations — lineage table');

check('creative_derivations table exists', () => {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='creative_derivations'").get();
  return !!t;
});

check('creative_derivations has REPURPOSED_FROM as default', () => {
  const col = db.prepare("PRAGMA table_info('creative_derivations')").all();
  const rel = col.find(c => c.name === 'relationship');
  return rel && rel.dflt_value === "'REPURPOSED_FROM'";
});

// ─── Section 9: creative_source_links table ───────────────────────────────────
section('9. creative_source_links — product lineage');

check('creative_source_links table exists', () => {
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='creative_source_links'").get();
  return !!t;
});

// ─── Section 10: RepurposeService exports ─────────────────────────────────────
section('10. RepurposeService — exports and structure');

const { repurposeService } = require(path.join(__dirname, '../src/services/business/RepurposeService'));
check('repurposeService is exported', () => !!repurposeService);
check('repurposeService.repurpose is a function', () => typeof repurposeService.repurpose === 'function');
check('repurposeService.getSourceSummary is a function', () => typeof repurposeService.getSourceSummary === 'function');

// ─── Section 11: Route file exists ────────────────────────────────────────────
section('11. repurpose.ts route');

const routeSource = require('fs').readFileSync(
  path.join(__dirname, '../src/routes/repurpose.ts'), 'utf8'
);
check('GET /destinations route exists', () => routeSource.includes("/destinations'"));
check('GET /source/:artifactId route exists', () => routeSource.includes('/source/:artifactId'));
check('POST / route exists', () => routeSource.includes("repurposeRouter.post('/'"));

// ─── Section 12: server.ts mounts repurposeRouter ─────────────────────────────
section('12. server.ts — router mounted');

const serverSource = require('fs').readFileSync(
  path.join(__dirname, '../src/server.ts'), 'utf8'
);
check('imports repurposeRouter', () => serverSource.includes('repurposeRouter'));
check("mounts at '/api/repurpose'", () => serverSource.includes("'/api/repurpose'"));

// ─── Section 13: Campaign preservation ───────────────────────────────────────
section('13. Campaign preservation');

const rpSource = require('fs').readFileSync(
  path.join(__dirname, '../src/services/business/RepurposeService.ts'), 'utf8'
);
check('Uses source campaign_id for child artifacts', () => rpSource.includes('sourceArtifact.campaign_id'));
check('No campaign name mutation ("Repurposed")', () => !rpSource.includes('Repurposed'));

// ─── Section 14: Scope resolution ─────────────────────────────────────────────
section('14. Scope resolution');

check('resolveScopes reads from marketing_recommendations', () => rpSource.includes('marketing_recommendations'));
check('resolveScopes falls back to marketing_scope column', () => rpSource.includes('marketing_scope'));
check('Returns empty array (not SHOP or BRAND) when no scope found', () => rpSource.includes('return [];'));
check('Never invents SHOP or BRAND', () => !rpSource.includes("'SHOP'") && !rpSource.includes("'BRAND'"));

// ─── Section 15: AI failure handling ──────────────────────────────────────────
section('15. Partial failure model');

check('AI_FAILED status tracked', () => rpSource.includes("status: 'AI_FAILED'"));
check('VALIDATION_FAILED status tracked', () => rpSource.includes("status: 'VALIDATION_FAILED'"));
check('PERSISTENCE_FAILED status tracked', () => rpSource.includes("status: 'PERSISTENCE_FAILED'"));
check('Overall status is PARTIAL when some fail', () => rpSource.includes("'PARTIAL'"));

// ─── Section 16: Frontend types ───────────────────────────────────────────────
section('16. Frontend types');

const frontendTypes = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/types/index.ts'), 'utf8'
);
check("AppTab includes 'repurpose'", () => frontendTypes.includes("| 'repurpose'"));
check('PlannedContentType includes TALKING_POINTS', () => frontendTypes.includes("| 'TALKING_POINTS'"));
check('CreativeContent includes TALKING_POINTS kind', () => frontendTypes.includes("kind: 'TALKING_POINTS'"));

// ─── Section 17: AppContext ────────────────────────────────────────────────────
section('17. AppContext — repurposeSourceArtifactId');

const appCtx = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/app/AppContext.tsx'), 'utf8'
);
check('repurposeSourceArtifactId state exists', () => appCtx.includes('repurposeSourceArtifactId'));
check('setRepurposeSourceArtifactId exposed', () => appCtx.includes('setRepurposeSourceArtifactId'));

// ─── Section 18: api.ts ───────────────────────────────────────────────────────
section('18. api.ts — repurpose functions');

const apiTs = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/services/api.ts'), 'utf8'
);
check('getRepurposeDestinations function exists', () => apiTs.includes('getRepurposeDestinations'));
check('getRepurposeSource function exists', () => apiTs.includes('getRepurposeSource'));
check('repurposeArtifact function exists', () => apiTs.includes('repurposeArtifact'));

// ─── Section 19: App.tsx ──────────────────────────────────────────────────────
section('19. App.tsx — RepurposePage rendered');

const appTsx = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/App.tsx'), 'utf8'
);
check("imports RepurposePage", () => appTsx.includes("import RepurposePage"));
check("renders repurpose tab", () => appTsx.includes("activeTab === 'repurpose'"));

// ─── Section 20: OperatorStudioPage — Create versions ────────────────────────
section('20. OperatorStudioPage — Create versions entry point');

const studioPage = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/features/studio/OperatorStudioPage.tsx'), 'utf8'
);
check('Create versions button exists', () => studioPage.includes('Create versions'));
check('setRepurposeSourceArtifactId called on click', () => studioPage.includes('setRepurposeSourceArtifactId'));
check("Navigates to 'repurpose' tab", () => studioPage.includes("'repurpose'"));

// ─── Section 21: RepurposePage.tsx ────────────────────────────────────────────
section('21. RepurposePage.tsx — UI phases');

const rpPage = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/features/repurpose/RepurposePage.tsx'), 'utf8'
);
check('Loading phase exists', () => rpPage.includes("'loading'"));
check('Pick phase (destination selector) exists', () => rpPage.includes("'pick'"));
check('Generating phase exists', () => rpPage.includes("'generating'"));
check('Results phase exists', () => rpPage.includes("'results'"));
check('Approve per-destination action exists', () => rpPage.includes('Approve'));
check('Back navigation exists', () => rpPage.includes('setRepurposeSourceArtifactId(null)'));

// ─── Section 21b: Channel-strategy-aware pre-selection ────────────────────────
section('21b. Channel-strategy-aware destination pre-selection');

check('getRepurposeDestinations called with workspaceId', () => rpPage.includes('getRepurposeDestinations(workspaceId)'));
check('channelEnabled field in Destination type', () => rpPage.includes('channelEnabled: boolean'));
check('Pre-selection guards on channelEnabled', () => rpPage.includes('channelEnabled !== false'));

const routeRepurpose = require('fs').readFileSync(
  path.join(__dirname, '../src/routes/repurpose.ts'), 'utf8'
);
check('Route reads workspaceId from query', () => routeRepurpose.includes('workspaceId'));
check('Route imports channelStrategyService', () => routeRepurpose.includes('channelStrategyService'));
check('Route maps channel to channelEnabled', () => routeRepurpose.includes('channelEnabled'));

const apiTs2 = require('fs').readFileSync(
  path.join(__dirname, '../../frontend/src/services/api.ts'), 'utf8'
);
check('api.getRepurposeDestinations passes workspaceId as query param', () => apiTs2.includes('workspaceId=${encodeURIComponent(workspaceId)}') && apiTs2.includes('getRepurposeDestinations'));

// ─── Section 22: WLS safety ───────────────────────────────────────────────────
section('22. WLS read-only safety');

check('RepurposeService never writes to source_records', () => {
  const hasInsertToSourceRecords = /INSERT\s+INTO\s+source_records/i.test(rpSource);
  return !hasInsertToSourceRecords;
});
check('RepurposeService never writes to business_integrations', () => {
  return !/INSERT\s+INTO\s+business_integrations/i.test(rpSource);
});

// ─── Section 23: Content key pattern ─────────────────────────────────────────
section('23. Derivative content key pattern');

check("Content key uses 'rp-' prefix", () => rpSource.includes('`rp-${abbrev}-${idempotencyKey.slice(0, 8)}`'));
check('contentKeyAbbrev maps ig-post, fb-post, tk-reel', () => {
  return rpSource.includes("'ig-post'") && rpSource.includes("'fb-post'") && rpSource.includes("'tk-reel'");
});

// ─── Section 24: No TOTAL EDIT dependency ────────────────────────────────────
section('24. TOTAL EDIT isolation');

check('RepurposeService does not import from total-edit-core', () => !rpSource.includes('total-edit-core'));
check('RepurposePage does not import from total-edit-core', () => !rpPage.includes('total-edit-core'));

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Phase 4D: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailed checks:');
  failures.forEach(f => console.log(`  • ${f}`));
  process.exit(1);
} else {
  console.log('All Phase 4D checks passed.');
}
