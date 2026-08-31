import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { publishingService } from '../services/publishing/PublishingService';
import { schedulingService } from '../services/publishing/SchedulingService';

type ScheduleReq = Request<{ campaignId: string; scheduleId?: string }>;

interface CampaignRecord { id: string; workspace_id: string }

function resolveWorkspaceId(req: ScheduleReq): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): CampaignRecord | null {
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return null;
  }
  const campaign = db.prepare('SELECT id, workspace_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignRecord | undefined;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return null;
  }
  return campaign;
}

function statusFor(code?: string): number {
  if (code === 'CREATIVE_NOT_APPROVED' || code === 'APPROVED_VERSION_MISMATCH') return 409;
  if (code === 'ALREADY_PUBLISHED' || code === 'SCHEDULE_CANCELLED') return 409;
  if (code === 'ASSET_MISSING' || code === 'PUBLISH_VALIDATION_FAILED') return 422;
  if (code === 'CONNECTION_REQUIRED' || code === 'PROVIDER_UNAVAILABLE') return 503;
  if (code === 'DESTINATION_REQUIRED') return 422;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

export const campaignScheduleRouter = Router({ mergeParams: true });

campaignScheduleRouter.get('/', (req: ScheduleReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  res.json(schedulingService.list(campaignId));
});

campaignScheduleRouter.get('/summary', (req: ScheduleReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const summary = schedulingService.getSummary(campaignId);
  if ('error' in summary) {
    res.status(statusFor(summary.code)).json({ error: summary.error, code: summary.code });
    return;
  }
  res.json(summary);
});

campaignScheduleRouter.post('/', (req: ScheduleReq, res: Response) => {
  const { campaignId } = req.params;
  const workspaceId = resolveWorkspaceId(req);
  const campaign = resolveCampaign(campaignId, workspaceId, res);
  if (!campaign) return;

  const body = req.body as {
    contentKey?: string;
    scheduledFor?: string;
    timezone?: string;
    publicationMode?: 'DIRECT' | 'EXPORT' | 'MANUAL';
    destinationId?: string;
    notes?: string;
    mediaAssets?: unknown[];
  };

  if (!body.contentKey || !body.scheduledFor || !body.publicationMode) {
    res.status(400).json({ error: 'contentKey, scheduledFor, and publicationMode are required' });
    return;
  }

  const result = schedulingService.create(campaignId, campaign.workspace_id, {
    contentKey: body.contentKey,
    scheduledFor: body.scheduledFor,
    timezone: body.timezone,
    publicationMode: body.publicationMode,
    destinationId: body.destinationId,
    notes: body.notes,
    mediaAssets: (body.mediaAssets ?? []) as import('../types/scheduledContent').PublishableAsset[],
  });

  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.item);
});

campaignScheduleRouter.get('/:scheduleId', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const item = schedulingService.getById(scheduleId!, campaignId);
  if (!item) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  res.json(item);
});

campaignScheduleRouter.patch('/:scheduleId', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const body = req.body as {
    scheduledFor?: string;
    timezone?: string;
    destinationId?: string | null;
    notes?: string;
    mediaAssets?: unknown[];
    creativeArtifactId?: string;
  };

  if (body.creativeArtifactId) {
    const versionUpdate = schedulingService.updateScheduledVersion(scheduleId!, campaignId, body.creativeArtifactId);
    if ('error' in versionUpdate) {
      res.status(statusFor(versionUpdate.code)).json({ error: versionUpdate.error, code: versionUpdate.code });
      return;
    }
  }

  const result = schedulingService.update(scheduleId!, campaignId, {
    scheduledFor: body.scheduledFor,
    timezone: body.timezone,
    destinationId: body.destinationId,
    notes: body.notes,
    mediaAssets: body.mediaAssets as import('../types/scheduledContent').PublishableAsset[] | undefined,
  });
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result.item);
});

campaignScheduleRouter.post('/:scheduleId/cancel', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const result = schedulingService.cancel(scheduleId!, campaignId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result.item);
});

campaignScheduleRouter.get('/:scheduleId/preflight', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const result = schedulingService.preflight(scheduleId!, campaignId, { manualPublish: req.query.manual === 'true' });
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

campaignScheduleRouter.get('/:scheduleId/export', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const bundle = schedulingService.buildExportBundle(scheduleId!, campaignId);
  if ('error' in bundle) {
    res.status(statusFor(bundle.code)).json({ error: bundle.error, code: bundle.code });
    return;
  }
  res.json(bundle);
});

campaignScheduleRouter.get('/:scheduleId/attempts', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  res.json(publishingService.getAttempts(scheduleId!, campaignId));
});

campaignScheduleRouter.post('/:scheduleId/publish', async (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const result = await publishingService.publishSchedule(scheduleId!, campaignId, { manualPublish: true });
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

campaignScheduleRouter.post('/:scheduleId/retry', async (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const result = await publishingService.retry(scheduleId!, campaignId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result);
});

campaignScheduleRouter.post('/:scheduleId/mark-published', (req: ScheduleReq, res: Response) => {
  const { campaignId, scheduleId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  const body = req.body as {
    evidence: string;
    publishedAt?: string;
    externalPublishId?: string;
    externalUrl?: string;
  };
  const result = publishingService.markPublished(scheduleId!, campaignId, body);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json(result.item);
});
