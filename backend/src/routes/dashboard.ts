import { Router, Request, Response } from 'express';
import { dashboardService } from '../services/dashboard/DashboardService';
import { attentionSignalService } from '../services/attention/AttentionSignalService';

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_DISMISSIBLE') return 422;
  return 400;
}

export const dashboardRouter = Router();

dashboardRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  res.json(dashboardService.getDashboard(workspaceId));
});

export const attentionRouter = Router();

attentionRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const status = (req.query.status as 'OPEN' | 'ALL') ?? 'OPEN';
  attentionSignalService.reconcile(workspaceId);
  res.json(attentionSignalService.list(workspaceId, status));
});

attentionRouter.post('/reconcile', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  res.json(attentionSignalService.reconcile(workspaceId));
});

attentionRouter.post('/:signalId/dismiss', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = attentionSignalService.dismiss(req.params.signalId, workspaceId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json(result);
    return;
  }
  res.json(result);
});
