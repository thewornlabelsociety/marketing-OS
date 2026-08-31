import { Router } from 'express';
import { requireLocalOperatorSession } from '../middleware/localOperatorSession';
import { businessIntegrationService } from '../services/business/BusinessIntegrationService';
import { sourceRecordService } from '../services/business/SourceRecordService';

export const businessSourcesRouter = Router();
businessSourcesRouter.use(requireLocalOperatorSession);

businessSourcesRouter.get('/integrations', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  res.json(businessIntegrationService.list(workspaceId));
});

businessSourcesRouter.get('/products', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  res.json(sourceRecordService.list(workspaceId, String(req.query.filter ?? 'all')));
});

businessSourcesRouter.get('/products/:id/usage', (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? '');
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  const usage = sourceRecordService.usage(req.params.id, workspaceId);
  if (!usage) return res.status(404).json({ error: 'Product not found' });
  res.json(usage);
});
