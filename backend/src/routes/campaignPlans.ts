import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { aiEnv } from '../config/aiEnvironment';
import { campaignPlannerService } from '../services/campaigns/CampaignPlannerService';

type PlanReq = Request<{ campaignId: string }>;

interface CampaignRecord { id: string; workspace_id: string }

function resolveCampaign(campaignId: string, workspaceId: string | undefined, res: Response): CampaignRecord | null {
  const campaign = db.prepare('SELECT id, workspace_id FROM campaigns WHERE id = ?').get(campaignId) as CampaignRecord | undefined;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  if (workspaceId && campaign.workspace_id !== workspaceId) {
    res.status(403).json({ error: 'Campaign does not belong to the specified workspace' });
    return null;
  }
  return campaign;
}

export const campaignPlansRouter = Router({ mergeParams: true });

// GET /api/campaigns/:campaignId/plan?workspaceId=...
campaignPlansRouter.get('/', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const plan = campaignPlannerService.getCurrentPlan(campaignId);
  if (!plan) {
    res.status(404).json({ error: 'No plan exists for this campaign' });
    return;
  }

  res.json(plan);
});

// GET /api/campaigns/:campaignId/plan/versions?workspaceId=...
campaignPlansRouter.get('/versions', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  res.json(campaignPlannerService.getAllVersions(campaignId));
});

// GET /api/campaigns/:campaignId/plan/status?workspaceId=...
campaignPlansRouter.get('/status', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  res.json({
    aiConfigured: aiEnv.isConfigured,
    aiProvider: aiEnv.provider,
    hasPlan: campaignPlannerService.getCurrentPlan(campaignId) !== null,
  });
});

// POST /api/campaigns/:campaignId/plan (workspaceId in body)
campaignPlansRouter.post('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

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

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = await campaignPlannerService.revise(campaignId, requestText.trim());
  if ('error' in result) {
    res.status(result.error.includes('not configured') ? 503 : 500).json({ error: result.error });
    return;
  }

  res.status(201).json(result.plan);
});

// POST /api/campaigns/:campaignId/plan/approve (workspaceId in body)
campaignPlansRouter.post('/approve', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { planId, workspaceId } = req.body as { planId?: string; workspaceId?: string };

  if (!planId) {
    res.status(400).json({ error: 'planId is required' });
    return;
  }

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const result = campaignPlannerService.approvePlan(campaignId, planId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ approved: true });
});

// GET /api/campaigns/:campaignId/plan/approval?workspaceId=...
campaignPlansRouter.get('/approval', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const approval = campaignPlannerService.getApproval(campaignId);
  if (!approval) {
    res.status(404).json({ error: 'No approval record found' });
    return;
  }
  res.json(approval);
});
