import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { aiEnv } from '../config/aiEnvironment';
import { contentPlannerService } from '../services/campaigns/ContentPlannerService';
import { listChannelCapabilities } from '../services/channels/ChannelCapabilityRegistry';

type PlanReq = Request<{ campaignId: string }>;

interface CampaignRecord { id: string; workspace_id: string }

function resolveWorkspaceId(req: PlanReq): string | undefined {
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
  if (code === 'AI_UNAVAILABLE') return 503;
  if (code === 'STRATEGY_NOT_APPROVED') return 409;
  if (code === 'VALIDATION_FAILED') return 422;
  if (code === 'NOT_FOUND' || code === 'NO_CONTENT_PLAN') return 404;
  return 400;
}

export const contentPlansRouter = Router({ mergeParams: true });

contentPlansRouter.get('/', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const plan = contentPlannerService.getCurrent(campaignId);
  if (!plan) {
    res.status(404).json({ error: 'No content plan exists for this campaign' });
    return;
  }
  res.json(plan);
});

contentPlansRouter.get('/versions', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;
  res.json(contentPlannerService.getAllVersions(campaignId));
});

contentPlansRouter.get('/status', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const current = contentPlannerService.getCurrent(campaignId);
  const approval = contentPlannerService.getApproval(campaignId);
  const strategy = contentPlannerService.resolveApprovedStrategy(campaignId);

  res.json({
    aiConfigured: aiEnv.isConfigured,
    aiProvider: aiEnv.provider,
    hasContentPlan: current !== null,
    contentPlanStatus: current?.status ?? null,
    strategyApproved: !('error' in strategy),
    contentPlanApproved: approval !== null,
    capabilities: listChannelCapabilities(),
  });
});

contentPlansRouter.post('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const result = await contentPlannerService.generate(campaignId);
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.plan);
});

contentPlansRouter.post('/revisions', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { requestText, workspaceId } = req.body as { requestText?: string; workspaceId?: string };

  if (!requestText?.trim()) {
    res.status(400).json({ error: 'requestText is required' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = await contentPlannerService.revise(campaignId, requestText.trim());
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.plan);
});

contentPlansRouter.post('/approval', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { contentPlanId, workspaceId } = req.body as { contentPlanId?: string; workspaceId?: string };

  if (!contentPlanId) {
    res.status(400).json({ error: 'contentPlanId is required' });
    return;
  }
  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = contentPlannerService.approve(campaignId, contentPlanId);
  if (result.error) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json({ approved: true });
});

contentPlansRouter.get('/approval', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!resolveCampaign(campaignId, resolveWorkspaceId(req), res)) return;

  const approval = contentPlannerService.getApproval(campaignId);
  if (!approval) {
    res.status(404).json({ error: 'No content plan approval record found' });
    return;
  }
  res.json(approval);
});
