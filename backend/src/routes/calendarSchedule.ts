import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { schedulingService } from '../services/publishing/SchedulingService';
import { DEFAULT_SCHEDULE_TIMEZONE } from '../services/publishing/publishingUtils';

export const calendarScheduleRouter = Router();
export const calendarConfigRouter = Router();

calendarConfigRouter.get('/', (_req: Request, res: Response) => {
  res.json({ timezone: DEFAULT_SCHEDULE_TIMEZONE });
});

calendarScheduleRouter.get('/', async (req: Request, res: Response) => {
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
  res.json(await schedulingService.listForWorkspace(workspaceId));
});

// Approved, unscheduled creative artifacts ready to be scheduled.
// Creative data (creative_artifacts + creative_approvals) comes via repos (PG-5B scope).
// Scheduling exclusion (scheduled_content_items + publish_attempts) stays SQLite-direct (out of scope).
export const calendarReadyRouter = Router();

calendarReadyRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = (req.query as { workspaceId?: string }).workspaceId;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }

  const repos = getCoreRepositories();
  const workspaceExists = await repos.workspace.exists(workspaceId);
  if (!workspaceExists) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  // Creative + approval data via repos (PG-5B scope)
  const approvedRows = await repos.creative.artifact.listApprovedCurrentForWorkspace(workspaceId);

  // Scheduling exclusion — stays SQLite-direct (out of PG-5B scope)
  const filtered = approvedRows.filter((row) => {
    const hasActiveSchedule = db.prepare(`
      SELECT 1 FROM scheduled_content_items
      WHERE campaign_id = ? AND content_key = ?
        AND status NOT IN ('CANCELLED', 'FAILED')
    `).get(row.campaignId, row.contentKey);
    if (hasActiveSchedule) return false;

    const hasUnknownFailed = db.prepare(`
      SELECT 1 FROM scheduled_content_items sci
      WHERE sci.campaign_id = ? AND sci.content_key = ? AND sci.status = 'FAILED'
        AND EXISTS (
          SELECT 1 FROM publish_attempts pa
          WHERE pa.schedule_id = sci.id AND pa.status = 'UNKNOWN'
        )
    `).get(row.campaignId, row.contentKey);
    return !hasUnknownFailed;
  });

  res.json(filtered.map((r) => ({
    artifactId: r.artifactId,
    campaignId: r.campaignId,
    contentKey: r.contentKey,
    channel: r.channel,
    contentType: r.contentType,
    format: r.format,
    version: r.version,
    campaignName: r.campaignName,
  })));
});
