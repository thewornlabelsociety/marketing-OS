import { Router, Request, Response } from 'express';
import { aiEnv } from '../config/aiEnvironment';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { contentPlannerService } from '../services/campaigns/ContentPlannerService';
import { listChannelCapabilities } from '../services/channels/ChannelCapabilityRegistry';

type PlanReq = Request<{ campaignId: string }>;

function resolveWorkspaceId(req: PlanReq): string | undefined {
  const query = req.query as Record<string, string | undefined>;
  const body = req.body as { workspaceId?: string } | undefined;
  return query.workspaceId || body?.workspaceId;
}

async function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): Promise<boolean> {
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return false;
  }

  const repos = getCoreRepositories();
  const campaign = await repos.campaign.findById(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return false;
  }
  if (campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return false;
  }
  return true;
}

function statusFor(code?: string): number {
  if (code === 'AI_UNAVAILABLE') return 503;
  if (code === 'STRATEGY_NOT_APPROVED') return 409;
  if (code === 'VALIDATION_FAILED') return 422;
  if (code === 'NOT_FOUND' || code === 'NO_CONTENT_PLAN') return 404;
  return 400;
}

export const contentPlansRouter = Router({ mergeParams: true });

contentPlansRouter.get('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!(await resolveCampaign(campaignId, resolveWorkspaceId(req), res))) return;

  const plan = await contentPlannerService.getCurrent(campaignId);
  if (!plan) {
    res.status(404).json({ error: 'No content plan exists for this campaign' });
    return;
  }
  res.json(plan);
});

contentPlansRouter.get('/versions', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!(await resolveCampaign(campaignId, resolveWorkspaceId(req), res))) return;
  res.json(await contentPlannerService.getAllVersions(campaignId));
});

contentPlansRouter.get('/status', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!(await resolveCampaign(campaignId, resolveWorkspaceId(req), res))) return;

  const current = await contentPlannerService.getCurrent(campaignId);
  const approval = await contentPlannerService.getApproval(campaignId);
  const strategy = await contentPlannerService.resolveApprovedStrategy(campaignId);

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
  if (!(await resolveCampaign(campaignId, resolveWorkspaceId(req), res))) return;

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
  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const result = await contentPlannerService.revise(campaignId, requestText.trim());
  if ('error' in result) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.status(201).json(result.plan);
});

contentPlansRouter.post('/approval', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { contentPlanId, workspaceId } = req.body as { contentPlanId?: string; workspaceId?: string };

  if (!contentPlanId) {
    res.status(400).json({ error: 'contentPlanId is required' });
    return;
  }
  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const result = await contentPlannerService.approve(campaignId, contentPlanId);
  if (result.error) {
    res.status(statusFor(result.code)).json({ error: result.error, code: result.code });
    return;
  }
  res.json({ approved: true });
});

contentPlansRouter.get('/approval', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  if (!(await resolveCampaign(campaignId, resolveWorkspaceId(req), res))) return;

  const approval = await contentPlannerService.getApproval(campaignId);
  if (!approval) {
    res.status(404).json({ error: 'No content plan approval record found' });
    return;
  }
  res.json(approval);
});
