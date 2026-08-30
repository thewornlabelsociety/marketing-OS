import { Router, type Request, type Response } from 'express';
import { campaignLibraryService } from '../services/library/CampaignLibraryService';
import type { CampaignLibraryClassification } from '../types/library';

// GET /api/archive/campaigns  — canonical route alias for the library listing
// Full library CRUD is at /api/library/*
export const archiveRouter = Router();

archiveRouter.get('/campaigns', (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  if (!q.workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }

  const entries = campaignLibraryService.list(q.workspaceId, {
    classification: q.classification as CampaignLibraryClassification | undefined,
    search: q.search,
    includeArchived: q.includeArchived === 'true',
    sort: (q.sort as 'newest' | 'oldest' | 'best') ?? 'newest',
  });

  res.json(entries);
});
