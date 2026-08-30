import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { blueprintService } from '../services/library/BlueprintService';
import { campaignLibraryService } from '../services/library/CampaignLibraryService';
import type { CampaignLibraryClassification } from '../types/library';

function resolveWorkspaceId(req: Request): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function statusFor(code?: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'BLUEPRINT_VALIDATION_FAILED' || code === 'INSUFFICIENT_EVIDENCE') return 422;
  if (code === 'BLUEPRINT_NOT_ACTIVE') return 409;
  return 400;
}

export const libraryRouter = Router();

libraryRouter.get('/summary', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  res.json(campaignLibraryService.getSummary(workspaceId));
});

libraryRouter.get('/campaigns', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const q = req.query as Record<string, string | undefined>;
  res.json(campaignLibraryService.list(workspaceId, {
    classification: q.classification as CampaignLibraryClassification | undefined,
    search: q.search,
    includeArchived: q.includeArchived === 'true' || q.filter === 'ARCHIVED',
    sort: (q.sort as 'newest' | 'oldest' | 'best') ?? 'newest',
  }));
});

libraryRouter.get('/campaigns/:campaignId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = campaignLibraryService.get(req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.patch('/campaigns/:campaignId', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { notes?: string };
  const record = campaignLibraryService.ensureRecord(req.params.campaignId, workspaceId);
  if (body.notes !== undefined) {
    const now = new Date().toISOString();
    db.prepare('UPDATE campaign_library_records SET notes = ?, updated_at = ? WHERE id = ?').run(body.notes, now, record.id);
  }
  const updated = campaignLibraryService.get(req.params.campaignId, workspaceId);
  if ('error' in updated) { res.status(statusFor(updated.code)).json(updated); return; }
  res.json(updated);
});

libraryRouter.post('/campaigns/:campaignId/archive', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = campaignLibraryService.archive(req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.post('/campaigns/:campaignId/restore', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const result = campaignLibraryService.restore(req.params.campaignId, workspaceId);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.post('/campaigns/:campaignId/evergreen', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { notes?: string };
  const result = campaignLibraryService.markEvergreen(req.params.campaignId, workspaceId, body.notes);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.post('/campaigns/:campaignId/seasonal', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { season?: string; recurringWindow?: string; notes?: string };
  const result = campaignLibraryService.markSeasonal(req.params.campaignId, workspaceId, body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.post('/campaigns/:campaignId/cancel-metadata', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { reasonType: string; notes?: string };
  const result = campaignLibraryService.setCancellationMetadata(req.params.campaignId, workspaceId, body);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.json(result);
});

libraryRouter.post('/campaigns/:campaignId/blueprint', (req: Request, res: Response) => {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
  const body = req.body as { name?: string };
  const result = blueprintService.createFromCampaign(req.params.campaignId, workspaceId, body.name);
  if ('error' in result) { res.status(statusFor(result.code)).json(result); return; }
  res.status(201).json(result);
});
