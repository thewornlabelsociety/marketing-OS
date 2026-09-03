#!/usr/bin/env node
/**
 * Phase 4G — Platform-Faithful Visual Preview System verifier
 * 30 structural checks. Run from repo root.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'frontend', 'src');

function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
}

const checks = [];
let passed = 0;
let failed = 0;

function check(id, description, fn) {
  try {
    const ok = fn();
    const status = ok ? 'PASS' : 'FAIL';
    if (ok) passed++; else failed++;
    checks.push({ id, status, description });
  } catch (e) {
    failed++;
    checks.push({ id, status: 'FAIL', description, error: e.message });
  }
}

// ── File existence ────────────────────────────────────────────────────────────

check('4G-01', 'PlatformPreview.tsx exists', () =>
  fs.existsSync(path.join(SRC, 'components/preview/PlatformPreview.tsx')));

check('4G-02', 'IPhoneFrame.tsx exists', () =>
  fs.existsSync(path.join(SRC, 'components/simulator/IPhoneFrame.tsx')));

check('4G-03', 'ChannelPreview.tsx exists', () =>
  fs.existsSync(path.join(SRC, 'features/studio/ChannelPreview.tsx')));

check('4G-04', 'CreativePreviewDrawer.tsx exists', () =>
  fs.existsSync(path.join(SRC, 'components/drawers/CreativePreviewDrawer.tsx')));

check('4G-05', 'RepurposePage.tsx exists', () =>
  fs.existsSync(path.join(SRC, 'features/repurpose/RepurposePage.tsx')));

// ── PlatformPreview exports and structure ────────────────────────────────────

const pp = read('frontend/src/components/preview/PlatformPreview.tsx') ?? '';

check('4G-06', 'PlatformPreview exports PlatformPreview function', () =>
  pp.includes('export function PlatformPreview('));

check('4G-07', 'PlatformPreview exports PlatformPreviewPlanned interface', () =>
  pp.includes('export interface PlatformPreviewPlanned'));

check('4G-08', 'PlatformPreview imports IPhoneFrame', () =>
  pp.includes("from '../simulator/IPhoneFrame'"));

check('4G-09', 'PlatformPreview contains InstagramFeedContent', () =>
  pp.includes('function InstagramFeedContent('));

check('4G-10', 'PlatformPreview contains InstagramCarouselContent', () =>
  pp.includes('function InstagramCarouselContent('));

check('4G-11', 'PlatformPreview contains InstagramStoryContent', () =>
  pp.includes('function InstagramStoryContent('));

check('4G-12', 'PlatformPreview contains ReelContent', () =>
  pp.includes('function ReelContent('));

check('4G-13', 'PlatformPreview contains FacebookPostContent', () =>
  pp.includes('function FacebookPostContent('));

check('4G-14', 'PlatformPreview contains EmailContent', () =>
  pp.includes('function EmailContent('));

check('4G-15', 'PlatformPreview contains PlannedBadge', () =>
  pp.includes('function PlannedBadge('));

check('4G-16', 'Instagram feed uses 4:5 aspect ratio', () =>
  pp.includes('aspect-[4/5]'));

check('4G-17', 'Instagram story uses full-bleed h-[480px]', () =>
  pp.includes('h-[480px]'));

check('4G-18', 'Reel uses full-bleed h-[480px]', () =>
  pp.match(/function ReelContent[\s\S]{0,800}h-\[480px\]/) !== null);

check('4G-19', 'Facebook post uses 1.91:1 aspect ratio', () =>
  pp.includes('aspect-[1.91/1]'));

check('4G-20', 'Carousel has ChevronLeft navigation', () =>
  pp.includes('ChevronLeft'));

check('4G-21', 'Carousel has ChevronRight navigation', () =>
  pp.includes('ChevronRight'));

check('4G-22', 'Story has progress bar buttons', () =>
  pp.match(/InstagramStoryContent[\s\S]{0,1200}button/) !== null);

// ── IPhoneFrame optional title ───────────────────────────────────────────────

const frame = read('frontend/src/components/simulator/IPhoneFrame.tsx') ?? '';

check('4G-23', 'IPhoneFrame has optional title prop', () =>
  frame.includes('title?:'));

// ── ChannelPreview delegation ────────────────────────────────────────────────

const cp = read('frontend/src/features/studio/ChannelPreview.tsx') ?? '';

check('4G-24', 'ChannelPreview imports PlatformPreview', () =>
  cp.includes("from '../../components/preview/PlatformPreview'"));

check('4G-25', 'ChannelPreview accepts imageUrl prop', () =>
  cp.includes('imageUrl'));

check('4G-26', 'ChannelPreview does not contain old FRAME map', () =>
  !cp.includes("const FRAME:"));

// ── CreativePreviewDrawer media resolution ───────────────────────────────────

const cpd = read('frontend/src/components/drawers/CreativePreviewDrawer.tsx') ?? '';

check('4G-27', 'CreativePreviewDrawer tracks imageUrl state', () =>
  cpd.includes('imageUrl') && cpd.includes('setImageUrl'));

check('4G-28', 'CreativePreviewDrawer calls getMediaPreviewUrl', () =>
  cpd.includes('getMediaPreviewUrl'));

check('4G-29', 'CreativePreviewDrawer passes imageUrl to ChannelPreview', () =>
  cpd.includes('imageUrl={imageUrl}'));

// ── OperatorStudioPage STORY aspect fix ─────────────────────────────────────

const op = read('frontend/src/features/studio/OperatorStudioPage.tsx') ?? '';

check('4G-30', 'OperatorStudioPage STORY uses correct 9:16 aspect ratio', () =>
  op.includes("STORY:") && op.includes("aspect-[9/16]") &&
  !op.match(/STORY:\s*\{[^}]*aspect-\[4\/5\]/));

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n PHASE 4G — PLATFORM-FAITHFUL VISUAL PREVIEW SYSTEM\n');
console.log(' Structural verification — 30 checks\n');
console.log(' ' + '─'.repeat(60));

for (const c of checks) {
  const icon = c.status === 'PASS' ? '✓' : '✗';
  const color = c.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(` ${color}${icon}${reset} [${c.id}] ${c.description}`);
  if (c.error) console.log(`     Error: ${c.error}`);
}

console.log(' ' + '─'.repeat(60));
console.log(`\n  PASSED: ${passed} / ${checks.length}`);
console.log(`  FAILED: ${failed} / ${checks.length}`);

if (failed === 0) {
  console.log('\n  ✓ PHASE 4G READY FOR BROWSER ACCEPTANCE\n');
  process.exit(0);
} else {
  console.log('\n  ✗ PHASE 4G BLOCKED — fix failures above\n');
  process.exit(1);
}
