import { Router, Request, Response } from 'express';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { aiEnv } from '../config/aiEnvironment';
import { campaignPlannerService } from '../services/campaigns/CampaignPlannerService';

type PlanReq = Request<{ campaignId: string }>;

interface CampaignRecord { id: string; workspace_id: string }

async function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): Promise<CampaignRecord | null> {
  const campaign = await getCoreRepositories().campaign.findById(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (workspaceId && campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return null;
  }
  return { id: campaign.id, workspace_id: campaign.workspace_id };
}

export const campaignPlansRouter = Router({ mergeParams: true });

// GET /api/campaigns/:campaignId/plan?workspaceId=...
campaignPlansRouter.get('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const plan = await campaignPlannerService.getCurrentPlan(campaignId);
  if (!plan) {
    res.status(404).json({ error: 'No plan exists for this campaign' });
    return;
  }

  res.json(plan);
});

// GET /api/campaigns/:campaignId/plan/versions?workspaceId=...
campaignPlansRouter.get('/versions', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  res.json(await campaignPlannerService.getAllVersions(campaignId));
});

// GET /api/campaigns/:campaignId/plan/status?workspaceId=...
campaignPlansRouter.get('/status', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const current = await campaignPlannerService.getCurrentPlan(campaignId);
  res.json({
    aiConfigured: aiEnv.isConfigured,
    aiProvider: aiEnv.provider,
    hasPlan: current !== null,
  });
});

// POST /api/campaigns/:campaignId/plan (workspaceId in body)
campaignPlansRouter.post('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const result = await campaignPlannerService.generate(campaignId);
  if ('error' in result) {
    res.status(result.error.includes('not configured') ? 503 : 500).json({ error: result.error });
    return;
  }

  res.status(201).json(result.plan);
});

// POST /api/campaigns/:campaignId/plan/revisions (workspaceId in body)
campaignPlansRouter.post('/revisions', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { requestText, workspaceId } = req.body as { requestText?: string; workspaceId?: string };

  if (!requestText?.trim()) {
    res.status(400).json({ error: 'requestText is required' });
    return;
  }

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const result = await campaignPlannerService.revise(campaignId, requestText.trim());
  if ('error' in result) {
    res.status(result.error.includes('not configured') ? 503 : 500).json({ error: result.error });
    return;
  }

  res.status(201).json(result.plan);
});

// POST /api/campaigns/:campaignId/plan/approve (workspaceId in body)
campaignPlansRouter.post('/approve', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { planId, workspaceId } = req.body as { planId?: string; workspaceId?: string };

  if (!planId) {
    res.status(400).json({ error: 'planId is required' });
    return;
  }

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const result = await campaignPlannerService.approvePlan(campaignId, planId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ approved: true });
});

// GET /api/campaigns/:campaignId/plan/approval?workspaceId=...
campaignPlansRouter.get('/approval', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!(await resolveCampaign(campaignId, workspaceId, res))) return;

  const approval = await campaignPlannerService.getApproval(campaignId);
  if (!approval) {
    res.status(404).json({ error: 'No approval record found' });
    return;
  }
  res.json(approval);
});
