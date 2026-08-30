import express from 'express';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { contentPlannerService } from '../src/services/campaigns/ContentPlannerService';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { publishingSchedulerService } from '../src/services/publishing/PublishingSchedulerService';
import { campaignScheduleRouter } from '../src/routes/campaignSchedule';
import { integrationsRouter } from '../src/routes/integrations';
import { publishingDestinationsRouter } from '../src/routes/publishingDestinations';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';
import {
  CAROUSEL_CREATIVE_FIXTURE,
  NEWSLETTER_CREATIVE_FIXTURE,
  REEL_CREATIVE_FIXTURE,
} from './fixtures/creativeFixtures';
import {
  mockPublishCallLog,
  mockPublishShouldFail,
  resetMockPublishingState,
} from '../src/integrations/adapters/MockPublishingAdapter';
import { PublishingProviderRegistry } from '../src/integrations/adapters/PublishingProviderRegistry';

async function main() {
  initDatabase();
  PublishingProviderRegistry.resetForTests();
  resetMockPublishingState();

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
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string) {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, 'obj_sys_sales', ?, 'APPROVED', 'PRODUCT', 'Test Product', '{}', '[]')
    `).run(id, workspaceId, `Campaign ${id}`);
  }

  function insertCampaignPlan(id: string, campaignId: string, workspaceId: string, version: number, isCurrent: number) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans
        (id, campaign_id, workspace_id, version, status, is_current,
         strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
         channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'APPROVED', ?, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]', '[]', '[]', '2 weeks', ?, ?)
    `).run(id, campaignId, workspaceId, version, isCurrent, now, now);
    db.prepare(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET approved_plan_id = excluded.approved_plan_id, approved_version = excluded.approved_version
    `).run(`pa_${id}`, campaignId, workspaceId, id, version, now, now);
  }

  function seedApprovedContentPlan(campaignId: string, workspaceId: string, planId: string, version: number, isCurrent: number) {
    const now = new Date().toISOString();
    const planBody = JSON.stringify({
      summary: PRODUCT_PROOF_FIXTURE.summary,
      concepts: PRODUCT_PROOF_FIXTURE.concepts,
      deliverables: PRODUCT_PROOF_FIXTURE.deliverables,
      cadence: PRODUCT_PROOF_FIXTURE.cadence,
    });
    db.prepare(`
      INSERT INTO content_plans
        (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, ?, 'APPROVED', ?, ?, ?, ?)
    `).run(planId, workspaceId, campaignId, version, isCurrent, planBody, now, now);
  }

  function approveContentPlan(campaignId: string, workspaceId: string, planId: string, version: number) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET content_plan_id = excluded.content_plan_id, content_plan_version = excluded.content_plan_version
    `).run(`cpa_${planId}`, campaignId, workspaceId, planId, version, now, now);
  }

  function seedConnectionAndDestination(workspaceId: string, channel: string) {
    const connId = `conn_${randomUUID()}`;
    const destId = channel === 'EMAIL' ? `dest_email_${randomUUID()}` : `dest_instagram_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO integration_connections (id, workspace_id, provider_key, status, display_name, capabilities, created_at, updated_at)
      VALUES (?, ?, 'mock', 'CONNECTED', 'Mock Provider', '["publish"]', ?, ?)
    `).run(connId, workspaceId, now, now);
    db.prepare(`
      INSERT INTO publishing_destinations (id, workspace_id, connection_id, provider_key, channel, external_destination_id, display_name, status, created_at)
      VALUES (?, ?, ?, 'mock', ?, ?, ?, 'ACTIVE', ?)
    `).run(destId, workspaceId, connId, channel, `ext_${destId}`, `${channel} Destination`, now);
    return destId;
  }

  function seedCreative(campaignId: string, contentKey: string, fixture: Record<string, unknown>) {
    return creativeGeneratorService.persistFromStructured(campaignId, contentKey, fixture);
  }

  function approveCreative(campaignId: string, contentKey: string) {
    const current = creativeGeneratorService.getCurrent(campaignId, contentKey);
    if (!current) throw new Error(`No creative for ${contentKey}`);
    return creativeGeneratorService.approve(campaignId, contentKey, current.id);
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  const campA = `camp_a_${randomUUID()}`;
  const planId = `cplan_${randomUUID()}`;

  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');
  insertCampaign(campA, wsA);
  const campB = `camp_b_${randomUUID()}`;
  insertCampaign(campB, wsB);
  insertCampaignPlan(`strat_${campA}`, campA, wsA, 1, 1);
  seedApprovedContentPlan(campA, wsA, planId, 1, 1);
  approveContentPlan(campA, wsA, planId, 1);

  const reel = seedCreative(campA, 'launch-reel-01', REEL_CREATIVE_FIXTURE);
  const carousel = seedCreative(campA, 'launch-carousel-01', CAROUSEL_CREATIVE_FIXTURE);
  seedCreative(campA, 'launch-newsletter-01', NEWSLETTER_CREATIVE_FIXTURE);

  // --- Test A ---
  const unapprovedSchedule = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  check('A schedule without approved creative rejected', 'error' in unapprovedSchedule && unapprovedSchedule.code === 'CREATIVE_NOT_APPROVED');

  approveCreative(campA, 'launch-reel-01');
  const reelV1 = creativeGeneratorService.getCurrent(campA, 'launch-reel-01')!;
  const scheduled = schedulingService.create(campA, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    timezone: 'Pacific/Auckland',
    publicationMode: 'MANUAL',
  });
  check('A schedule after approval succeeds', !('error' in scheduled));

  // --- Test B ---
  const reelV2 = creativeGeneratorService.reviseFromStructured(campA, 'launch-reel-01', 'New hook', {
    ...REEL_CREATIVE_FIXTURE,
    hook: 'Updated hook for version 2',
  });
  if (!('error' in scheduled) && !('error' in reelV2)) {
    check('B sourceCreativeArtifactId is V1', scheduled.item.sourceCreativeArtifactId === reelV1.id);
    check('B sourceCreativeVersion is 1', scheduled.item.sourceCreativeVersion === 1);
    check('B did not use V2', scheduled.item.sourceCreativeArtifactId !== reelV2.artifact.id);
  }

  // --- Test C ---
  check('C schedule remains V1 after V2 generated', !('error' in scheduled) && schedulingService.getById(scheduled.item.id, campA)?.sourceCreativeVersion === 1);
  approveCreative(campA, 'launch-reel-01');
  const stillV1 = schedulingService.getById(scheduled.item.id, campA);
  check('C schedule remains V1 after V2 approved', stillV1?.sourceCreativeArtifactId === reelV1.id);
  const v2Artifact = creativeGeneratorService.getCurrent(campA, 'launch-reel-01')!;
  const explicitUpdate = schedulingService.updateScheduledVersion(scheduled.item.id, campA, v2Artifact.id);
  check('C explicit update to V2 allowed', !('error' in explicitUpdate));

  // --- Test D ---
  const persisted = schedulingService.getById(scheduled.item.id, campA);
  check('D schedule persisted', persisted !== null);
  check('D timezone persisted', persisted?.timezone === 'Pacific/Auckland');

  // --- Test E ---
  resetMockPublishingState();
  approveCreative(campA, 'launch-carousel-01');
  const igDest = seedConnectionAndDestination(wsA, 'INSTAGRAM');
  const dueSchedule = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() - 60000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest,
    mediaAssets: [{ id: 'asset_1', type: 'IMAGE', mimeType: 'image/jpeg' }],
  });
  if ('error' in dueSchedule) {
    check('E due schedule created', false, dueSchedule.error);
  } else {
    const exec = await publishingSchedulerService.executeDueScheduledItems(new Date());
    check('E due job processed', exec.processed >= 1);
    check('E provider called once', mockPublishCallLog.length === 1);
    const published = schedulingService.getById(dueSchedule.item.id, campA);
    check('E status published', published?.status === 'PUBLISHED');
    check('E publishedAt set', Boolean(published?.publishedAt));
    check('E external id persisted', Boolean(published?.externalPublishId));
  }

  // --- Test F ---
  resetMockPublishingState();
  const beforeCalls = mockPublishCallLog.length;
  await publishingSchedulerService.executeDueScheduledItems(new Date());
  check('F duplicate execution prevented', mockPublishCallLog.length === beforeCalls);

  // --- Test G ---
  resetMockPublishingState();
  mockPublishShouldFail = true;
  const failDest = seedConnectionAndDestination(wsA, 'EMAIL');
  approveCreative(campA, 'launch-newsletter-01');
  let failSchedule = schedulingService.create(campA, wsA, {
    contentKey: 'launch-newsletter-01',
    scheduledFor: new Date(Date.now() - 60000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: failDest,
  });
  if (!('error' in failSchedule)) {
    const failExec = await publishingService.publishSchedule(failSchedule.item.id, campA, { manualPublish: true });
    check('G publish failed', 'error' in failExec || failExec.item.status === 'FAILED');
    const failedItem = schedulingService.getById(failSchedule.item.id, campA);
    check('G not marked published', failedItem?.status !== 'PUBLISHED');
    check('G attempt persisted', publishingService.getAttempts(failSchedule.item.id, campA).length >= 1);
    check('G creative untouched', creativeGeneratorService.getCurrent(campA, 'launch-newsletter-01') !== null);
  }
  mockPublishShouldFail = false;

  // --- Test H ---
  resetMockPublishingState();
  if (!('error' in failSchedule)) {
    const retry = await publishingService.retry(failSchedule.item.id, campA);
    check('H retry succeeds', !('error' in retry) && retry.item.status === 'PUBLISHED');
    const attempts = publishingService.getAttempts(failSchedule.item.id, campA);
    check('H attempt 1 failed retained', attempts.some((a) => a.attemptNumber === 1 && a.status === 'FAILED'));
    check('H attempt 2 succeeded', attempts.some((a) => a.attemptNumber === 2 && a.status === 'SUCCEEDED'));
  }

  // --- Test I ---
  resetMockPublishingState();
  approveCreative(campA, 'launch-carousel-01');
  const destA = seedConnectionAndDestination(wsA, 'INSTAGRAM');
  const destB = seedConnectionAndDestination(wsA, 'INSTAGRAM');
  const schedA = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() - 120000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: destA,
    mediaAssets: [{ id: 'img_a', type: 'IMAGE', mimeType: 'image/jpeg' }],
  });
  const schedB = schedulingService.create(campA, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() - 120000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: destB,
    mediaAssets: [{ id: 'vid_b', type: 'VIDEO', mimeType: 'video/mp4' }],
  });
  approveCreative(campA, 'launch-newsletter-01');
  const schedC = schedulingService.create(campA, wsA, {
    contentKey: 'launch-newsletter-01',
    scheduledFor: new Date(Date.now() - 120000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: seedConnectionAndDestination(wsA, 'EMAIL'),
  });
  if (!('error' in schedA) && !('error' in schedB) && !('error' in schedC)) {
    await publishingService.publishSchedule(schedA.item.id, campA, { manualPublish: true });
    mockPublishShouldFail = true;
    await publishingService.publishSchedule(schedB.item.id, campA, { manualPublish: true });
    mockPublishShouldFail = false;
    await publishingService.publishSchedule(schedC.item.id, campA, { manualPublish: true });
    check('I A published', schedulingService.getById(schedA.item.id, campA)?.status === 'PUBLISHED');
    check('I B failed', schedulingService.getById(schedB.item.id, campA)?.status === 'FAILED');
    check('I C published', schedulingService.getById(schedC.item.id, campA)?.status === 'PUBLISHED');
  }

  // --- Test J ---
  approveCreative(campA, 'launch-carousel-01');
  const future = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  if (!('error' in future)) {
    schedulingService.cancel(future.item.id, campA);
    resetMockPublishingState();
    await publishingSchedulerService.executeDueScheduledItems(new Date(Date.now() + 90000000));
    check('J cancelled item not published', schedulingService.getById(future.item.id, campA)?.status === 'CANCELLED');
    check('J provider not called for cancelled', mockPublishCallLog.length === 0);
  }

  // --- Test K ---
  approveCreative(campA, 'launch-reel-01');
  const manual = schedulingService.create(campA, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() - 60000).toISOString(),
    publicationMode: 'MANUAL',
  });
  if (!('error' in manual)) {
    resetMockPublishingState();
    await publishingSchedulerService.executeDueScheduledItems(new Date());
    check('K manual due item provider not called', mockPublishCallLog.length === 0);
    const marked = publishingService.markPublished(manual.item.id, campA, { externalUrl: 'https://manual.example/post' });
    check('K mark published succeeds', !('error' in marked));
    check('K publishedAt persisted', Boolean(marked.item.publishedAt));
  }

  // --- Test L ---
  approveCreative(campA, 'launch-newsletter-01');
  const exportSched = schedulingService.create(campA, wsA, {
    contentKey: 'launch-newsletter-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'EXPORT',
  });
  if (!('error' in exportSched)) {
    const bundle = schedulingService.buildExportBundle(exportSched.item.id, campA);
    check('L export bundle created', !('error' in bundle));
    if (!('error' in bundle)) {
      check('L bundle has campaign', Boolean(bundle.campaign.id));
      check('L bundle has channel', Boolean(bundle.deliverable.channel));
      check('L bundle has contentKey', bundle.deliverable.contentKey === 'launch-newsletter-01');
      check('L bundle has approved version', bundle.approvedCreativeVersion >= 1);
      check('L bundle has copy', Boolean(bundle.copy));
    }
  }

  // --- Test M ---
  approveCreative(campA, 'launch-reel-01');
  const blocked = schedulingService.create(campA, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: seedConnectionAndDestination(wsA, 'INSTAGRAM'),
    mediaAssets: [],
  });
  check('M direct video without asset blocked', !('error' in blocked) && blocked.item.status === 'BLOCKED');
  const manualStill = schedulingService.create(campA, wsA, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() + 7200000).toISOString(),
    publicationMode: 'MANUAL',
  });
  check('M manual still allowed', !('error' in manualStill));

  // --- Test N ---
  const emailDest = seedConnectionAndDestination(wsA, 'EMAIL');
  approveCreative(campA, 'launch-carousel-01');
  const badDest = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: emailDest,
  });
  check('N incompatible destination rejected', 'error' in badDest);
  const goodDest = seedConnectionAndDestination(wsA, 'INSTAGRAM');
  const good = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: goodDest,
    mediaAssets: [{ id: 'img1', type: 'IMAGE', mimeType: 'image/jpeg' }],
  });
  check('N compatible destination accepted', !('error' in good));

  // --- Test O ---
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns/:campaignId/schedule', campaignScheduleRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/publishing/destinations', publishingDestinationsRouter);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  async function hit(method: string, path: string, workspaceId: string, body?: unknown) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.status;
  }
  const scheduleId = !('error' in scheduled) ? scheduled.item.id : '';
  check('O read schedule rejected', (await hit('GET', `/api/campaigns/${campA}/schedule/${scheduleId}?workspaceId=${wsB}`, wsB)) === 403);
  check('O create schedule rejected', (await hit('POST', `/api/campaigns/${campA}/schedule`, wsB, {
    workspaceId: wsB, contentKey: 'launch-reel-01', scheduledFor: new Date().toISOString(), publicationMode: 'MANUAL',
  })) === 403);
  check('O cancel rejected', (await hit('POST', `/api/campaigns/${campA}/schedule/${scheduleId}/cancel`, wsB, { workspaceId: wsB })) === 403);
  check('O publish rejected', (await hit('POST', `/api/campaigns/${campA}/schedule/${scheduleId}/publish`, wsB, { workspaceId: wsB })) === 403);
  const wsADest = seedConnectionAndDestination(wsA, 'INSTAGRAM');
  const crossDest = schedulingService.create(campB, wsB, {
    contentKey: 'launch-reel-01',
    scheduledFor: new Date(Date.now() + 3600000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: wsADest,
  });
  check('O cross-workspace destination rejected', 'error' in crossDest);
  server.close();

  // --- Test P ---
  approveCreative(campA, 'launch-carousel-01');
  const badProviderDest = `dest_bad_${randomUUID()}`;
  const connId = `conn_${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO integration_connections (id, workspace_id, provider_key, status, display_name, capabilities, created_at, updated_at)
    VALUES (?, ?, 'nonexistent', 'CONNECTED', 'Missing Provider', '[]', ?, ?)
  `).run(connId, wsA, now, now);
  db.prepare(`
    INSERT INTO publishing_destinations (id, workspace_id, connection_id, provider_key, channel, external_destination_id, display_name, status, created_at)
    VALUES (?, ?, ?, 'nonexistent', 'INSTAGRAM', 'ext_bad', 'Bad Destination', 'ACTIVE', ?)
  `).run(badProviderDest, wsA, connId, now);
  const badProviderSchedule = schedulingService.create(campA, wsA, {
    contentKey: 'launch-carousel-01',
    scheduledFor: new Date(Date.now() + 10800000).toISOString(),
    publicationMode: 'DIRECT',
    destinationId: badProviderDest,
    mediaAssets: [{ id: 'img_bad', type: 'IMAGE', mimeType: 'image/jpeg' }],
  });
  const noProvider = !('error' in badProviderSchedule)
    ? await publishingService.publishSchedule(badProviderSchedule.item.id, campA, { manualPublish: true })
    : { error: 'failed', code: 'NOT_FOUND' };
  check('P provider unavailable', 'error' in noProvider && noProvider.code === 'PROVIDER_UNAVAILABLE');

  // --- Test Q ---
  if (!('error' in good)) {
    const pre = schedulingService.preflight(good.item.id, campA, { manualPublish: true });
    check('Q valid direct preflight', !('error' in pre) && pre.ready === true);
  }
  if (!('error' in manualStill)) {
    const manualPre = schedulingService.preflight(manualStill.item.id, campA, { manualPublish: true });
    check('Q manual preflight ready', !('error' in manualPre) && manualPre.ready === true);
  }

  // --- Test R ---
  const summary = schedulingService.getSummary(campA);
  check('R summary generated', !('error' in summary));
  if (!('error' in summary)) {
    check('R has approved creative count', summary.totalApprovedCreative >= 1);
    check('R scheduled count', summary.scheduled >= 1);
  }

  console.log(`\nPhase 3E verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
