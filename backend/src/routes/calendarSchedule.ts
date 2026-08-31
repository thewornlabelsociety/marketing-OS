import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { schedulingService } from '../services/publishing/SchedulingService';
import { DEFAULT_SCHEDULE_TIMEZONE } from '../services/publishing/publishingUtils';

export const calendarScheduleRouter = Router();
export const calendarConfigRouter = Router();

calendarConfigRouter.get('/', (_req: Request, res: Response) => {
  res.json({ timezone: DEFAULT_SCHEDULE_TIMEZONE });
});

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

// Approved, unscheduled creative artifacts ready to be scheduled
export const calendarReadyRouter = Router();

interface ReadyRow {
  artifact_id: string;
  campaign_id: string;
  content_key: string;
  channel: string;
  content_type: string;
  format: string;
  version: number;
  campaign_name: string;
}

calendarReadyRouter.get('/', (req: Request, res: Response) => {
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

  const rows = db.prepare(`
    SELECT
      ca.id          AS artifact_id,
      ca.campaign_id,
      ca.content_key,
      ca.channel,
      ca.content_type,
      ca.format,
      ca.version,
      c.name         AS campaign_name
    FROM creative_artifacts ca
    INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
    INNER JOIN campaigns c ON c.id = ca.campaign_id
    WHERE ca.workspace_id = ?
      AND ca.is_current = 1
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_content_items sci
        WHERE sci.campaign_id = ca.campaign_id
          AND sci.content_key = ca.content_key
          AND sci.status NOT IN ('CANCELLED', 'FAILED')
      )
      AND NOT EXISTS (
        -- Exclude if a FAILED schedule has an UNKNOWN publish attempt (reconciliation required).
        -- This is authoritative: checks publish_attempts.status, not text heuristics.
        SELECT 1 FROM scheduled_content_items sci2
        WHERE sci2.campaign_id = ca.campaign_id
          AND sci2.content_key = ca.content_key
          AND sci2.status = 'FAILED'
          AND EXISTS (
            SELECT 1 FROM publish_attempts pa
            WHERE pa.schedule_id = sci2.id AND pa.status = 'UNKNOWN'
          )
      )
    ORDER BY c.name, ca.channel, ca.content_key
    LIMIT 50
  `).all(workspaceId) as ReadyRow[];

  res.json(rows.map(r => ({
    artifactId: r.artifact_id,
    campaignId: r.campaign_id,
    contentKey: r.content_key,
    channel: r.channel,
    contentType: r.content_type,
    format: r.format,
    version: r.version,
    campaignName: r.campaign_name,
  })));
});
