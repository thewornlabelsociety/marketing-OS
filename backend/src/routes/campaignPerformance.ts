import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { AttributionService } from '../services/performance/AttributionService';
import { campaignPerformanceService } from '../services/performance/CampaignPerformanceService';
import { objectiveEvaluationService } from '../services/performance/ObjectiveEvaluationService';
import { performanceIngestionService } from '../services/performance/PerformanceIngestionService';
import type { MeasurementWindow } from '../types/performance';

type PerfReq = Request<{ campaignId: string; contentKey?: string }>;

interface CampaignRecord { id: string; workspace_id: string }

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): CampaignRecord | null {
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return null;
  }
  const campaign = db.prepare('SELECT id, workspace_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignRecord | undefined;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return null;
  }
  return campaign;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_METRICS') return 422;
  if (code === 'PERFORMANCE_PROVIDER_UNAVAILABLE') return 503;
  return 400;
}

export const campaignPerformanceRouter = Router({ mergeParams: true });

campaignPerformanceRouter.get('/', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const window = (req.query.measurementWindow as MeasurementWindow | undefined) ?? '7_DAYS';
  const summary = campaignPerformanceService.getSummary(campaignId, resolveWorkspaceId(req)!, window);
  if ('error' in summary) {
    res.status(statusFor(summary.code)).json({ error: summary.error, code: summary.code });
    return;
  }
  res.json(summary);
});

campaignPerformanceRouter.get('/content/:contentKey', (req: PerfReq, res: Response) => {
  const { campaignId, contentKey } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const observations = performanceIngestionService.listObservations(campaignId, workspaceId!);
  if ('error' in observations) {
    res.status(statusFor(observations.code)).json(observations);
    return;
  }
  const conversions = performanceIngestionService.listConversions(campaignId, workspaceId!);
  if ('error' in conversions) {
    res.status(statusFor(conversions.code)).json(conversions);
    return;
  }

  const filtered = observations.filter((o) => o.contentKey === contentKey);
  const contentConversions = conversions.filter((c) => c.contentKey === contentKey);
  res.json({ contentKey, observations: filtered, conversions: contentConversions });
});

campaignPerformanceRouter.get('/channels', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const summary = campaignPerformanceService.getSummary(campaignId, workspaceId!);
  if ('error' in summary) {
    res.status(statusFor(summary.code)).json({ error: summary.error, code: summary.code });
    return;
  }
  res.json(summary.channelPerformance);
});

campaignPerformanceRouter.post('/observations', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const body = req.body as Record<string, unknown>;
  const result = performanceIngestionService.createObservation({
    workspaceId: workspaceId!,
    campaignId,
    scheduleId: body.scheduleId as string | undefined,
    contentKey: body.contentKey as string,
    sourceCreativeArtifactId: body.sourceCreativeArtifactId as string,
    sourceCreativeVersion: body.sourceCreativeVersion as number,
    channel: body.channel as import('../types/channels').MarketingChannel,
    providerKey: body.providerKey as string | undefined,
    destinationId: body.destinationId as string | undefined,
    externalPublishId: body.externalPublishId as string | undefined,
    observedAt: body.observedAt as string | undefined,
    measurementWindow: (body.measurementWindow as MeasurementWindow) ?? '7_DAYS',
    metrics: (body.metrics ?? {}) as Record<string, unknown>,
    source: (body.source as 'MANUAL' | 'PROVIDER' | 'IMPORT') ?? 'MANUAL',
    rawMetadata: body.rawMetadata as Record<string, unknown> | undefined,
  });

  if (result.error) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.observation);
});

campaignPerformanceRouter.post('/refresh', async (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const body = req.body as { providerKey?: string };
  const result = await campaignPerformanceService.refreshFromProvider(
    campaignId,
    workspaceId!,
    body.providerKey
  );

  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

campaignPerformanceRouter.post('/evaluate', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const body = req.body as { measurementWindow?: MeasurementWindow };
  const result = campaignPerformanceService.evaluate(
    campaignId,
    workspaceId!,
    body.measurementWindow ?? '7_DAYS'
  );

  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

campaignPerformanceRouter.get('/evaluations', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  res.json(objectiveEvaluationService.listEvaluations(campaignId));
});

campaignPerformanceRouter.post('/conversions', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const body = req.body as Record<string, unknown>;
  const attributionModel = (body.attributionModel ?? body.model ?? 'MANUAL') as import('../types/performance').AttributionResult['model'];

  const result = performanceIngestionService.createConversion({
    workspaceId: workspaceId!,
    campaignId,
    contentKey: body.contentKey as string | undefined,
    scheduleId: body.scheduleId as string | undefined,
    conversionType: body.conversionType as import('../types/performance').ConversionType,
    value: body.value as number | undefined,
    currency: body.currency as string | undefined,
    externalConversionId: body.externalConversionId as string | undefined,
    occurredAt: body.occurredAt as string | undefined,
    attribution: AttributionService.buildAttribution({
      model: attributionModel,
      campaignId,
      contentKey: body.contentKey as string | undefined,
      scheduleId: body.scheduleId as string | undefined,
      evidence: body.evidence as string[] | undefined,
    }),
    source: (body.source as 'MANUAL' | 'PROVIDER' | 'IMPORT' | 'TRACKING') ?? 'MANUAL',
    metadata: body.metadata as Record<string, unknown> | undefined,
  });

  if (result.error) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.conversion);
});

campaignPerformanceRouter.get('/conversions', (req: PerfReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = performanceIngestionService.listConversions(campaignId, workspaceId!);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});
