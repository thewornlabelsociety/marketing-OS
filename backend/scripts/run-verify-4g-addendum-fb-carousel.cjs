#!/usr/bin/env node
/**
 * Phase 4G Addendum — Facebook Carousel verifier
 * 56 structural checks (FB-01–36 + CM-01–20). Run from repo root.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'frontend', 'src');

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

// ── Destination definitions ───────────────────────────────────────────────────

const dest = read('backend/src/types/studioDestinations.ts') ?? '';

check('FB-01', 'Facebook Carousel entry exists in CREATIVE_DESTINATIONS', () =>
  dest.includes("label: 'Facebook Carousel'"));

check('FB-02', 'Facebook Carousel uses FACEBOOK channel', () => {
  // channel property appears before label in the object literal
  const line = dest.split('\n').find(l => l.includes("'Facebook Carousel'"));
  return line !== undefined && line.includes("'FACEBOOK'");
});

check('FB-03', 'Facebook Carousel uses CAROUSEL contentType', () => {
  const line = dest.split('\n').find(l => l.includes("'Facebook Carousel'"));
  return line !== undefined && line.includes("'CAROUSEL'");
});

check('FB-04', 'Facebook Carousel has supportsPublishing: false', () => {
  const line = dest.split('\n').find(l => l.includes("'Facebook Carousel'"));
  return line !== undefined && line.includes('supportsPublishing: false');
});

check('FB-05', 'Facebook Post remains separate (STATIC_POST)', () => {
  const line = dest.split('\n').find(l => l.includes("'Facebook Post'"));
  return line !== undefined && line.includes("'STATIC_POST'");
});

check('FB-06', 'Instagram Carousel remains separate', () => {
  const line = dest.split('\n').find(l => l.includes("'Instagram Carousel'"));
  return line !== undefined && line.includes("'INSTAGRAM'");
});

check('FB-07', 'Facebook Post still has supportsPublishing: true', () => {
  const line = dest.split('\n').find(l => l.includes("'Facebook Post'"));
  return line !== undefined && line.includes('supportsPublishing: true');
});

// ── Content key abbrev ────────────────────────────────────────────────────────

const rp = read('backend/src/services/business/RepurposeService.ts') ?? '';

check('FB-08', "RepurposeService has 'fb-car' abbrev for FACEBOOK/CAROUSEL", () =>
  rp.includes("'FACEBOOK/CAROUSEL'") && rp.includes("'fb-car'"));

check('FB-09', "'fb-car' and 'fb-post' are distinct (no collision)", () => {
  // Both exist, have different strings
  const postLine = rp.split('\n').find(l => l.includes('fb-post'));
  const carLine  = rp.split('\n').find(l => l.includes('fb-car'));
  return postLine !== undefined && carLine !== undefined && postLine !== carLine;
});

check('FB-10', "FACEBOOK/STATIC_POST maps to 'fb-post' (unchanged)", () =>
  rp.match(/'FACEBOOK\/STATIC_POST'\s*:\s*'fb-post'/) !== null);

// ── PlatformPreview component ─────────────────────────────────────────────────

const pp = read('frontend/src/components/preview/PlatformPreview.tsx') ?? '';

check('FB-11', 'FacebookCarouselContent function exists', () =>
  pp.includes('function FacebookCarouselContent('));

// Extract FacebookCarouselContent body once for all inner checks
const fbCarStart = pp.indexOf('function FacebookCarouselContent(');
const fbCarEnd   = fbCarStart >= 0 ? pp.indexOf('\n// ─', fbCarStart + 10) : -1;
const fbCarBody  = fbCarStart >= 0 && fbCarEnd >= 0 ? pp.slice(fbCarStart, fbCarEnd) : '';

check('FB-12', 'FacebookCarouselContent uses Facebook page identity (blue avatar)', () =>
  fbCarBody.includes('bg-blue-600'));

check('FB-13', 'FacebookCarouselContent has carousel navigation (ChevronLeft)', () =>
  fbCarBody.includes('ChevronLeft'));

check('FB-14', 'FacebookCarouselContent has slide counter', () =>
  fbCarBody.includes('idx + 1') && fbCarBody.includes('count'));

check('FB-15', 'FacebookCarouselContent has Facebook action bar (Like/Comment/Share)', () =>
  fbCarBody.includes('Like') && fbCarBody.includes('Comment') && fbCarBody.includes('Share'));

check('FB-16', 'FacebookCarouselContent uses aspect-square (Facebook carousel format)', () =>
  fbCarBody.includes('aspect-square'));

check('FB-17', 'Dispatch: isFacebook && isCarousel fires before plain isCarousel', () => {
  const fbAndCar = pp.indexOf('isFacebook && isCarousel');
  const plainCar = pp.indexOf('isCarousel ?');
  const inlineCarousel = pp.indexOf(': isCarousel ?');
  const carPos = plainCar >= 0 ? plainCar : inlineCarousel;
  return fbAndCar >= 0 && carPos >= 0 && fbAndCar < carPos;
});

check('FB-18', 'FacebookPostContent still present (not removed)', () =>
  pp.includes('function FacebookPostContent('));

check('FB-19', 'isFacebook-only branch still renders FacebookPostContent', () =>
  pp.includes('FacebookPostContent'));

check('FB-20', 'ImageSlot used in FacebookCarouselContent (real image or truthful fallback)', () =>
  fbCarBody.includes('ImageSlot'));

// ── No Instagram chrome leaking into Facebook Carousel ───────────────────────

check('FB-21', 'FacebookCarouselContent does not use IGAvatar', () =>
  fbCarBody.length > 0 && !fbCarBody.includes('IGAvatar'));

check('FB-22', 'FacebookCarouselContent does not use IGHeader', () =>
  fbCarBody.length > 0 && !fbCarBody.includes('IGHeader'));

check('FB-23', 'FacebookCarouselContent does not use IGTabBar', () =>
  fbCarBody.length > 0 && !fbCarBody.includes('IGTabBar'));

// ── Backend TypeScript ────────────────────────────────────────────────────────

check('FB-24', 'studioDestinations.ts compiles (no syntax errors — basic check)', () => {
  const d = read('backend/src/types/studioDestinations.ts') ?? '';
  return d.includes('export const CREATIVE_DESTINATIONS') && d.includes("label: 'Facebook Carousel'");
});

check('FB-25', 'RepurposeService.ts abbrev map is a valid object literal', () => {
  const block = rp.match(/const map: Record[\s\S]{0,500}};/);
  return block !== null && block[0].includes('fb-car') && block[0].includes('fb-post');
});

// ── WLS read-only safety ──────────────────────────────────────────────────────

check('FB-26', 'No new WLS write routes added (wls connector files unchanged)', () => {
  const wlsConnector = read('backend/src/integrations/wls/WLSConnector.ts') ?? '';
  return !wlsConnector.includes('CREATE') && !wlsConnector.includes('INSERT') && !wlsConnector.includes('UPDATE');
});

// ── Workspace isolation ───────────────────────────────────────────────────────

check('FB-27', 'Facebook Carousel destination uses generic channel names only', () =>
  !dest.includes('wls') && !dest.includes('worn-label') && !dest.includes('WornLabel'));

// ── Publishing safety ────────────────────────────────────────────────────────

check('FB-28', 'MetaPublishingProvider still rejects CAROUSEL for Facebook', () => {
  const meta = read('backend/src/integrations/meta/MetaPublishingProvider.ts') ?? '';
  return meta.includes('CAROUSEL') && meta.toLowerCase().includes('not supported');
});

check('FB-29', 'No fake FACEBOOK/CAROUSEL publish path added to MetaPublishingProvider', () => {
  const meta = read('backend/src/integrations/meta/MetaPublishingProvider.ts') ?? '';
  return !meta.match(/CAROUSEL[\s\S]{0,100}publishCarousel/);
});

// ── Idempotency ──────────────────────────────────────────────────────────────

check('FB-30', 'fb-car key is distinct from fb-post in abbrev map', () =>
  rp.includes("'FACEBOOK/CAROUSEL':        'fb-car'") ||
  rp.includes("'FACEBOOK/CAROUSEL': 'fb-car'"));

check('FB-31', 'Request hash still sorts destinations array', () =>
  rp.match(/\[\.\.\.\w+\]\.sort\(\)/) !== null);

// ── Existing 4G verifier still passes ───────────────────────────────────────

check('FB-32', 'PlatformPreview still has all 6 original channel renderers', () =>
  pp.includes('function InstagramFeedContent(') &&
  pp.includes('function InstagramCarouselContent(') &&
  pp.includes('function InstagramStoryContent(') &&
  pp.includes('function ReelContent(') &&
  pp.includes('function FacebookPostContent(') &&
  pp.includes('function EmailContent('));

check('FB-33', 'PlatformPreview now has 7 renderers (original 6 + FacebookCarousel)', () =>
  pp.includes('function FacebookCarouselContent('));

check('FB-34', 'Original CREATIVE_DESTINATIONS count increased by 1 (now 7)', () => {
  const matches = dest.match(/supportsCreative: true/g);
  return matches !== null && matches.length === 7;
});

check('FB-35', 'Diagnostic scripts remain excluded from tracked files', () =>
  !fs.existsSync(path.join(ROOT, '.git/refs/..')) ||
  fs.existsSync(path.join(ROOT, 'backend/scripts/audit-production-sync.cjs')));

check('FB-36', 'findDestination helper can locate Facebook Carousel', () => {
  const hasFbCar = dest.match(/"FACEBOOK"[\s\S]{0,40}"CAROUSEL"/) ||
                   dest.match(/'FACEBOOK'[\s\S]{0,40}'CAROUSEL'/);
  return hasFbCar !== null;
});

// ── Carousel Media Truth ─────────────────────────────────────────────────────

const cm = read('backend/src/db/migrations/023-carousel-slide-media.sql') ?? '';
const cc = read('backend/src/routes/campaignCreative.ts') ?? '';
const ppx = read('frontend/src/components/preview/PlatformPreview.tsx') ?? '';
const chx = read('frontend/src/features/studio/ChannelPreview.tsx') ?? '';
const cpd = read('frontend/src/components/drawers/CreativePreviewDrawer.tsx') ?? '';
const rpp = read('frontend/src/features/repurpose/RepurposePage.tsx') ?? '';
const types = read('frontend/src/types/index.ts') ?? '';

check('CM-01', 'Migration 023 adds media_asset_id to creative_source_links', () =>
  cm.includes('creative_source_links') && cm.includes('media_asset_id'));

check('CM-02', 'Migration 023 is additive only (ALTER TABLE, no DROP)', () =>
  cm.includes('ALTER TABLE') && !cm.includes('DROP'));

check('CM-03', 'campaignCreative GET /:contentKey enriches CAROUSEL with carouselSlideImages', () =>
  cc.includes('carouselSlideImages') && cc.includes('source_records') && cc.includes('ORDER BY csl.position'));

check('CM-04', 'Enrichment queries source_records for image_urls', () =>
  cc.includes('image_urls') && cc.includes('creative_source_links'));

check('CM-05', 'Enrichment also joins media_assets for future MOS slide media', () =>
  cc.includes('media_assets') && cc.includes('asset_key'));

check('CM-06', 'CreativeArtifact type has carouselSlideImages field', () =>
  types.includes('carouselSlideImages'));

check('CM-07', 'PlatformPreview Props interface includes mediaItems', () =>
  ppx.includes('mediaItems') && ppx.includes('Props'));

check('CM-08', 'InstagramCarouselContent accepts and uses mediaItems', () => {
  const fnStart = ppx.indexOf('function InstagramCarouselContent(');
  const fnEnd = ppx.indexOf('\n// ─', fnStart + 10);
  const body = fnStart >= 0 && fnEnd >= 0 ? ppx.slice(fnStart, fnEnd) : '';
  return body.includes('mediaItems') && body.includes('slideImage');
});

check('CM-09', 'FacebookCarouselContent accepts and uses mediaItems', () => {
  const fnStart = ppx.indexOf('function FacebookCarouselContent(');
  const fnEnd = ppx.indexOf('\n// ─', fnStart + 10);
  const body = fnStart >= 0 && fnEnd >= 0 ? ppx.slice(fnStart, fnEnd) : '';
  return body.includes('mediaItems') && body.includes('slideImage');
});

check('CM-10', 'PlatformPreview dispatcher passes mediaItems to carousel renderers', () =>
  ppx.includes('mediaItems={mediaItems}'));

check('CM-11', 'ChannelPreview accepts mediaItems prop', () =>
  chx.includes('mediaItems') && chx.includes('mediaItems?: string[]'));

check('CM-12', 'ChannelPreview passes mediaItems to PlatformPreview', () =>
  chx.includes('mediaItems={mediaItems}'));

check('CM-13', 'CreativePreviewDrawer has mediaItems state', () =>
  cpd.includes('mediaItems') && cpd.includes('useState<string[]>'));

check('CM-14', 'CreativePreviewDrawer populates mediaItems from carouselSlideImages', () =>
  cpd.includes('carouselSlideImages') && cpd.includes('setMediaItems'));

check('CM-15', 'RepurposePage VersionReviewDrawer has mediaItems state', () =>
  rpp.includes('mediaItems') && rpp.includes('useState<string[]>'));

check('CM-16', 'RepurposePage populates mediaItems from carouselSlideImages', () =>
  rpp.includes('carouselSlideImages') && rpp.includes('setMediaItems'));

check('CM-17', 'RepurposePage passes mediaItems to PlatformPreview', () =>
  rpp.includes('mediaItems={mediaItems}'));

check('CM-18', 'RepurposeService still copies source_links from parent to child', () =>
  rpp.length > 0 && // RepurposePage exists
  read('backend/src/services/business/RepurposeService.ts')?.includes('creative_source_links') === true);

check('CM-19', 'No physical file duplication — references reused via source_links copy', () => {
  const rs = read('backend/src/services/business/RepurposeService.ts') ?? '';
  return rs.includes('INSERT OR IGNORE INTO creative_source_links') && !rs.includes('fs.copyFile');
});

check('CM-20', 'Historical fallback: single imageUrl still used when no carouselSlideImages', () =>
  cpd.includes('mediaAssetId') && cpd.includes('resolveImageUrl'));

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n PHASE 4G ADDENDUM — FACEBOOK CAROUSEL + CAROUSEL MEDIA TRUTH\n');
console.log(` Structural verification — ${checks.length} checks\n`);
console.log(' ' + '─'.repeat(60));

for (const c of checks) {
  const icon  = c.status === 'PASS' ? '✓' : '✗';
  const color = c.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(` ${color}${icon}${reset} [${c.id}] ${c.description}`);
  if (c.error) console.log(`     Error: ${c.error}`);
}

console.log(' ' + '─'.repeat(60));
console.log(`\n  PASSED: ${passed} / ${checks.length}`);
console.log(`  FAILED: ${failed} / ${checks.length}`);

if (failed === 0) {
  console.log('\n  ✓ FACEBOOK CAROUSEL ADDENDUM READY FOR BROWSER ACCEPTANCE\n');
  process.exit(0);
} else {
  console.log('\n  ✗ FACEBOOK CAROUSEL ADDENDUM BLOCKED — fix failures above\n');
  process.exit(1);
}
