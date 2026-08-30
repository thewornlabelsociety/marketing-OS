import { Router, Request, Response } from 'express';
import type { MeasurementWindow } from '../types/performance';
import { experimentService } from '../services/experiments/ExperimentService';

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'QUALITY_GATE_FAILED' || code === 'CREATIVE_NOT_APPROVED' || code === 'VALIDATION_FAILED') return 422;
  if (code === 'INVALID_STATE') return 409;
  return 400;
}

export const campaignExperimentsRouter = Router({ mergeParams: true });

campaignExperimentsRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.list(req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.create(req.params.campaignId, workspaceId, req.body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.status(201).json(result);
});

campaignExperimentsRouter.get('/:experimentId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.get(req.params.experimentId, req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.patch('/:experimentId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.update(req.params.experimentId, req.params.campaignId, workspaceId, req.body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/variants', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.addVariant(req.params.experimentId, req.params.campaignId, workspaceId, req.body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/validate', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.validate(req.params.experimentId, req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/start', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.start(req.params.experimentId, req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/pause', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.pause(req.params.experimentId, req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/cancel', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { reason?: string };
  const result = experimentService.cancel(req.params.experimentId, req.params.campaignId, workspaceId, body.reason);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/analyze', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { measurementWindow?: MeasurementWindow };
  const result = experimentService.analyze(
    req.params.experimentId,
    req.params.campaignId,
    workspaceId,
    body.measurementWindow ?? '7_DAYS',
  );
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.get('/:experimentId/analyses', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = experimentService.listAnalyses(req.params.experimentId, req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

campaignExperimentsRouter.post('/:experimentId/complete', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { measurementWindow?: MeasurementWindow };
  const result = experimentService.complete(
    req.params.experimentId,
    req.params.campaignId,
    workspaceId,
    body.measurementWindow ?? '7_DAYS',
  );
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});
