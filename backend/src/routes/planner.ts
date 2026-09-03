import { Router, type Request, type Response } from 'express';
import { db } from '../db/database';
import { organicPlannerService } from '../services/intelligence/OrganicPlannerService';
import { LOCAL_TENANT_ID } from '../config/constants';

const router = Router();

// GET /api/planner?workspaceId=...&channel=instagram&days=30
router.get('/', (req: Request, res: Response) => {
  const { workspaceId, channel, days } = req.query as Record<string, string | undefined>;

  const wsId = workspaceId ?? LOCAL_TENANT_ID;
  if (!wsId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }

  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(wsId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const channelKey = (channel ?? 'instagram').toLowerCase();
  const lookBackDays = Math.max(7, Math.min(90, parseInt(days ?? '30', 10) || 30));

  try {
    const plan = organicPlannerService.getPlan(wsId, channelKey, lookBackDays);
    res.json(plan);
  } catch (err) {
    console.error('[planner] getPlan error:', err);
    res.status(500).json({ error: 'Failed to compute organic plan' });
  }
});

export { router as plannerRouter };
