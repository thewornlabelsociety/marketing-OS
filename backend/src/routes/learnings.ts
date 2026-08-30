import { Router, Request, Response } from 'express';
import { learningService } from '../services/performance/LearningService';

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  return 400;
}

export const learningsRouter = Router();

learningsRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const status = req.query.status as import('../types/performance').LearningStatus | undefined;
  res.json(learningService.list(workspaceId, status));
});

learningsRouter.get('/:id', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const learning = learningService.get(req.params.id, workspaceId);
  if (!learning) {
    res.status(404).json({ error: 'Learning not found' });
    return;
  }
  res.json(learning);
});

learningsRouter.post('/:id/activate', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = learningService.activate(req.params.id, workspaceId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

learningsRouter.post('/:id/dismiss', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = learningService.dismiss(req.params.id, workspaceId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});
