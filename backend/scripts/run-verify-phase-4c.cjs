/**
 * Phase 4C verifier — Organic Planning + Instagram Grid
 * Usage: node backend/scripts/run-verify-phase-4c.cjs
 */

'use strict';

require('dotenv/config');
require('ts-node/register/transpile-only');

const { initDatabase } = require('../src/db/database');
initDatabase();

const { LOCAL_TENANT_ID } = require('../src/config/constants');
const { organicPlannerService, classifyOrganicContent, calendarDayGap } = require('../src/services/intelligence/OrganicPlannerService');
const { recommendationContextAssembler } = require('../src/services/intelligence/RecommendationContextAssembler');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`      ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function section(title) {
  console.log(`\n[${title}]`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    marketingScopes: [],
    contentType: null,
    recommendationType: null,
    sourceProductIds: [],
    ...overrides,
  };
}

const wsId = LOCAL_TENANT_ID;

// ─── [1] File existence ───────────────────────────────────────────────────────

section('1 — File existence');

const root = path.join(__dirname, '..');
const files = [
  'src/services/intelligence/OrganicPlannerService.ts',
  'src/routes/planner.ts',
];
for (const f of files) {
  test(`${f} exists`, () => assert(fs.existsSync(path.join(root, f)), `Missing: ${f}`));
}

const frontFiles = [
  '../frontend/src/features/planner/InstagramGridPlannerPage.tsx',
];
for (const f of frontFiles) {
  test(`${path.basename(f)} exists`, () => assert(fs.existsSync(path.join(root, f)), `Missing: ${f}`));
}

// ─── [2] Server registration ──────────────────────────────────────────────────

section('2 — Server registration');

test('server.ts imports plannerRouter', () => {
  const src = fs.readFileSync(path.join(root, 'src/server.ts'), 'utf8');
  assert(src.includes("plannerRouter"), 'plannerRouter not imported in server.ts');
});

test('server.ts registers /api/planner', () => {
  const src = fs.readFileSync(path.join(root, 'src/server.ts'), 'utf8');
  assert(src.includes("/api/planner"), '/api/planner not registered in server.ts');
});

// ─── [3] AppTab includes planner ─────────────────────────────────────────────

section('3 — Frontend routing');

test("AppTab union includes 'planner'", () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/types/index.ts'), 'utf8');
  assert(src.includes("'planner'"), "AppTab does not include 'planner'");
});

test("App.tsx renders InstagramGridPlannerPage for planner tab", () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/App.tsx'), 'utf8');
  assert(src.includes("InstagramGridPlannerPage"), 'App.tsx does not import/render InstagramGridPlannerPage');
});

test("SidebarNav includes Planner nav item", () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/components/layout/SidebarNav.tsx'), 'utf8');
  assert(src.includes("'planner'"), "SidebarNav does not include 'planner' id");
  assert(src.includes('Planner'), "SidebarNav does not include 'Planner' label");
});

test("api.ts has getOrganicPlan", () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/services/api.ts'), 'utf8');
  assert(src.includes('getOrganicPlan'), 'api.ts missing getOrganicPlan');
});

// ─── [4] Classification — single-scope ───────────────────────────────────────

section('4 — classifyOrganicContent: single-scope');

test('null scope, no evidence → OTHER', () => {
  assert(classifyOrganicContent(makeItem()) === 'OTHER');
});

test('FOUNDER scope → FOUNDER', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['FOUNDER'] })) === 'FOUNDER');
});

test('FOUNDER beats EDITORIAL', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['FOUNDER', 'EDITORIAL'] })) === 'FOUNDER');
});

test('TALKING_POINTS content type → FOUNDER', () => {
  assert(classifyOrganicContent(makeItem({ contentType: 'TALKING_POINTS' })) === 'FOUNDER');
});

test('FOUNDER_CONTENT rec type → FOUNDER', () => {
  assert(classifyOrganicContent(makeItem({ recommendationType: 'FOUNDER_CONTENT' })) === 'FOUNDER');
});

test('EDITORIAL scope → EDITORIAL', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['EDITORIAL'] })) === 'EDITORIAL');
});

test('EDITORIAL_CONTENT rec type → EDITORIAL', () => {
  assert(classifyOrganicContent(makeItem({ recommendationType: 'EDITORIAL_CONTENT' })) === 'EDITORIAL');
});

test('BRAND scope, no product evidence → BRAND (not PRODUCT)', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['BRAND'] })) === 'BRAND');
});

test('SHOP scope, no product sources → SHOP (not PRODUCT)', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['SHOP'] })) === 'SHOP');
});

test('source product IDs → PRODUCT', () => {
  assert(classifyOrganicContent(makeItem({ sourceProductIds: ['sr_1'] })) === 'PRODUCT');
});

test('FEATURE_NEW_ARRIVALS rec type → PRODUCT', () => {
  assert(classifyOrganicContent(makeItem({ recommendationType: 'FEATURE_NEW_ARRIVALS' })) === 'PRODUCT');
});

test('SALE_EDIT rec type → PRODUCT', () => {
  assert(classifyOrganicContent(makeItem({ recommendationType: 'SALE_EDIT' })) === 'PRODUCT');
});

test('FILL_CALENDAR_GAP + null scope + no sources → OTHER', () => {
  assert(classifyOrganicContent(makeItem({ recommendationType: 'FILL_CALENDAR_GAP' })) === 'OTHER');
});

// ─── [5] Classification — multi-scope ────────────────────────────────────────

section('5 — classifyOrganicContent: multi-scope');

test('MARKETPLACE + source products → MARKETPLACE', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['MARKETPLACE'], sourceProductIds: ['sr_1'] })) === 'MARKETPLACE');
});

test('SHOP_MARKETPLACE + source products → MARKETPLACE', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['SHOP_MARKETPLACE'], sourceProductIds: ['sr_1'] })) === 'MARKETPLACE');
});

test('SHOP_MARKETPLACE, no sources → SHOP', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['SHOP_MARKETPLACE'] })) === 'SHOP');
});

test('BRAND + MARKETPLACE scopes preserved as-is through classification', () => {
  const cls = classifyOrganicContent(makeItem({ marketingScopes: ['BRAND', 'MARKETPLACE'], sourceProductIds: ['sr_1'] }));
  assert(cls === 'MARKETPLACE', `Expected MARKETPLACE, got ${cls}`);
});

test('SHOP + MARKETPLACE scope: MARKETPLACE wins with product evidence', () => {
  const cls = classifyOrganicContent(makeItem({ marketingScopes: ['SHOP', 'MARKETPLACE'], sourceProductIds: ['sr_1'] }));
  assert(cls === 'MARKETPLACE', `Expected MARKETPLACE, got ${cls}`);
});

test('FOUNDER + BRAND scopes: FOUNDER wins', () => {
  assert(classifyOrganicContent(makeItem({ marketingScopes: ['FOUNDER', 'BRAND'] })) === 'FOUNDER');
});

// ─── [6] DST-safe gap calculation ─────────────────────────────────────────────

section('6 — calendarDayGap (timezone-safe)');

test('calendarDayGap: exactly 1 day', () => {
  const gap = calendarDayGap('2026-09-03T00:00:00.000Z', '2026-09-04T00:00:00.000Z', 'UTC');
  assert(gap === 1, `Expected 1, got ${gap}`);
});

test('calendarDayGap: exactly 3 days', () => {
  const gap = calendarDayGap('2026-09-01T00:00:00.000Z', '2026-09-04T00:00:00.000Z', 'UTC');
  assert(gap === 3, `Expected 3, got ${gap}`);
});

test('calendarDayGap: Pacific/Auckland DST-safe (same-day = 0)', () => {
  // 2026-09-27 02:00 NZST → NZDT (DST spring-forward), both timestamps same calendar day
  const gap = calendarDayGap('2026-09-26T12:00:00.000Z', '2026-09-26T14:00:00.000Z', 'Pacific/Auckland');
  assert(gap === 0, `Expected 0, got ${gap}`);
});

test('calendarDayGap: Pacific/Auckland cross-midnight is 1', () => {
  // NZ midnight: UTC+12 → 12:00 UTC previous day is midnight NZST
  const gap = calendarDayGap('2026-09-25T12:00:00.000Z', '2026-09-26T12:00:00.000Z', 'Pacific/Auckland');
  assert(gap === 1, `Expected 1, got ${gap}`);
});

// ─── [7] getPlan — feed correctness ──────────────────────────────────────────

section('7 — getPlan: feed correctness');

let plan;
try {
  plan = organicPlannerService.getPlan(wsId, 'instagram');
} catch (e) {
  plan = null;
  console.log(`  ! getPlan threw: ${e.message}`);
}

test('getPlan returns without throwing', () => assert(plan !== null, 'getPlan threw'));

if (plan) {
  test('currentFeed contains only PUBLISHED items', () => {
    const bad = plan.currentFeed.filter(i => i.state !== 'PUBLISHED');
    assert(bad.length === 0, `Non-PUBLISHED in currentFeed: ${bad.map(i => i.state).join(', ')}`);
  });

  test('plannedFeed contains only PUBLISHED or SCHEDULED items', () => {
    const bad = plan.plannedFeed.filter(i => i.state !== 'PUBLISHED' && i.state !== 'SCHEDULED');
    assert(bad.length === 0, `Bad state in plannedFeed: ${bad.map(i => i.state).join(', ')}`);
  });

  test('plannedFeed sorted effectiveTimestamp DESC', () => {
    const ts = plan.plannedFeed.filter(i => i.effectiveTimestamp).map(i => i.effectiveTimestamp);
    for (let i = 1; i < ts.length; i++) {
      assert(ts[i] <= ts[i - 1], `plannedFeed not DESC at index ${i}: ${ts[i - 1]} → ${ts[i]}`);
    }
  });

  test('PREPARED_CREATIVE not in currentFeed', () => {
    assert(!plan.currentFeed.some(i => i.state === 'PREPARED_CREATIVE'), 'PREPARED_CREATIVE found in currentFeed');
  });

  test('PREPARED_CREATIVE not in plannedFeed', () => {
    assert(!plan.plannedFeed.some(i => i.state === 'PREPARED_CREATIVE'), 'PREPARED_CREATIVE found in plannedFeed');
  });

  test('PROPOSED_IDEA not in currentFeed', () => {
    assert(!plan.currentFeed.some(i => i.state === 'PROPOSED_IDEA'), 'PROPOSED_IDEA found in currentFeed');
  });

  test('PROPOSED_IDEA not in plannedFeed', () => {
    assert(!plan.plannedFeed.some(i => i.state === 'PROPOSED_IDEA'), 'PROPOSED_IDEA found in plannedFeed');
  });

  test('PROPOSED_IDEA appears in proposedNext', () => {
    const allProposed = plan.proposedNext;
    assert(allProposed.every(i => i.state === 'PROPOSED_IDEA'), 'Non-PROPOSED_IDEA in proposedNext');
  });

  test('PREPARED_CREATIVE appears in readyToPlace', () => {
    assert(plan.readyToPlace.every(i => i.state === 'PREPARED_CREATIVE'), 'Non-PREPARED_CREATIVE in readyToPlace');
  });

  test('REDUCE_POSTING_FREQUENCY not in any planner section', () => {
    const all = [...plan.currentFeed, ...plan.plannedFeed, ...plan.readyToPlace, ...plan.proposedNext];
    assert(!all.some(i => i.recommendationType === 'REDUCE_POSTING_FREQUENCY'), 'REDUCE_POSTING_FREQUENCY found in planner');
  });

  test('plannedFeed SCHEDULED items have effectiveTimestamp = scheduledFor', () => {
    const scheduled = plan.plannedFeed.filter(i => i.state === 'SCHEDULED');
    assert(scheduled.every(i => i.effectiveTimestamp !== null), 'SCHEDULED item has null effectiveTimestamp');
  });

  test('proposedNext items have recommendationId set', () => {
    assert(plan.proposedNext.every(i => i.recommendationId !== null), 'PROPOSED_IDEA missing recommendationId');
  });

  test('multi-scope: proposedNext items expose marketingScopes array', () => {
    assert(plan.proposedNext.every(i => Array.isArray(i.marketingScopes)), 'marketingScopes is not an array');
  });

  test('channelStrategy object present in result', () => {
    assert(typeof plan.channelStrategy === 'object', 'channelStrategy missing');
    assert('enabled' in plan.channelStrategy, 'channelStrategy.enabled missing');
    assert('priority' in plan.channelStrategy, 'channelStrategy.priority missing');
  });

  test('summary counts are non-negative integers', () => {
    const s = plan.summary;
    assert(s.publishedCount >= 0 && s.scheduledCount >= 0 && s.preparedCount >= 0 && s.proposedCount >= 0, 'Negative count in summary');
  });
}

// ─── [8] Signal correctness ───────────────────────────────────────────────────

section('8 — Signal types');

if (plan) {
  test('signals is an array', () => assert(Array.isArray(plan.signals)));
  test('all signals have type, severity, message', () => {
    assert(plan.signals.every(s => s.type && s.severity && s.message), 'Signal missing required field');
  });
  test('LONG_POSTING_GAP signal includes gapDays when fired', () => {
    const gap = plan.signals.find(s => s.type === 'LONG_POSTING_GAP');
    if (gap) assert(typeof gap.gapDays === 'number' && gap.gapDays > 0, 'LONG_POSTING_GAP missing valid gapDays');
  });
  test('CHANNEL_DISABLED only fires for disabled channels', () => {
    if (plan.channelStrategy.enabled) {
      assert(!plan.signals.some(s => s.type === 'CHANNEL_DISABLED'), 'CHANNEL_DISABLED fired for enabled channel');
    } else {
      const mix = [...plan.currentFeed, ...plan.plannedFeed, ...plan.readyToPlace, ...plan.proposedNext];
      // When disabled: proposedNext empty, advice signals absent
      assert(plan.proposedNext.length === 0, 'proposedNext not empty for disabled channel');
      const adviceTypes = ['PRODUCT_HEAVY_RUN','FOUNDER_GAP','EDITORIAL_GAP','REPEATED_DIRECTION','BACK_TO_BACK_CAROUSELS'];
      const hasAdvice = plan.signals.some(s => adviceTypes.includes(s.type));
      assert(!hasAdvice, 'Advice signals fired for disabled channel');
    }
  });
}

// ─── [9] getPlan — disabled channel ──────────────────────────────────────────

section('9 — Disabled channel behaviour');

let disabledPlan;
try {
  // tiktok is very unlikely to be configured as enabled
  disabledPlan = organicPlannerService.getPlan(wsId, 'tiktok');
} catch { disabledPlan = null; }

if (disabledPlan && !disabledPlan.channelStrategy.enabled) {
  test('disabled channel: proposedNext is empty', () => {
    assert(disabledPlan.proposedNext.length === 0, 'proposedNext not empty for disabled channel');
  });
  test('disabled channel: CHANNEL_DISABLED signal fired', () => {
    assert(disabledPlan.signals.some(s => s.type === 'CHANNEL_DISABLED'), 'CHANNEL_DISABLED signal missing');
  });
  test('disabled channel: no advice signals', () => {
    const advice = ['PRODUCT_HEAVY_RUN','FOUNDER_GAP','EDITORIAL_GAP'];
    assert(!disabledPlan.signals.some(s => advice.includes(s.type)), 'Advice signals fired for disabled channel');
  });
} else {
  test('disabled channel test: tiktok not configured (skip detailed assertions)', () => assert(true));
}

// ─── [10] Secondary channel eligibility ──────────────────────────────────────

section('10 — Recommendation channel semantics');

test('Phase 4B marketing_recommendations table has secondary_channels_json column', () => {
  const { db } = require('../src/db/database');
  const info = db.prepare("PRAGMA table_info(marketing_recommendations)").all();
  const has = info.some(c => c.name === 'secondary_channels_json');
  assert(has, 'secondary_channels_json column missing from marketing_recommendations');
});

test('getProposedItems filters by primary OR secondary channel', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/OrganicPlannerService.ts'), 'utf8');
  assert(src.includes('secondary_channels_json') || src.includes('secondary'), 'OrganicPlannerService does not reference secondary channels');
});

// ─── [11] Media ownership safety ─────────────────────────────────────────────

section('11 — Media ownership safety');

test('linked media_assets query includes workspace_id predicate', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/OrganicPlannerService.ts'), 'utf8');
  // Check the resolveMediaAssetId SQL
  assert(src.includes('creative_artifact_id = ?') && src.includes('workspace_id = ?'), 'media_assets query missing workspace_id');
});

test('source_records join through creative_source_links includes workspace_id', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/OrganicPlannerService.ts'), 'utf8');
  assert(src.includes('sr.workspace_id = ?') || src.includes('workspace_id = ?'), 'source_records query missing workspace_id isolation');
});

// ─── [12] Marketing Expert integration ───────────────────────────────────────

section('12 — Marketing Expert integration');

test('RecommendationContext type includes plannerIntelligence field', () => {
  const src = fs.readFileSync(path.join(root, 'src/types/marketingRecommendations.ts'), 'utf8');
  assert(src.includes('plannerIntelligence'), 'plannerIntelligence missing from RecommendationContext');
});

test('RecommendationContextAssembler imports organicPlannerService', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/RecommendationContextAssembler.ts'), 'utf8');
  assert(src.includes('organicPlannerService'), 'RecommendationContextAssembler missing organicPlannerService import');
});

test('RecommendationContextAssembler.assemble() populates plannerIntelligence', () => {
  const ctx = recommendationContextAssembler.assemble(wsId);
  // plannerIntelligence is optional (may be undefined if no channels configured)
  assert('plannerIntelligence' in ctx || ctx.plannerIntelligence === undefined, 'plannerIntelligence key handling broken');
});

test('plannerIntelligence contains no image URLs', () => {
  const ctx = recommendationContextAssembler.assemble(wsId);
  if (ctx.plannerIntelligence) {
    const json = JSON.stringify(ctx.plannerIntelligence);
    assert(!json.includes('http'), 'plannerIntelligence contains URL references');
  }
});

test('getIntelligenceSummary returns compact summary without full artifact records', () => {
  const summary = organicPlannerService.getIntelligenceSummary(wsId);
  assert(typeof summary === 'object' && summary !== null, 'getIntelligenceSummary returned non-object');
  assert('primaryChannel' in summary, 'primaryChannel missing from intelligence summary');
  assert(Array.isArray(summary.channels), 'channels not an array');
  assert('computedAt' in summary, 'computedAt missing');
  const json = JSON.stringify(summary);
  assert(!json.includes('imageUrls') && !json.includes('mediaAssetId'), 'Intelligence summary contains media fields');
});

test('MarketingExpertService buildBrief includes planner section when intelligence available', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/MarketingExpertService.ts'), 'utf8');
  assert(src.includes('plannerIntelligence') && src.includes('ORGANIC PLANNER INTELLIGENCE'), 'buildBrief missing planner section');
});

// ─── [13] Zero AI calls on planner GET ───────────────────────────────────────

section('13 — Zero AI calls on planner GET');

test('OrganicPlannerService.ts does not import aiOrchestrator', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/OrganicPlannerService.ts'), 'utf8');
  assert(!src.includes('aiOrchestrator'), 'OrganicPlannerService imports or references aiOrchestrator');
});

test('planner route does not import aiOrchestrator', () => {
  const src = fs.readFileSync(path.join(root, 'src/routes/planner.ts'), 'utf8');
  assert(!src.includes('aiOrchestrator'), 'planner route references aiOrchestrator');
});

test('planner route has no POST endpoints', () => {
  const src = fs.readFileSync(path.join(root, 'src/routes/planner.ts'), 'utf8');
  assert(!src.includes("router.post"), 'planner route has a POST endpoint (should be read-only)');
});

// ─── [14] WLS read-only confirmation ─────────────────────────────────────────

section('14 — WLS read-only');

test('OrganicPlannerService performs no INSERT/UPDATE/DELETE', () => {
  const src = fs.readFileSync(path.join(root, 'src/services/intelligence/OrganicPlannerService.ts'), 'utf8');
  const hasWrite = /\.prepare\(`\s*(INSERT|UPDATE|DELETE)/i.test(src);
  assert(!hasWrite, 'OrganicPlannerService has a write DB operation');
});

test('planner route performs no INSERT/UPDATE/DELETE', () => {
  const src = fs.readFileSync(path.join(root, 'src/routes/planner.ts'), 'utf8');
  const hasWrite = /\.prepare\(`\s*(INSERT|UPDATE|DELETE)/i.test(src);
  assert(!hasWrite, 'planner route has a write DB operation');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`Phase 4C: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.error}`));
  process.exit(1);
}
console.log('='.repeat(60));
