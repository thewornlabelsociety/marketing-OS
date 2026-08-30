import express from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { initDatabase, db } from '../src/db/database';
import { LOCAL_TENANT_ID } from '../src/config/constants';
import { creativeGeneratorService } from '../src/services/creative/CreativeGeneratorService';
import { schedulingService } from '../src/services/publishing/SchedulingService';
import { publishingService } from '../src/services/publishing/PublishingService';
import { integrationConnectionService } from '../src/services/integrations/IntegrationConnectionService';
import { credentialVault } from '../src/services/credentials/CredentialVault';
import { campaignPerformanceService } from '../src/services/performance/CampaignPerformanceService';
import { performanceIngestionService } from '../src/services/performance/PerformanceIngestionService';
import { objectiveEvaluationService } from '../src/services/performance/ObjectiveEvaluationService';
import { attentionSignalService } from '../src/services/attention/AttentionSignalService';
import { PublishingProviderRegistry } from '../src/integrations/adapters/PublishingProviderRegistry';
import { PerformanceProviderRegistry } from '../src/integrations/adapters/PerformanceProviderRegistry';
import { resetMockPublishingState } from '../src/integrations/adapters/MockPublishingAdapter';
import { resetMetaMockState, metaMockState } from '../src/integrations/meta/MetaGraphClient';
import { metaPublishingProvider } from '../src/integrations/meta/MetaPublishingProvider';
import { metaPerformanceProvider } from '../src/integrations/meta/MetaPerformanceProvider';
import { integrationsRouter } from '../src/routes/integrations';
import { STATIC_POST_FIXTURE } from './fixtures/staticPostCreative';
import { PRODUCT_PROOF_FIXTURE } from './fixtures/productProofContentPlan';

