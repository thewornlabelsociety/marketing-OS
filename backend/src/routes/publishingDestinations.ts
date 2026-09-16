import { Router, Request, Response } from 'express';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { integrationConnectionService } from '../services/integrations/IntegrationConnectionService';

export const publishingDestinationsRouter = Router();

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  return query.workspaceId;
}

publishingDestinationsRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const repos = getCoreRepositories();
  const exists = await repos.workspace.exists(workspaceId);
  if (!exists) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
  const capability = channel === 'FACEBOOK' ? 'publish_facebook_page_photo' : channel === 'INSTAGRAM' ? 'publish_image_feed' : undefined;
  res.json(integrationConnectionService.listDestinations(workspaceId, channel, { requiredCapability: capability }));
});
