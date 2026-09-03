#!/usr/bin/env node
'use strict';
/**
 * Phase 4E — Daily Operator Readiness — Verification
 * Run: node scripts/run-verify-phase-4e.cjs
 * 32 checks across 10 sections.
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) { console.log(`  ✓  ${label}`); pass++; }
function ko(label, reason) { console.error(`  ✗  ${label}${reason ? ` — ${reason}` : ''}`); fail++; failures.push({ label, reason }); }
function check(label, condition, reason) { if (condition) ok(label); else ko(label, reason); }

function readFile(rel) {
  try { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }
  catch { return null; }
}

// ─── [1/10] Shared Display Labels utility ─────────────────────────────────────
console.log('\n[1/10] Shared Display Labels (displayLabels.ts)');

const labels = readFile('frontend/src/utils/displayLabels.ts');
check('displayLabels.ts exists', labels !== null);
check('CONTENT_TYPE_LABELS has STATIC_POST→Post', labels?.includes("STATIC_POST: 'Post'"));
check('CONTENT_TYPE_LABELS has TALKING_POINTS→Reel', labels?.includes("TALKING_POINTS: 'Reel / TikTok concept'"));
check('CHANNEL_LABELS has INSTAGRAM, FACEBOOK, TIKTOK', labels?.includes("INSTAGRAM: 'Instagram'") && labels?.includes("FACEBOOK: 'Facebook'") && labels?.includes("TIKTOK: 'TikTok'"));
check('contentTypeLabel() exported', labels?.includes('export function contentTypeLabel'));
check('channelLabel() exported', labels?.includes('export function channelLabel'));
check('humanizeCampaignName() exported', labels?.includes('export function humanizeCampaignName'));
check('No hardcoded brand name in displayLabels', !labels?.includes("'Worn Label'") && !labels?.includes('"Worn Label"'));

// ─── [2/10] Dashboard Triage (4E-1) ───────────────────────────────────────────
console.log('\n[2/10] Dashboard Triage (4E-1)');

const dashboard = readFile('frontend/src/features/dashboard/DashboardPage.tsx');
check('DashboardPage exists', dashboard !== null);
check('NEEDS YOU capped at 4 (slice(1,5))', dashboard?.includes('needsAttention.slice(1,5)') || dashboard?.includes('needsAttention.slice(1, 5)'));
check('WORTH DOING NEXT section present (readyForYou)', dashboard?.includes('Worth doing next'));
check('readyForYou sliced to 3 (slice(0,3))', dashboard?.includes('readyForYou.slice(0,3)') || dashboard?.includes('readyForYou.slice(0, 3)'));
check('"View all work" link present', dashboard?.includes('View all work'));
check('Raw StatusPill count removed (no StatusPill import)', !dashboard?.includes('StatusPill'));
check('No hardcoded "188" item count', !dashboard?.includes('>188') && !dashboard?.includes('188 items'));

// ─── [3/10] Create Versions Entry — Studio Editor (4E-2) ──────────────────────
console.log('\n[3/10] Create Versions — Studio Editor (4E-2)');

const opStudio = readFile('frontend/src/features/studio/OperatorStudioPage.tsx');
check('OperatorStudioPage exists', opStudio !== null);
check('setRepurposeSourceArtifactId in useApp destructuring', opStudio?.includes('setRepurposeSourceArtifactId'));
check('"Create versions" button present in studio approved state', opStudio?.includes('Create versions'));
check('Create versions calls setRepurposeSourceArtifactId', opStudio?.includes("setRepurposeSourceArtifactId(session.artifact.id)"));
check('Create versions navigates to repurpose tab', opStudio?.includes("setActiveTab('repurpose')"));

// ─── [4/10] Create Versions Entry — Creative Studio Card (4E-2) ───────────────
console.log('\n[4/10] Create Versions — Creative Studio Card (4E-2)');

const creativeStudio = readFile('frontend/src/features/studio/CreativeStudioPage.tsx');
check('CreativeStudioPage exists', creativeStudio !== null);
check('MoreHorizontal icon imported', creativeStudio?.includes('MoreHorizontal'));
check('onCreateVersions prop on LibraryCard', creativeStudio?.includes('onCreateVersions'));
check('"Create versions" menu item in card', creativeStudio?.includes('Create versions'));
check('Card overflow menu uses setRepurposeSourceArtifactId', creativeStudio?.includes('setRepurposeSourceArtifactId'));

// ─── [5/10] Back Navigation Fix (4E-6) ────────────────────────────────────────
console.log('\n[5/10] Back Navigation Fix (4E-6)');

check('entrySource state variable declared', opStudio?.includes("entrySource"));
check('entrySource initialized from studioReturnTarget', opStudio?.includes("studioReturnTarget ? 'library' : 'fresh'"));
check('handleBack checks entrySource for studio step', opStudio?.includes("entrySource === 'library'"));
check('Fresh flow back from studio goes to format step', opStudio?.includes("setStep('format')") && opStudio?.includes("entrySource === 'library'"));

// ─── [6/10] Generation Loading State (4E-5) ───────────────────────────────────
console.log('\n[6/10] Generation Loading State (4E-5)');

check('Setup step shows "Creating your content…"', opStudio?.includes('Creating your content…'));
check('Whole set cycling messages (Preparing Post)', opStudio?.includes('Preparing Post…'));
check('Whole set cycling messages (Preparing Carousel)', opStudio?.includes('Preparing Carousel…'));
check('Whole set cycling messages (Preparing Story)', opStudio?.includes('Preparing Story…'));
check('Whole set cycling messages (Preparing Email)', opStudio?.includes('Preparing Email…'));
check('setupMsgIdx state for cycling', opStudio?.includes('setupMsgIdx'));

// ─── [7/10] Planner Humanisation (4E-9) ───────────────────────────────────────
console.log('\n[7/10] Planner Humanisation (4E-9)');

const planner = readFile('frontend/src/features/planner/InstagramGridPlannerPage.tsx');
check('InstagramGridPlannerPage exists', planner !== null);
check('contentTypeLabel imported from displayLabels', planner?.includes("from '../../utils/displayLabels'") || planner?.includes('from "../../utils/displayLabels"'));
check('contentTypeLabel used for contentType display', planner?.includes('contentTypeLabel(item.contentType)'));
check('Raw item.contentType not rendered without label function', (() => {
  if (!planner) return false;
  const rawIdx = planner.indexOf('{item.contentType}');
  if (rawIdx === -1) return true;
  // Allow only if inside a ternary/conditional check, not a direct render
  const before = planner.slice(Math.max(0, rawIdx - 20), rawIdx);
  return before.includes('??') || before.includes('contentTypeLabel');
})(), 'raw {item.contentType} still rendered');

// ─── [8/10] WLS Read-Only Confirmation ────────────────────────────────────────
console.log('\n[8/10] WLS Read-Only');

const wls = readFile('backend/src/integrations/business/WornLabelConnector.ts');
check('WornLabelConnector: READ_PRODUCTS, READ_AVAILABILITY only', wls?.includes("'READ_PRODUCTS', 'READ_AVAILABILITY'") && !wls?.includes('WRITE'));
check('WornLabelConnector: no POST/PUT/DELETE/PATCH calls', !wls?.includes("method: 'POST'") && !wls?.includes("method: 'PUT'") && !wls?.includes("method: 'DELETE'"));

// ─── [9/10] AI Key Safety ────────────────────────────────────────────────────
console.log('\n[9/10] AI Key Safety');

const apiFile = readFile('frontend/src/services/api.ts');
check('Frontend api.ts does not contain OPENAI_API_KEY string', !apiFile?.includes('OPENAI_API_KEY'));
check('Frontend api.ts does not contain ANTHROPIC_API_KEY string', !apiFile?.includes('ANTHROPIC_API_KEY'));
const displayLabelsFile = readFile('frontend/src/utils/displayLabels.ts');
check('displayLabels.ts does not expose any API key', !displayLabelsFile?.includes('API_KEY') && !displayLabelsFile?.includes('apiKey'));

// ─── [10/10] No Hardcoded Brand Names ────────────────────────────────────────
console.log('\n[10/10] No Hardcoded Brand Names in New Files');

const newFiles = [
  readFile('frontend/src/utils/displayLabels.ts'),
];
for (const f of newFiles) {
  const hasWornLabel = f?.includes("'Worn Label'") || f?.includes('"Worn Label"');
  const hasFudi = f?.includes("'FÜDI'") || f?.includes('"FÜDI"') || f?.includes("FUDI");
  check('No brand name in displayLabels.ts', !hasWornLabel && !hasFudi);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Phase 4E: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}${f.reason ? ` (${f.reason})` : ''}`);
  }
}
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
