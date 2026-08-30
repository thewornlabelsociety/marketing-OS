import { Router, Request, Response } from 'express';
import { blueprintService } from '../services/library/BlueprintService';

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND' || code === 'OBJECTIVE_NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'BLUEPRINT_VALIDATION_FAILED' || code === 'INSUFFICIENT_EVIDENCE') return 422;
  if (code === 'BLUEPRINT_NOT_ACTIVE') return 409;
  return 400;
}

export const blueprintsRouter = Router();

blueprintsRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const status = req.query.status as import('../types/blueprint').BlueprintStatus | undefined;
  res.json(blueprintService.list(workspaceId, status));
});

blueprintsRouter.get('/suggest', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const q = req.query as Record<string, string | undefined>;
  res.json(blueprintService.suggest(workspaceId, {
    objectiveType: q.objectiveType,
    sourceType: q.sourceType,
    channels: q.channels ? q.channels.split(',') : undefined,
  }));
});

blueprintsRouter.get('/:blueprintId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const version = req.query.version ? Number(req.query.version) : undefined;
  const result = blueprintService.get(req.params.blueprintId, workspaceId, version);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

blueprintsRouter.post('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { sourceCampaignId: string; name?: string };
  const result = blueprintService.createFromCampaign(body.sourceCampaignId, workspaceId, body.name);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.status(201).json(result);
});

blueprintsRouter.patch('/:blueprintId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as Record<string, unknown>;
  const result = blueprintService.update(req.params.blueprintId, workspaceId, {
    name: body.name as string | undefined,
    description: body.description as string | undefined,
    strategicPattern: body.strategicPattern as Record<string, unknown> | undefined,
    contentPattern: body.contentPattern as unknown[] | undefined,
    channelPattern: body.channelPattern as string[] | undefined,
    cadencePattern: body.cadencePattern as string | undefined,
  });
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

blueprintsRouter.post('/:blueprintId/activate', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = blueprintService.activate(req.params.blueprintId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

blueprintsRouter.post('/:blueprintId/archive', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = blueprintService.archive(req.params.blueprintId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

blueprintsRouter.post('/:blueprintId/use', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as {
    sourceType: string;
    sourceTitle: string;
    sourceDescription?: string;
    objectiveId?: string;
    name?: string;
  };
  if (!body.sourceType || !body.sourceTitle) {
    res.status(400).json({ error: 'sourceType and sourceTitle are required' });
    return;
  }
  const result = blueprintService.use(req.params.blueprintId, workspaceId, body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.status(201).json(result);
});

blueprintsRouter.get('/:blueprintId/usages', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = blueprintService.getUsages(req.params.blueprintId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});
