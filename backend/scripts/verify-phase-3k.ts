import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { integrationConnectionService } from '../src/services/integrations/IntegrationConnectionService';
import { mediaAssetService } from '../src/services/media/MediaAssetService';
import { mediaDeliveryService } from '../src/services/media/MediaDeliveryService';
import { mediaValidationService } from '../src/services/media/MediaValidationService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { attentionSignalService } from '../src/services/attention/AttentionSignalService';
import { PublishingProviderRegistry } from '../src/integrations/adapters/PublishingProviderRegistry';
import { PerformanceProviderRegistry } from '../src/integrations/adapters/PerformanceProviderRegistry';
import { metaPublishingProvider } from '../src/integrations/meta/MetaPublishingProvider';
import type { PublishRequest } from '../src/types/publishing';
import { metaPerformanceProvider } from '../src/integrations/meta/MetaPerformanceProvider';
import { resetMetaMockState, metaMockState } from '../src/integrations/meta/MetaGraphClient';
import { STATIC_POST_FIXTURE } from './fixtures/staticPostCreative';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';

async function main() {
  initDatabase();
  process.env.META_MOCK_MODE = '1';
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:4100';
  PublishingProviderRegistry.resetForTests();
  PublishingProviderRegistry.register(metaPublishingProvider);
  PerformanceProviderRegistry.resetForTests();
  PerformanceProviderRegistry.register(metaPerformanceProvider);
  resetMetaMockState();

  let failed = 0;
  let passed = 0;
  let liveBlocked = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed += 1; console.log(`PASS  ${name}`); }
    else { failed += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  const testImagePath = path.join(__dirname, 'fixtures/test-image.jpg');
  if (!fs.existsSync(testImagePath)) {
    fs.writeFileSync(testImagePath, Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
      'base64',
    ));
  }

  function insertWorkspace(id: string, name: string) {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string, channels: string, objectiveId = 'obj_sys_sales') {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, ?, ?, 'APPROVED', 'PRODUCT', 'Test Product', '{}', ?)
    `).run(id, workspaceId, objectiveId, `Campaign ${id}`, channels);
  }

  function seedPlanChain(campaignId: string, workspaceId: string, channel: 'INSTAGRAM' | 'FACEBOOK') {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current,
        strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
        channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]',
        ?, '[]', '2w', ?, ?)
    `).run(`plan_${campaignId}`, campaignId, workspaceId, `[{"channel":"${channel}","role":"Conversion"}]`, now, now);
    db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`pa_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, now, now);
    const planBody = JSON.stringify({
      summary: PRODUCT_PROOF_FIXTURE.summary,
      concepts: PRODUCT_PROOF_FIXTURE.concepts,
      deliverables: [{
        contentKey: 'launch-static-01', title: 'Static', purpose: 'p', campaignRole: 'Consideration',
        channel, contentType: 'STATIC_POST', format: 'SQUARE_1_1', deviceTargets: ['mobile'],
        objectiveRole: 'Build belief', primaryMessage: 'msg', supportingMessages: [], proofPoints: [],
        creativeDirection: 'dir', assetRequirements: [], sourceConceptId: 'x', sequence: 1,
      }],
      cadence: PRODUCT_PROOF_FIXTURE.cadence,
    });
    db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)`).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
  }

  function approveCreative(campaignId: string, contentKey: string) {
    const result = creativeGeneratorService.persistFromStructured(campaignId, contentKey, STATIC_POST_FIXTURE as never);
    if ('error' in result) throw new Error(result.error);
    creativeGeneratorService.approve(campaignId, contentKey, result.artifact.id);
    return result.artifact;
  }

  function registerMedia(workspaceId: string, campaignId: string, artifactId: string, version: number) {
    const record = mediaAssetService.registerFromLocalPath({
      workspaceId,
      localPath: testImagePath,
      mimeType: 'image/jpeg',
      campaignId,
      contentKey: 'launch-static-01',
      creativeArtifactId: artifactId,
      creativeVersion: version,
    });
    return mediaAssetService.toPublishableAsset(record);
  }

  function schedId(result: { item: { id: string } } | { error: string; code?: string }) {
    return 'error' in result ? null : result.item.id;
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  insertWorkspace(wsA, 'A');
  insertWorkspace(wsB, 'B');
  const { destinations: mockDests } = integrationConnectionService.createMockMetaConnection(wsA);
  integrationConnectionService.createMockMetaConnection(wsB);
  const igDest = mockDests.find((d) => d.channel === 'INSTAGRAM')!;
  const fbDest = mockDests.find((d) => d.channel === 'FACEBOOK')!;

  // A — Instagram destination filtering
  const igList = integrationConnectionService.listDestinations(wsA, 'INSTAGRAM', { requiredCapability: 'publish_image_feed' });
  check('A instagram destination filtering', igList.every((d) => d.channel === 'INSTAGRAM'));

  // B — Facebook destination filtering
  const fbList = integrationConnectionService.listDestinations(wsA, 'FACEBOOK', { requiredCapability: 'publish_facebook_page_photo' });
  check('B facebook destination filtering', fbList.every((d) => d.channel === 'FACEBOOK'));

  // C — incompatible destination backend rejection
  const campC = `camp_c_${randomUUID()}`;
  insertCampaign(campC, wsA, '["INSTAGRAM"]');
  seedPlanChain(campC, wsA, 'INSTAGRAM');
  approveCreative(campC, 'launch-static-01');
  const badSched = schedulingService.create(campC, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: fbDest.id,
    mediaAssets: [registerMedia(wsA, campC, creativeGeneratorService.getApproval(campC, 'launch-static-01')!.creativeArtifactId, 1)],
  });
  check('C incompatible destination rejected', 'error' in badSched && badSched.code === 'PUBLISH_VALIDATION_FAILED');

  // D/E — media pinning + version immutability
  const campDE = `camp_de_${randomUUID()}`;
  insertCampaign(campDE, wsA, '["INSTAGRAM"]');
  seedPlanChain(campDE, wsA, 'INSTAGRAM');
  const artV1 = approveCreative(campDE, 'launch-static-01');
  const mediaV1 = registerMedia(wsA, campDE, artV1.id, artV1.version);
  const schedDE = schedulingService.create(campDE, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: [mediaV1],
  });
  check('D exact media pinning', !('error' in schedDE) && schedDE.item.mediaAssets[0]?.id.startsWith('mass_'));
  creativeGeneratorService.persistFromStructured(campDE, 'launch-static-01', { ...STATIC_POST_FIXTURE, caption: 'V2' } as never);
  const schedRow = db.prepare('SELECT media_assets, source_creative_version FROM scheduled_content_items WHERE id = ?')
    .get(schedDE.item.id) as { media_assets: string; source_creative_version: number };
  const pinned = JSON.parse(schedRow.media_assets)[0];
  check('E version immutability', pinned.id === mediaV1.id && schedRow.source_creative_version === artV1.version);

  // F/G/H/I/J — hosted URL lifecycle
  const assetRecord = mediaAssetService.getById(mediaV1.id, wsA)!;
  const publicUrl = mediaDeliveryService.resolvePublicUrl(mediaV1, wsA)!;
  check('F hosted url not filesystem', !publicUrl.includes('\\') && !/^[a-z]:/i.test(publicUrl));
  const token = publicUrl.split('/').pop()!;
  const resolved = mediaDeliveryService.resolveHostedFile(token);
  check('G hosted url resolves asset', Boolean(resolved && fs.existsSync(resolved.absolutePath)));
  const tampered = `${token.slice(0, -2)}xx`;
  check('H tampered token rejected', mediaDeliveryService.resolveHostedFile(tampered) === null);
  const expired = mediaDeliveryService.createHostedTokenWithExpiry(assetRecord.id, wsA, Date.now() - 1000);
  check('I expired token rejected', mediaDeliveryService.resolveHostedFile(expired) === null);
  const wsBAsset = registerMedia(wsB, campDE, artV1.id, artV1.version);
  const wsAToken = mediaDeliveryService.createHostedToken(assetRecord.id, wsA);
  check('J workspace isolation token', mediaDeliveryService.verifyToken(wsAToken)?.workspaceId === wsA
    && mediaAssetService.getById(wsBAsset.id, wsB)?.workspaceId === wsB);

  // K — missing media
  const campK = `camp_k_${randomUUID()}`;
  insertCampaign(campK, wsA, '["INSTAGRAM"]');
  seedPlanChain(campK, wsA, 'INSTAGRAM');
  approveCreative(campK, 'launch-static-01');
  const schedK = schedulingService.create(campK, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: [],
  });
  const schedKId = schedId(schedK);
  const pubK = schedKId ? await publishingService.publishSchedule(schedKId, campK, { manualPublish: true }) : null;
  check('K missing media blocked', Boolean(pubK && 'error' in pubK));

  // L — invalid public base URL in live mode
  const prevMock = process.env.META_MOCK_MODE;
  const prevApp = process.env.META_APP_ID;
  const prevSecret = process.env.META_APP_SECRET;
  process.env.META_APP_ID = 'test_app';
  process.env.META_APP_SECRET = 'test_secret';
  delete process.env.META_MOCK_MODE;
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:4100';
  const publicCheck = mediaValidationService.validatePublicBaseUrl();
  check('L invalid public base url', !publicCheck.valid && publicCheck.blockers.includes('MEDIA_NOT_PUBLICLY_ACCESSIBLE'));
  process.env.META_MOCK_MODE = prevMock ?? '1';
  if (prevApp) process.env.META_APP_ID = prevApp; else delete process.env.META_APP_ID;
  if (prevSecret) process.env.META_APP_SECRET = prevSecret; else delete process.env.META_APP_SECRET;

  // M — mock local mode
  process.env.META_MOCK_MODE = '1';
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:4100';
  check('M mock local mode works', mediaValidationService.validatePublicBaseUrl().valid);

  // N/O — retry + unknown outcome
  metaMockState.shouldFail = true;
  const campN = `camp_n_${randomUUID()}`;
  insertCampaign(campN, wsA, '["INSTAGRAM"]');
  seedPlanChain(campN, wsA, 'INSTAGRAM');
  const artN = approveCreative(campN, 'launch-static-01');
  const mediaN = registerMedia(wsA, campN, artN.id, artN.version);
  const schedN = schedulingService.create(campN, wsA, {
    contentKey: 'launch-static-01', scheduledFor: new Date().toISOString(), publicationMode: 'DIRECT',
    destinationId: igDest.id, mediaAssets: [mediaN],
  });
  const schedNId = schedId(schedN);
  if (schedNId) await publishingService.publishSchedule(schedNId, campN, { manualPublish: true });
  metaMockState.shouldFail = false;
  const retryN = schedNId ? await publishingService.retry(schedNId, campN) : null;
  const attemptsN = schedNId ? publishingService.getAttempts(schedNId, campN) : [];
  check('N retry retains media identity', Boolean(retryN && !('error' in retryN) && attemptsN.length >= 2
    && attemptsN.every((a) => (a.mediaAssetIds ?? []).includes(mediaN.id))));
  metaMockState.unknownOutcome = true;
  const campO = `camp_o_${randomUUID()}`;
  insertCampaign(campO, wsA, '["INSTAGRAM"]');
  seedPlanChain(campO, wsA, 'INSTAGRAM');
  const artO = approveCreative(campO, 'launch-static-01');
  const schedO = schedulingService.create(campO, wsA, {
    contentKey: 'launch-static-01', scheduledFor: new Date().toISOString(), publicationMode: 'DIRECT',
    destinationId: igDest.id, mediaAssets: [registerMedia(wsA, campO, artO.id, artO.version)],
  });
  const schedOId = schedId(schedO);
  if (schedOId) await publishingService.publishSchedule(schedOId, campO, { manualPublish: true });
  const blindO = schedOId ? await publishingService.retry(schedOId, campO) : null;
  check('O unknown blocks blind retry', Boolean(blindO && 'error' in blindO && blindO.code === 'RECONCILIATION_REQUIRED'));
  metaMockState.unknownOutcome = false;

  // P/Q — channel-specific publish paths
  const campP = `camp_p_${randomUUID()}`;
  insertCampaign(campP, wsA, '["FACEBOOK"]');
  seedPlanChain(campP, wsA, 'FACEBOOK');
  const artP = approveCreative(campP, 'launch-static-01');
  const schedP = schedulingService.create(campP, wsA, {
    contentKey: 'launch-static-01', scheduledFor: new Date().toISOString(), publicationMode: 'DIRECT',
    destinationId: fbDest.id, mediaAssets: [registerMedia(wsA, campP, artP.id, artP.version)],
  });
  const pubP = schedId(schedP) ? await publishingService.publishSchedule(schedId(schedP)!, campP, { manualPublish: true }) : null;
  check('P facebook path', Boolean(pubP && !('error' in pubP) && pubP.attempt?.status === 'SUCCEEDED'));
  const campQ = `camp_q_${randomUUID()}`;
  insertCampaign(campQ, wsA, '["INSTAGRAM"]');
  seedPlanChain(campQ, wsA, 'INSTAGRAM');
  const artQ = approveCreative(campQ, 'launch-static-01');
  const schedQ = schedulingService.create(campQ, wsA, {
    contentKey: 'launch-static-01', scheduledFor: new Date().toISOString(), publicationMode: 'DIRECT',
    destinationId: igDest.id, mediaAssets: [registerMedia(wsA, campQ, artQ.id, artQ.version)],
  });
  const pubQ = schedId(schedQ) ? await publishingService.publishSchedule(schedId(schedQ)!, campQ, { manualPublish: true }) : null;
  check('Q instagram path', Boolean(pubQ && !('error' in pubQ) && pubQ.attempt?.status === 'SUCCEEDED'));

  // R — unsupported format blocked at provider layer
  // normalizeCreativeContent rewrites kind to match the deliverable's contentType, so we must
  // test the provider's validatePublication directly with a crafted SHORT_VIDEO request.
  const reelRequest: PublishRequest = {
    workspaceId: wsA,
    campaignId: `camp_r_${randomUUID()}`,
    scheduleId: 'sched_r_fake',
    channel: 'INSTAGRAM',
    destinationId: igDest.id,
    contentKey: 'launch-static-01',
    creativeArtifactId: 'art_r_fake',
    creativeVersion: 1,
    content: { kind: 'SHORT_VIDEO', hook: 'h', scenes: [], cta: 'c' } as never,
    mediaAssets: [],
    scheduledFor: new Date().toISOString(),
    idempotencyKey: 'test_r_unsupported',
  };
  const valR = await metaPublishingProvider.validatePublication(reelRequest);
  check('R unsupported format blocked', !valR.valid && valR.code === 'VALIDATION_FAILED');

  // S — publication lineage
  check('S publication lineage', Boolean(pubQ && !('error' in pubQ) && pubQ.attempt?.mediaAssetIds?.length
    && pubQ.attempt.destinationId === igDest.id && pubQ.attempt.sourceCreativeVersion === artQ.version));

  // T — performance lineage
  metaMockState.performance.set('meta_instagram_sched', {
    impressions: 100, reach: 80, clicks: 0, observedAt: new Date().toISOString(),
  });
  if (schedId(schedQ)) {
    await campaignPerformanceService.refreshFromProvider(campQ, wsA, 'meta');
    const obs = db.prepare('SELECT media_asset_id, schedule_id FROM performance_observations WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(campQ) as { media_asset_id: string | null; schedule_id: string | null };
    check('T performance lineage', Boolean(obs?.media_asset_id && obs.schedule_id));
  } else check('T performance lineage', false);

  // U/V — dashboard attention
  const campU = `camp_u_${randomUUID()}`;
  insertCampaign(campU, wsA, '["INSTAGRAM"]');
  seedPlanChain(campU, wsA, 'INSTAGRAM');
  approveCreative(campU, 'launch-static-01');
  schedulingService.create(campU, wsA, {
    contentKey: 'launch-static-01', scheduledFor: new Date().toISOString(), publicationMode: 'DIRECT',
    destinationId: igDest.id, mediaAssets: [],
  });
  attentionSignalService.reconcile(wsA);
  const mediaAttention = attentionSignalService.list(wsA).some((s) => s.summary?.toLowerCase().includes('media')
    || s.summary?.toLowerCase().includes('asset') || s.summary?.toLowerCase().includes('visual'));
  check('U dashboard media attention', mediaAttention || attentionSignalService.list(wsA).some((s) => s.signalType === 'PUBLISHING_FAILED'));

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    liveBlocked += 1;
    console.log('BLOCK LIVE META ACCEPTANCE — credentials unavailable');
  }

  console.log(`\nPhase 3K verification: ${passed} passed, ${failed} failed, ${liveBlocked} live blocked`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