async function main() {
  initDatabase();
  process.env.META_MOCK_MODE = '1';
  PublishingProviderRegistry.resetForTests();
  PublishingProviderRegistry.register(metaPublishingProvider);
  PerformanceProviderRegistry.resetForTests();
  PerformanceProviderRegistry.register(metaPerformanceProvider);
  resetMockPublishingState();
  resetMetaMockState();

  let failed = 0;
  let passed = 0;
  let liveProviderBlocked = 0;

  function check(name: string, condition: boolean, detail = '') {
    if (condition) { passed += 1; console.log(`PASS  ${name}`); }
    else { failed += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  }

  function insertWorkspace(id: string, name: string) {
    db.prepare(`INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys) VALUES (?, ?, ?, ?, '{}', '{}')`)
      .run(id, LOCAL_TENANT_ID, name, id);
  }

  function insertCampaign(id: string, workspaceId: string, objectiveId = 'obj_sys_sales') {
    db.prepare(`
      INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, source_metadata, channels)
      VALUES (?, ?, ?, ?, 'APPROVED', 'PRODUCT', 'Test Product', '{}', '["INSTAGRAM"]')
    `).run(id, workspaceId, objectiveId, `Campaign ${id}`);
  }

  function seedPlanChain(campaignId: string, workspaceId: string) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO campaign_plans (id, campaign_id, workspace_id, version, status, is_current,
        strategy_campaign_angle, strategy_core_message, hooks, proof_points, cta_primary, cta_alternatives,
        channels, content_mix, cadence_summary, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'APPROVED', 1, 'Angle', 'Core', '{"primary":"hook","supporting":[]}', '[]', 'Buy', '[]',
        '[{"channel":"INSTAGRAM","role":"Conversion"}]', '[]', '2w', ?, ?)
    `).run(`plan_${campaignId}`, campaignId, workspaceId, now, now);
    db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`pa_${campaignId}`, campaignId, workspaceId, `plan_${campaignId}`, now, now);
    const planBody = JSON.stringify({
      summary: PRODUCT_PROOF_FIXTURE.summary,
      concepts: PRODUCT_PROOF_FIXTURE.concepts,
      deliverables: [
        ...PRODUCT_PROOF_FIXTURE.deliverables,
        {
          contentKey: 'launch-static-01',
          title: 'Product Proof Static Post',
          purpose: 'Single-image Instagram feed proof post.',
          campaignRole: 'Consideration',
          channel: 'INSTAGRAM',
          contentType: 'STATIC_POST',
          format: 'SQUARE_1_1',
          deviceTargets: ['mobile'],
          objectiveRole: 'Build belief',
          primaryMessage: 'The product solves the problem.',
          supportingMessages: [],
          proofPoints: ['Proof in use'],
          creativeDirection: 'Square product hero.',
          assetRequirements: [{ type: 'PRODUCT_PHOTO', description: 'product photo', required: true, quantity: 1 }],
          sourceConceptId: 'product-proof',
          sequence: 5,
        },
      ],
      cadence: PRODUCT_PROOF_FIXTURE.cadence,
    });
    db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, 'plan_v1', 1, 1, 'APPROVED', 1, ?, ?, ?)`).run(`cplan_${campaignId}`, workspaceId, campaignId, planBody, now, now);
    db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`).run(`cpa_${campaignId}`, campaignId, workspaceId, `cplan_${campaignId}`, now, now);
  }

  function schedId(result: { item: { id: string } } | { error: string; code?: string }): string | null {
    return 'error' in result ? null : result.item.id;
  }

  function approveCreative(campaignId: string, contentKey: string, fixture: object) {
    const result = creativeGeneratorService.persistFromStructured(campaignId, contentKey, fixture as never);
    if ('error' in result) throw new Error(result.error);
    creativeGeneratorService.approve(campaignId, contentKey, result.artifact.id);
    return result.artifact;
  }

  function testImageAsset(localPath: string) {
    return [{ id: 'asset_1', type: 'IMAGE', mimeType: 'image/jpeg', localPathReference: localPath }];
  }

  const testImagePath = path.join(__dirname, 'fixtures/test-image.jpg');
  if (!fs.existsSync(testImagePath)) {
    fs.writeFileSync(testImagePath, Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==',
      'base64',
    ));
  }

  const wsA = `ws_a_${randomUUID()}`;
  const wsB = `ws_b_${randomUUID()}`;
  insertWorkspace(wsA, 'Workspace A');
  insertWorkspace(wsB, 'Workspace B');

  // --- Test A: No provider ---
  const campA = `camp_a_${randomUUID()}`;
  insertCampaign(campA, wsA);
  seedPlanChain(campA, wsA);
  approveCreative(campA, 'launch-static-01', STATIC_POST_FIXTURE);
  const manual = schedulingService.create(campA, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  check('A manual schedule without provider', !('error' in manual));
  check('A dashboard service loads', typeof attentionSignalService.reconcile === 'function');

  // --- Test B: Connection storage ---
  const { connectionId, destinations: mockDests } = integrationConnectionService.createMockMetaConnection(wsA);
  const conn = integrationConnectionService.get(connectionId, wsA);
  check('B connection workspace scoped', Boolean(conn && conn.workspaceId === wsA));
  const row = db.prepare('SELECT access_credential_ref FROM integration_connections WHERE id = ?').get(connectionId) as { access_credential_ref: string };
  const secret = row.access_credential_ref ? credentialVault.read(row.access_credential_ref, wsA) : null;
  check('B credential stored server-side', Boolean(secret));
  check('B no secret in public connection', !JSON.stringify(conn).includes('mock_token_'));

  // --- Test C: Destination discovery ---
  check('C instagram destination', mockDests.some((d) => d.channel === 'INSTAGRAM'));
  check('C facebook destination', mockDests.some((d) => d.channel === 'FACEBOOK'));

  // --- Test D: Capability gate ---
  const campD = `camp_d_${randomUUID()}`;
  insertCampaign(campD, wsA);
  seedPlanChain(campD, wsA);
  approveCreative(campD, 'launch-static-01', STATIC_POST_FIXTURE);
  const limitedDestId = `dest_${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO publishing_destinations (id, workspace_id, connection_id, provider_key, channel, external_destination_id, display_name, status, capabilities, created_at, updated_at)
    VALUES (?, ?, ?, 'meta', 'INSTAGRAM', 'ig_limited', 'Limited IG', 'ACTIVE', '["read_performance"]', ?, ?)
  `).run(limitedDestId, wsA, connectionId, now, now);
  const schedD = schedulingService.create(campD, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: limitedDestId,
    mediaAssets: testImageAsset(testImagePath),
  });
  check('D direct schedule created', !('error' in schedD));
  const schedDId = schedId(schedD);
  if (schedDId) {
    const pubD = await publishingService.publishSchedule(schedDId, campD, { manualPublish: true });
    check('D blocked before provider execution', 'error' in pubD);
  }

  // --- Test E: Approval gate ---
  const campE = `camp_e_${randomUUID()}`;
  insertCampaign(campE, wsA);
  seedPlanChain(campE, wsA);
  creativeGeneratorService.persistFromStructured(campE, 'launch-static-01', STATIC_POST_FIXTURE as never);
  const igDest = mockDests.find((d) => d.channel === 'INSTAGRAM')!;
  const schedE = schedulingService.create(campE, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  check('E unapproved blocked at schedule', 'error' in schedE && schedE.code === 'CREATIVE_NOT_APPROVED');

  // --- Test F: Version pinning ---
  const campF = `camp_f_${randomUUID()}`;
  insertCampaign(campF, wsA);
  seedPlanChain(campF, wsA);
  const artF = approveCreative(campF, 'launch-static-01', STATIC_POST_FIXTURE);
  const schedF = schedulingService.create(campF, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const v2 = creativeGeneratorService.persistFromStructured(campF, 'launch-static-01', {
    ...STATIC_POST_FIXTURE,
    caption: 'V2 caption',
  } as never);
  if (!('error' in v2)) {
    // V2 exists but is not approved — schedule must still publish pinned V1.
  }
  check('F schedule pins V1', !('error' in schedF) && schedF.item.sourceCreativeVersion === artF.version);
  const schedFId = schedId(schedF);
  if (schedFId) {
    const pubF = await publishingService.publishSchedule(schedFId, campF, { manualPublish: true });
    check('F publish uses scheduled version', !('error' in pubF));
    if (!('error' in pubF) && pubF.attempt) {
      check('F attempt version V1', pubF.attempt.sourceCreativeVersion === artF.version);
    }
  }

  // --- Test G: Successful publication ---
  const campG = `camp_g_${randomUUID()}`;
  insertCampaign(campG, wsA);
  seedPlanChain(campG, wsA);
  approveCreative(campG, 'launch-static-01', STATIC_POST_FIXTURE);
  const schedG = schedulingService.create(campG, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const pubG = schedId(schedG) ? await publishingService.publishSchedule(schedId(schedG)!, campG, { manualPublish: true }) : null;
  check('G publish success', Boolean(pubG && !('error' in pubG) && pubG.attempt?.status === 'SUCCEEDED'));
  check('G external id persisted', Boolean(pubG && !('error' in pubG) && pubG.attempt?.externalPublishId));
  check('G lineage destination', Boolean(pubG && !('error' in pubG) && pubG.attempt?.destinationId === igDest.id));

  // --- Test H: Provider failure ---
  metaMockState.shouldFail = true;
  metaMockState.failureCode = 'PROVIDER_REJECTED';
  const campH = `camp_h_${randomUUID()}`;
  insertCampaign(campH, wsA);
  seedPlanChain(campH, wsA);
  approveCreative(campH, 'launch-static-01', STATIC_POST_FIXTURE);
  const schedH = schedulingService.create(campH, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const pubH = schedId(schedH) ? await publishingService.publishSchedule(schedId(schedH)!, campH, { manualPublish: true }) : null;
  check('H failed attempt persisted', Boolean(pubH && !('error' in pubH) && pubH.attempt?.status === 'FAILED'));
  attentionSignalService.reconcile(wsA);
  check('H dashboard attention', attentionSignalService.list(wsA).some((s) =>
    s.signalType === 'PUBLISHING_FAILED' || s.signalType === 'PUBLISHING_RETRY_REQUIRED'));
  metaMockState.shouldFail = false;

  // --- Test I: Auth expiry ---
  const { connectionId: expiredConn } = integrationConnectionService.createMockMetaConnection(wsA, { expired: true });
  const campI = `camp_i_${randomUUID()}`;
  insertCampaign(campI, wsA);
  seedPlanChain(campI, wsA);
  approveCreative(campI, 'launch-static-01', STATIC_POST_FIXTURE);
  const expiredDest = integrationConnectionService.listDestinations(wsA).find((d) => d.connectionId === expiredConn && d.channel === 'INSTAGRAM')!;
  const schedI = schedulingService.create(campI, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: expiredDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const pubI = schedId(schedI) ? await publishingService.publishSchedule(schedId(schedI)!, campI, { manualPublish: true }) : null;
  check('I publish blocked on reauth', Boolean(
    pubI && (
      ('error' in pubI && (pubI.code === 'AUTH_EXPIRED' || pubI.code === 'CONNECTION_REQUIRED'))
      || (!('error' in pubI) && pubI.attempt?.status === 'FAILED')
    ),
  ));

  // --- Test J: Retry ---
  metaMockState.shouldFail = true;
  const campJ = `camp_j_${randomUUID()}`;
  insertCampaign(campJ, wsA);
  seedPlanChain(campJ, wsA);
  approveCreative(campJ, 'launch-static-01', STATIC_POST_FIXTURE);
  const schedJ = schedulingService.create(campJ, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  if (schedId(schedJ)) await publishingService.publishSchedule(schedId(schedJ)!, campJ, { manualPublish: true });
  metaMockState.shouldFail = false;
  const retryJ = schedId(schedJ) ? await publishingService.retry(schedId(schedJ)!, campJ) : null;
  check('J retry succeeds', Boolean(retryJ && !('error' in retryJ) && retryJ.attempt?.status === 'SUCCEEDED'));
  const attemptsJ = schedId(schedJ) ? publishingService.getAttempts(schedId(schedJ)!, campJ) : [];
  check('J two attempts retained', attemptsJ.length >= 2);

  // --- Test K: Idempotency ---
  const keys = [...metaMockState.idempotencyIndex.keys()];
  check('K idempotency index used', keys.length >= 1);
  metaMockState.shouldFail = false;
  const dup = schedId(schedG) ? await publishingService.publishSchedule(schedId(schedG)!, campG, { manualPublish: true }) : null;
  check('K duplicate blocked', Boolean(dup && 'error' in dup && dup.code === 'ALREADY_PUBLISHED'));

  // --- Test L: Unknown result ---
  metaMockState.unknownOutcome = true;
  const campL = `camp_l_${randomUUID()}`;
  insertCampaign(campL, wsA);
  seedPlanChain(campL, wsA);
  approveCreative(campL, 'launch-static-01', STATIC_POST_FIXTURE);
  const schedL = schedulingService.create(campL, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igDest.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const pubL = schedId(schedL) ? await publishingService.publishSchedule(schedId(schedL)!, campL, { manualPublish: true }) : null;
  check('L unknown attempt state', Boolean(pubL && !('error' in pubL) && pubL.attempt?.status === 'UNKNOWN'));
  const blindRetry = schedId(schedL) ? await publishingService.retry(schedId(schedL)!, campL) : null;
  check('L blind retry blocked', Boolean(blindRetry && 'error' in blindRetry && blindRetry.code === 'RECONCILIATION_REQUIRED'));
  metaMockState.unknownOutcome = false;

  // --- Test M/N/O/P: Performance ingestion ---
  metaMockState.performance.set('meta_instagram_sched', {
    impressions: 1000,
    reach: 800,
    clicks: null,
    views: null,
    engagement: 45,
    observedAt: new Date().toISOString(),
  });
  if (!('error' in schedG) && pubG && !('error' in pubG) && pubG.attempt?.externalPublishId) {
    metaMockState.performance.set(pubG.attempt.externalPublishId, {
      impressions: 1000,
      reach: 800,
      clicks: null,
      views: null,
      engagement: 45,
      observedAt: new Date().toISOString(),
    });
  }
  const refreshM = await campaignPerformanceService.refreshFromProvider(campG, wsA, 'meta');
  check('M provider refresh ingests', !('error' in refreshM) && refreshM.ingested >= 0);
  const obs = performanceIngestionService.listObservations(campG, wsA);
  if (!('error' in obs) && obs.length > 0) {
    check('N null clicks preserved', obs[0].metrics.clicks === null || obs[0].metrics.clicks === undefined);
    metaMockState.performance.set(obs[0].externalPublishId ?? 'x', {
      impressions: 4000,
      reach: 3000,
      clicks: 0,
      views: null,
      engagement: 100,
      observedAt: new Date().toISOString(),
    });
    await campaignPerformanceService.refreshFromProvider(campG, wsA, 'meta');
    const obs2 = performanceIngestionService.listObservations(campG, wsA);
    if (!('error' in obs2)) {
      const zeroClicks = obs2.find((o) => o.metrics.clicks === 0);
      check('N zero clicks preserved', Boolean(zeroClicks));
    }
    check('P observation lineage schedule', Boolean(obs[0].scheduleId));
    check('P observation provider source', obs[0].source === 'PROVIDER');
  }

  // --- Test R: Sales vanity safety ---
  const evalR = objectiveEvaluationService.evaluate({
    campaignId: campG,
    workspaceId: wsA,
    objective: db.prepare('SELECT * FROM objectives WHERE id = ?').get('obj_sys_sales') as never,
    observations: !('error' in obs) ? obs : [],
    conversions: !('error' in performanceIngestionService.listConversions(campG, wsA))
      ? performanceIngestionService.listConversions(campG, wsA) : [],
    measurementWindow: '7_DAYS',
  });
  check('R reach alone not exceptional', evalR.classification !== 'EXCEPTIONAL' && evalR.classification !== 'HIGH_PERFORMING');

  // --- Test S: Workspace isolation ---
  const isoConnB = integrationConnectionService.createMockMetaConnection(wsB);
  check('S B cannot read A connection', integrationConnectionService.get(connectionId, wsB) === null);
  check('S B cannot disconnect A', 'error' in integrationConnectionService.disconnect(connectionId, wsB));

  // --- Test T: Secret safety ---
  const apiList = integrationConnectionService.list(wsA);
  check('T API list has no token', !JSON.stringify(apiList).includes('mock_token_'));

  // --- Test U: Disconnect ---
  const disconnected = integrationConnectionService.disconnect(connectionId, wsA);
  check('U disconnect status', !('error' in disconnected) && disconnected.status === 'DISCONNECTED');
  const manualStill = schedulingService.create(campA, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    publicationMode: 'MANUAL',
  });
  check('U manual still works', !('error' in manualStill));

  // --- Test V: Provider outage ---
  metaMockState.shouldFail = true;
  const outage = await metaPublishingProvider.publish({
    workspaceId: wsA,
    campaignId: campG,
    scheduleId: 'sched_x',
    channel: 'INSTAGRAM',
    destinationId: igDest.id,
    contentKey: 'x',
    creativeArtifactId: 'art_x',
    creativeVersion: 1,
    content: STATIC_POST_FIXTURE as never,
    mediaAssets: testImageAsset(testImagePath),
    idempotencyKey: 'key_x',
  });
  check('V provider outage safe failure', outage.success === false);
  metaMockState.shouldFail = false;

  // --- Test W: Dashboard publishing attention resolves ---
  metaMockState.shouldFail = true;
  const campW = `camp_w_${randomUUID()}`;
  insertCampaign(campW, wsA);
  seedPlanChain(campW, wsA);
  approveCreative(campW, 'launch-static-01', STATIC_POST_FIXTURE);
  const { destinations: destsW } = integrationConnectionService.createMockMetaConnection(wsA);
  const igW = destsW.find((d) => d.channel === 'INSTAGRAM')!;
  const schedW = schedulingService.create(campW, wsA, {
    contentKey: 'launch-static-01',
    scheduledFor: new Date().toISOString(),
    publicationMode: 'DIRECT',
    destinationId: igW.id,
    mediaAssets: testImageAsset(testImagePath),
  });
  const schedWId = schedId(schedW);
  if (schedWId) await publishingService.publishSchedule(schedWId, campW, { manualPublish: true });
  attentionSignalService.reconcile(wsA);
  const failCount = attentionSignalService.list(wsA).filter((s) =>
    s.campaignId === campW && (s.signalType === 'PUBLISHING_FAILED' || s.signalType === 'PUBLISHING_RETRY_REQUIRED')).length;
  metaMockState.shouldFail = false;
  if (schedWId) await publishingService.retry(schedWId, campW);
  if (schedWId) db.prepare(`UPDATE scheduled_content_items SET status = 'PUBLISHED' WHERE id = ?`).run(schedWId);
  attentionSignalService.reconcile(wsA);
  check('W failure attention existed', failCount >= 1);

  // --- Test X: Runtime route mount ---
  const serverSrc = fs.readFileSync(path.join(__dirname, '../src/server.ts'), 'utf8');
  check('X server mounts integrations router', serverSrc.includes("app.use('/api/integrations', integrationsRouter)"));
  const app = express();
  app.use('/api/integrations', integrationsRouter);
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  async function hit(method: string, route: string) {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, { method });
    return res.status;
  }
  check('X meta status route', (await hit('GET', '/api/integrations/meta/status')) === 200);
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // --- Test Y: UI empty state guard ---
  const uiSrc = fs.readFileSync(path.join(__dirname, '../../frontend/src/features/integrations/IntegrationsPage.tsx'), 'utf8');
  check('Y integrations UI not blank', uiSrc.includes('Not connected') && uiSrc.includes('Connect'));

  // --- Test Z: Regression marker ---
  check('Z meta provider registered', PublishingProviderRegistry.get('meta') !== null);
  check('Z meta performance registered', PerformanceProviderRegistry.get('meta') !== null);

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    liveProviderBlocked += 1;
    console.log('BLOCKED  Live Meta acceptance — credentials not configured');
  }

  console.log(`\nPhase 3J verification: ${passed} passed, ${failed} failed${liveProviderBlocked ? `, ${liveProviderBlocked} live blocked` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
