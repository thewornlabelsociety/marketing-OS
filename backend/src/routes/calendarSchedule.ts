import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { schedulingService } from '../services/publishing/SchedulingService';

export const calendarScheduleRouter = Router();

calendarScheduleRouter.get('/', (req: Request, res: Response) => {
  const workspaceId = (req.query as { workspaceId?: string }).workspaceId;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(schedulingService.listForWorkspace(workspaceId));
});
