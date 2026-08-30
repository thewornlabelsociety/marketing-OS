import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { contentPlannerService } from '../src/services/campaigns/ContentPlannerService';
import { campaignPlannerService } from '../src/services/campaigns/CampaignPlannerService';
import { contentPlansRouter } from '../src/routes/contentPlans';
import { validateChannelCombo } from '../src/services/channels/ChannelCapabilityRegistry';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';
import { previewFormatFor, previewChannelFor } from '../src/services/channels/ChannelCapabilityRegistry';

async function main() {
initDatabase();

let failed = 0;
let passed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function insertWorkspace(id: string, name: string) {
  db.prepare(`
    INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys)
    VALUES (?, ?, ?, ?, '{}', '{}')
  `).run(id, LOCAL_TENANT_ID, name, id);
}

function insertCampaign(id: string, workspaceId: string, status = 'DRAFTING') {
  db.prepare(`
    INSERT INTO campaigns
      (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
    VALUES (?, ?, 'obj_sys_sales', ?, ?, 'PRODUCT', 'Test Product', '{}', '[]')
  `).run(id, workspaceId, `Campaign ${id}`, status);
}

function insertCampaignPlan(id: string, campaignId: string, workspaceId: string, version: number, isCurrent: number) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO campaign_plans
      (id, campaign_id, workspace_id, version, status, is_current,
       strategy_campaign_angle, strategy_core_message, strategy_proposition, strategy_audience_focus,
       hooks, proof_points, cta_primary, cta_alternatives, channels, content_mix,
       cadence_summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'READY_FOR_REVIEW', ?,
            'Angle', 'Core', 'Prop', 'Audience',
            '{"primary":"hook","supporting":[]}', '["proof"]', 'Buy now', '[]',
            '[{"channel":"instagram","role":"primary","rationale":"reach"}]',
            '[{"contentType":"carousel","channel":"instagram","format":"4:5","quantity":1,"purpose":"proof"}]',
            '2 weeks', ?, ?)
  `).run(id, campaignId, workspaceId, version, isCurrent, now, now);
}

const wsA = `ws_a_${randomUUID()}`;
const wsB = `ws_b_${randomUUID()}`;
const campA = `camp_a_${randomUUID()}`;
const campB = `camp_b_${randomUUID()}`;
const planV1 = `plan_v1_${randomUUID()}`;
const planV2 = `plan_v2_${randomUUID()}`;

insertWorkspace(wsA, 'Workspace A');
insertWorkspace(wsB, 'Workspace B');
insertCampaign(campA, wsA, 'DRAFTING');
insertCampaign(campB, wsB, 'DRAFTING');
insertCampaignPlan(planV1, campA, wsA, 1, 0);
insertCampaignPlan(planV2, campA, wsA, 2, 1);

// --- Test C (no DB dependency beyond registry) ---
check('C Email+Story rejected', validateChannelCombo({ channel: 'EMAIL', contentType: 'STORY', format: 'VERTICAL_9_16' }).length > 0);
check('C TikTok+Newsletter rejected', validateChannelCombo({ channel: 'TIKTOK', contentType: 'NEWSLETTER', format: 'NEWSLETTER' }).length > 0);
check('C Instagram+Newsletter rejected', validateChannelCombo({ channel: 'INSTAGRAM', contentType: 'NEWSLETTER', format: 'NEWSLETTER' }).length > 0);
check('C Instagram carousel 4:5 accepted', validateChannelCombo({ channel: 'INSTAGRAM', contentType: 'CAROUSEL', format: 'PORTRAIT_4_5', deviceTargets: ['mobile'] }).length === 0);
check('C Instagram story 9:16 accepted', validateChannelCombo({ channel: 'INSTAGRAM', contentType: 'STORY', format: 'VERTICAL_9_16', deviceTargets: ['mobile'] }).length === 0);
check('C Email newsletter mobile accepted', validateChannelCombo({ channel: 'EMAIL', contentType: 'NEWSLETTER', format: 'NEWSLETTER', deviceTargets: ['mobile'] }).length === 0);
check('C Email newsletter desktop accepted', validateChannelCombo({ channel: 'EMAIL', contentType: 'NEWSLETTER', format: 'NEWSLETTER', deviceTargets: ['desktop'] }).length === 0);
check('C Instagram story desktop rejected', validateChannelCombo({ channel: 'INSTAGRAM', contentType: 'STORY', format: 'VERTICAL_9_16', deviceTargets: ['desktop'] }).length > 0);

// --- Test A ---
const beforeA = contentPlannerService.getCurrent(campA);
const genNoApproval = await contentPlannerService.generate(campA);
check('A generate without approved strategy rejected', 'error' in genNoApproval && genNoApproval.code === 'STRATEGY_NOT_APPROVED');
check('A no content plan persisted', contentPlannerService.getCurrent(campA) === beforeA);

const approveV1 = campaignPlannerService.approvePlan(campA, planV1);
check('A strategy V1 can be approved', !approveV1.error);

const afterApprove = contentPlannerService.persistFromStructured(campA, PRODUCT_PROOF_FIXTURE);
check('A generate after approval allowed', !('error' in afterApprove));

// --- Test B ---
if (!('error' in afterApprove)) {
  check('B sourcePlanId is V1', afterApprove.plan.sourcePlanId === planV1, afterApprove.plan.sourcePlanId);
  check('B sourcePlanVersion is 1', afterApprove.plan.sourcePlanVersion === 1, String(afterApprove.plan.sourcePlanVersion));
  check('B did not use V2', afterApprove.plan.sourcePlanId !== planV2);
}

// --- Test D ---
const plan = contentPlannerService.getCurrent(campA);
if (plan) {
  const concept = plan.concepts.find((c) => c.contentKey === 'product-proof');
  const carousel = plan.deliverables.find((d) => d.contentKey === 'launch-carousel-01');
  const reel = plan.deliverables.find((d) => d.contentKey === 'launch-reel-01');
  const email = plan.deliverables.find((d) => d.contentKey === 'launch-newsletter-01');
  check('D concept exists', Boolean(concept));
  check('D carousel references product-proof', Boolean(carousel && (carousel.sourceConceptId === concept?.id || carousel.sourceConceptId === 'product-proof')));
  check('D reel references product-proof', Boolean(reel && (reel.sourceConceptId === concept?.id || reel.sourceConceptId === 'product-proof')));
  check('D email references product-proof', Boolean(email && (email.sourceConceptId === concept?.id || email.sourceConceptId === 'product-proof')));
  check('D distinct channels', Boolean(carousel && reel && email && carousel.channel === 'INSTAGRAM' && reel.channel === 'INSTAGRAM' && email.channel === 'EMAIL'));
  check('D distinct formats', Boolean(carousel && reel && email && carousel.format === 'PORTRAIT_4_5' && reel.format === 'VERTICAL_9_16' && email.format === 'NEWSLETTER'));
  check('D distinct purposes', Boolean(carousel && reel && email && carousel.purpose !== reel.purpose && reel.purpose !== email.purpose));
  check('D distinct CTA roles', Boolean(carousel && reel && email && carousel.ctaRole !== reel.ctaRole && email.ctaRole));
}

// --- Test E ---
const v1 = contentPlannerService.getCurrent(campA);
if (plan && v1) {
  const withoutTikTok: typeof PRODUCT_PROOF_FIXTURE = {
    ...PRODUCT_PROOF_FIXTURE,
    deliverables: PRODUCT_PROOF_FIXTURE.deliverables!.filter((d) => d.channel !== 'TIKTOK'),
  };
  const revised = contentPlannerService.reviseFromStructured(campA, 'Remove TikTok. Keep everything else unchanged.', withoutTikTok);
  check('E revision persisted', !('error' in revised));
  if (!('error' in revised)) {
    const kept = ['launch-carousel-01', 'launch-reel-01', 'launch-newsletter-01'];
    for (const key of kept) {
      const prev = v1.deliverables.find((d) => d.contentKey === key);
      const next = revised.plan.deliverables.find((d) => d.contentKey === key);
      check(`E ${key} id retained`, Boolean(prev && next && prev.id === next.id));
      check(`E ${key} contentKey retained`, Boolean(next && next.contentKey === key));
    }
    check('E TikTok removed', !revised.plan.deliverables.some((d) => d.channel === 'TIKTOK'));
    const v1Still = contentPlannerService.getById(v1.id, campA);
    check('E V1 retrievable', Boolean(v1Still && v1Still.version === 1));
  }
}

// --- Test F ---
console.log('BLOCKED  F targeted AI revision — AI PROVIDER NOT CONFIGURED');

// --- Test H ---
const versions = contentPlannerService.getAllVersions(campA);
const first = versions.find((v) => v.version === 1);
const second = versions.find((v) => v.version === 2) ?? versions[0];
if (first && second) {
  const approval = contentPlannerService.approve(campA, first.id);
  check('H approve V1 succeeded', !approval.error);
  const stored = contentPlannerService.getApproval(campA);
  check('H approval references V1 id', stored?.contentPlanId === first.id);
  check('H approval references V1 version', stored?.contentPlanVersion === 1);
}

// --- Test I ---
const versionsBeforeI = contentPlannerService.getAllVersions(campA).length;
const genNoAi = await contentPlannerService.generate(campA);
check('I generate without AI reports unavailable', 'error' in genNoAi && genNoAi.code === 'AI_UNAVAILABLE');
check('I no version increment when AI unavailable', contentPlannerService.getAllVersions(campA).length === versionsBeforeI);
check('I no content plan on campaign B', contentPlannerService.getCurrent(campB) === null);
check('I no version increment on B', contentPlannerService.getAllVersions(campB).length === 0);

const strategyB = contentPlannerService.resolveApprovedStrategy(campB);
check('I campaign B still has no approved strategy requirement intact', 'error' in strategyB);

// --- Test J ---
const storyDevices = validateChannelCombo({ channel: 'INSTAGRAM', contentType: 'STORY', format: 'VERTICAL_9_16', deviceTargets: ['desktop'] });
check('J story desktop invalid', storyDevices.length > 0);
check('J carousel preview format', previewFormatFor('CAROUSEL') === 'carousel');
check('J story preview format', previewFormatFor('STORY') === 'story');
check('J newsletter preview format', previewFormatFor('NEWSLETTER') === 'newsletter');
check('J instagram preview channel', previewChannelFor('INSTAGRAM') === 'instagram');
check('J email supports desktop', validateChannelCombo({ channel: 'EMAIL', contentType: 'NEWSLETTER', format: 'NEWSLETTER', deviceTargets: ['desktop'] }).length === 0);

// --- Test G HTTP isolation ---
const app = express();
app.use(express.json());
app.use('/api/campaigns/:campaignId/content-plan', contentPlansRouter);

const server = app.listen(0);
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

async function hit(method: string, path: string, workspaceId: string, body?: unknown) {
  const url = method === 'GET'
    ? `${base}${path}?workspaceId=${encodeURIComponent(workspaceId)}`
    : `${base}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify({ ...(body as object ?? {}), workspaceId }),
  });
  return res.status;
}

try {
  const read = await hit('GET', `/api/campaigns/${campA}/content-plan`, wsB);
  const generate = await hit('POST', `/api/campaigns/${campA}/content-plan`, wsB);
  const versionsStatus = await hit('GET', `/api/campaigns/${campA}/content-plan/versions`, wsB);
  const revise = await hit('POST', `/api/campaigns/${campA}/content-plan/revisions`, wsB, { requestText: 'change' });
  const approveIso = await hit('POST', `/api/campaigns/${campA}/content-plan/approval`, wsB, { contentPlanId: first?.id });
  check('G read rejected', read === 403);
  check('G generate rejected', generate === 403);
  check('G versions rejected', versionsStatus === 403);
  check('G revise rejected', revise === 403);
  check('G approve rejected', approveIso === 403);
} finally {
  server.close();
}

console.log(`\nPhase 3C verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
