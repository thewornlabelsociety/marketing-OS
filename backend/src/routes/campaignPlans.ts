import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { aiEnv } from '../config/aiEnvironment';
import { campaignPlannerService } from '../services/campaigns/CampaignPlannerService';

type PlanReq = Request<{ campaignId: string }>;

export const campaignPlansRouter = Router({ mergeParams: true });

// GET /api/campaigns/:campaignId/plan
// Returns the current campaign plan (or 404 if none)
campaignPlansRouter.get('/', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;

  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const plan = campaignPlannerService.getCurrentPlan(campaignId);
  if (!plan) {
    res.status(404).json({ error: 'No plan exists for this campaign' });
    return;
  }

  res.json(plan);
});

// GET /api/campaigns/:campaignId/plan/versions
// Returns all plan versions for a campaign
campaignPlansRouter.get('/versions', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;

  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  res.json(campaignPlannerService.getAllVersions(campaignId));
});

// GET /api/campaigns/:campaignId/plan/status
// Returns AI availability and current plan existence
campaignPlansRouter.get('/status', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  res.json({
    aiConfigured: aiEnv.isConfigured,
    aiProvider: aiEnv.provider,
    hasPlan: campaignPlannerService.getCurrentPlan(campaignId) !== null,
  });
});

// POST /api/campaigns/:campaignId/plan
// Generate a new campaign plan
campaignPlansRouter.post('/', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;

  const campaign = db.prepare('SELECT id, workspace_id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const result = await campaignPlannerService.generate(campaignId);
  if ('error' in result) {
    res.status(result.error.includes('not configured') ? 503 : 500).json({ error: result.error });
    return;
  }

  res.status(201).json(result.plan);
});

// POST /api/campaigns/:campaignId/plan/revisions
// Submit a targeted revision request
campaignPlansRouter.post('/revisions', async (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { requestText } = req.body as { requestText?: string };

  if (!requestText?.trim()) {
    res.status(400).json({ error: 'requestText is required' });
    return;
  }

  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const result = await campaignPlannerService.revise(campaignId, requestText.trim());
  if ('error' in result) {
    res.status(result.error.includes('not configured') ? 503 : 500).json({ error: result.error });
    return;
  }

  res.status(201).json(result.plan);
});

// POST /api/campaigns/:campaignId/plan/approve
// Approve the current campaign plan
campaignPlansRouter.post('/approve', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const { planId } = req.body as { planId?: string };

  if (!planId) {
    res.status(400).json({ error: 'planId is required' });
    return;
  }

  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const result = campaignPlannerService.approvePlan(campaignId, planId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ approved: true });
});

// GET /api/campaigns/:campaignId/plan/approval
// Get approval record
campaignPlansRouter.get('/approval', (req: PlanReq, res: Response) => {
  const { campaignId } = req.params;
  const approval = campaignPlannerService.getApproval(campaignId);
  if (!approval) {
    res.status(404).json({ error: 'No approval record found' });
    return;
  }
  res.json(approval);
});
