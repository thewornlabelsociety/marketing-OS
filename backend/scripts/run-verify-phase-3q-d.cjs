#!/usr/bin/env node
'use strict';
/**
 * Phase 3Q-D — Creative Quality & Daily Operator Polish — Verification
 * Run: node scripts/run-verify-phase-3q-d.cjs
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) {
  console.log(`  ✓  ${label}`);
  pass++;
}

function ko(label, reason) {
  console.error(`  ✗  ${label}${reason ? ` — ${reason}` : ''}`);
  fail++;
  failures.push({ label, reason });
}

function check(label, condition, reason) {
  if (condition) ok(label);
  else ko(label, reason);
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
  catch { return null; }
}

function fileExists(rel) {
  return fs.existsSync(path.join(__dirname, '..', rel));
}

// ─── Backend: Migration ───────────────────────────────────────────────────────
console.log('\n[1/7] Migration — creative_direction column');

const migration = readFile('src/db/migrations/015-creative-direction.sql');
check('Migration file exists', migration !== null, 'missing 015-creative-direction.sql');
check('Migration adds creative_direction column', migration?.includes('creative_direction'), 'column not found in SQL');
check('Migration uses safe ALTER TABLE', migration?.includes('ALTER TABLE creative_artifacts ADD COLUMN'), 'unsafe migration pattern');

// ─── Backend: OperatorStudioService ──────────────────────────────────────────
console.log('\n[2/7] OperatorStudioService — brand name and creative direction');

const studio = readFile('src/services/business/OperatorStudioService.ts');
check('Service file exists', studio !== null, 'missing OperatorStudioService.ts');

// Should NOT contain hardcoded "Worn Label" in AI prompt/brand context logic
const wornLabelMatches = (studio ?? '').match(/['"](Worn Label)['"]/g) ?? [];
check(
  'No hardcoded "Worn Label" string literals in service',
  wornLabelMatches.length === 0,
  `found ${wornLabelMatches.length} hardcoded instance(s)`,
);

check('buildSystemPrompt uses dynamic brandName param', studio?.includes('buildSystemPrompt'), 'function not found');
check('CreativeDirection type exported', studio?.includes("export type CreativeDirection"), 'not exported');
check('creative_direction written to DB in setup()', studio?.includes("creative_direction"), 'column not inserted');
check('templateContent uses direction param', studio?.includes('templateContent'), 'function not found');
check('aiGenerated flag is set truthfully', studio?.includes('aiGenerated'), 'flag not found in service');
check('Template fallback does NOT say "Template copy — AI unavailable"', !studio?.includes('Template copy — AI unavailable'), 'stale template wording found');

// ─── Backend: Routes — approve-all endpoint ───────────────────────────────────
console.log('\n[3/7] businessSources.ts — approve-all endpoint');

const routes = readFile('src/routes/businessSources.ts');
check('Routes file exists', routes !== null, 'missing businessSources.ts');
check('/studio/approve-all endpoint registered', routes?.includes('/studio/approve-all'), 'endpoint not found');
check('approve-all calls creativeGeneratorService.approve', routes?.includes('creativeGeneratorService.approve'), 'not calling real approve function');
check('approve-all validates workspace ownership', routes?.includes('workspace_id'), 'workspace ownership check missing');
check('approve-all returns per-artifact results array', routes?.includes('results.push'), 'results array not built');
check('creative_direction selected in library query', routes?.includes('creative_direction AS creativeDirection'), 'missing from SQL');
check('creativeDirection returned in library response', routes?.includes('creativeDirection:'), 'not in response object');

// ─── Frontend: api.ts ─────────────────────────────────────────────────────────
console.log('\n[4/7] frontend/src/services/api.ts — new methods');

const apiFe = readFile('../frontend/src/services/api.ts');
check('api.ts exists', apiFe !== null, 'missing api.ts');
check('approveWholeSet method present', apiFe?.includes('approveWholeSet'), 'method not found');
check('createStudioSession accepts creativeDirection', apiFe?.includes('creativeDirection'), 'param not found');
check('createWholeSet accepts creativeDirection', apiFe?.includes('WHOLE_SET'), 'whole-set format not found');

// ─── Frontend: types/index.ts ─────────────────────────────────────────────────
console.log('\n[5/7] frontend/src/types/index.ts — StudioLibraryItem.creativeDirection');

const types = readFile('../frontend/src/types/index.ts');
check('types/index.ts exists', types !== null, 'missing index.ts');
check('StudioLibraryItem has creativeDirection field', types?.includes('creativeDirection'), 'field not found');

// ─── Frontend: OperatorStudioPage ────────────────────────────────────────────
console.log('\n[6/7] OperatorStudioPage.tsx — feature coverage');

const opPage = readFile('../frontend/src/features/studio/OperatorStudioPage.tsx');
check('OperatorStudioPage.tsx exists', opPage !== null, 'missing file');

// No hardcoded "Worn Label" in studio page application logic
const wlInPage = (opPage ?? '').match(/['"`]Worn Label['"`]/g) ?? [];
check('No hardcoded "Worn Label" in studio page', wlInPage.length === 0, `found ${wlInPage.length} instance(s)`);

// Creative direction selector
check('Creative direction selector rendered', opPage?.includes('CreativeDirection'), 'direction type missing');
check('Direction labels (Editorial/Product-led/Minimal) defined', opPage?.includes('DIRECTION_LABELS'), 'DIRECTION_LABELS not defined');

// Format thumbnails
check('Distinct FormatThumb components rendered', opPage?.includes('FormatThumb'), 'FormatThumb not found');

// Responsive tabs
check('Edit/Preview responsive tabs present', opPage?.includes("'edit' | 'preview'"), 'tab state not found');
check('Edit panel hidden on small screens via tab', opPage?.includes("studioTab === 'preview' ? 'hidden lg:block' : 'block'"), 'responsive logic not found');

// WholeSetOverview
check('WholeSetOverview component present', opPage?.includes('WholeSetOverview'), 'component missing');
check('Looks good to all button', opPage?.includes('Looks good to all'), 'button text not found');
check('Partial failure handling in approve-all', opPage?.includes('partialErrors'), 'error state missing');

// Template copy wording
check('"Starter copy — edit to personalise" wording', opPage?.includes('Starter copy — edit to personalise'), 'old wording may still be present');
check('No "Template copy — AI unavailable"', !opPage?.includes('Template copy — AI unavailable'), 'old wording found');

// Status config reuse
check('STATUS_CONFIG mapping in studio page', opPage?.includes('STATUS_CONFIG'), 'STATUS_CONFIG not found');

// Product data gap fix
check('onContinue receives full product objects', opPage?.includes('onContinue: (ids: string[], products: SourceProduct[])'), 'product data gap fix not found');

// Email preview structure
check('EmailPreview has header band', opPage?.includes('EmailPreview'), 'EmailPreview not found');
check('Email CTA button rendered', opPage?.includes("content.cta.label"), 'CTA not found');

// Story gradient treatment
check('StoryPreview has gradient overlay', opPage?.includes('bg-gradient-to-t from-black/80'), 'gradient missing');

// Workspace name in quick actions (not hardcoded)
check('Quick actions use dynamic workspace name', opPage?.includes('workspaceName'), 'workspace name not dynamic');
check('Quick actions do NOT hardcode "Worn Label"', !opPage?.includes("'More Worn Label'") && !opPage?.includes('"More Worn Label"'), 'brand name hardcoded in quick actions');

// Carousel drag-to-reorder
check('Carousel slides support drag-to-reorder', opPage?.includes('onDragStart') && opPage?.includes('onDrop'), 'drag events missing');
check('Active slide scrolled on product chip click', opPage?.includes('scrollIntoView'), 'scrollIntoView missing');

// ─── Frontend: DashboardPage ──────────────────────────────────────────────────
console.log('\n[7/7] DashboardPage.tsx — Create button calls newStudioSession');

const dash = readFile('../frontend/src/features/dashboard/DashboardPage.tsx');
check('DashboardPage.tsx exists', dash !== null, 'missing file');
check('newStudioSession used in DashboardPage', dash?.includes('newStudioSession'), 'function not used');
check('Dashboard Create button does not call setActiveTab(\'create\')', !dash?.includes("setActiveTab('create')"), 'old navigation pattern still present');

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Phase 3Q-D: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}${f.reason ? ` (${f.reason})` : ''}`);
  }
}
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
