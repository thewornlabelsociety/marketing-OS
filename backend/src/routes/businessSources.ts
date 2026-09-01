import { Router } from 'express';
import { requireLocalOperatorSession } from '../middleware/localOperatorSession';
import { businessIntegrationService } from '../services/business/BusinessIntegrationService';
import { sourceRecordService } from '../services/business/SourceRecordService';
import { operatorStudioService, type StudioFormat } from '../services/business/OperatorStudioService';

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

businessSourcesRouter.post('/studio', async (req, res) => {
  const { workspaceId, sourceProductIds, format } = req.body as {
    workspaceId?: string;
    sourceProductIds?: string[];
    format?: string;
  };
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required', code: 'BAD_REQUEST' });
  if (!sourceProductIds?.length) return res.status(400).json({ error: 'At least one product must be selected', code: 'BAD_REQUEST' });
  if (!format) return res.status(400).json({ error: 'format is required', code: 'BAD_REQUEST' });

  const result = await operatorStudioService.setup({ workspaceId, sourceProductIds, format: format as StudioFormat });
  if ('error' in result) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
});
