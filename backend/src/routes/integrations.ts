import { Router, Request, Response } from 'express';
import { integrationConnectionService } from '../services/integrations/IntegrationConnectionService';
import { isMetaMockMode } from '../integrations/meta/MetaGraphClient';

export const integrationsRouter = Router();

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

integrationsRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  res.json(integrationConnectionService.list(workspaceId));
});

integrationsRouter.get('/meta/status', (req: Request, res: Response) => {
  res.json({
    providerKey: 'meta',
    mockMode: isMetaMockMode(),
    configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    apiVersion: process.env.META_GRAPH_API_VERSION ?? 'v21.0',
  });
});

integrationsRouter.post('/meta/connect', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = integrationConnectionService.getMetaConnectUrl(workspaceId);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

integrationsRouter.get('/meta/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const mock = req.query.mock as string | undefined;

  if (!state) {
    res.status(400).send('Missing OAuth state');
    return;
  }

  const authCode = code ?? (mock === '1' ? `mock_code_${state.slice(0, 8)}` : undefined);
  if (!authCode) {
    res.status(400).send('Missing authorization code');
    return;
  }

  try {
    const result = await integrationConnectionService.completeMetaCallback(authCode, state);
    if ('error' in result) {
      res.status(400).send(result.error);
      return;
    }
    res.redirect('/?integrations=meta&status=connected');
  } catch (err) {
    console.error('Meta OAuth callback failed', (err as Error).message);
    res.status(500).send('Connection failed. You can close this window and retry from Integrations.');
  }
});

integrationsRouter.post('/:connectionId/verify', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = integrationConnectionService.verify(req.params.connectionId, workspaceId);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

integrationsRouter.get('/:connectionId/destinations', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const connection = integrationConnectionService.get(req.params.connectionId, workspaceId);
  if (!connection) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }
  const destinations = integrationConnectionService.syncDestinations(req.params.connectionId, workspaceId);
  res.json(destinations);
});

integrationsRouter.post('/:connectionId/disconnect', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const result = integrationConnectionService.disconnect(req.params.connectionId, workspaceId);
  if ('error' in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});
