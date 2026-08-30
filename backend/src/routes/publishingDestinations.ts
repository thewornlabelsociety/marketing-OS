import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { integrationConnectionService } from '../services/integrations/IntegrationConnectionService';

export const publishingDestinationsRouter = Router();

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  return query.workspaceId;
}

publishingDestinationsRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
  res.json(integrationConnectionService.listDestinations(workspaceId, channel));
});
