import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { campaignBriefService } from '../services/campaigns/CampaignBriefService';

export const campaignBriefRouter = Router({ mergeParams: true });

type BriefReq = Request<{ campaignId: string }>;

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

// GET /api/campaigns/:campaignId/brief?workspaceId=...
campaignBriefRouter.get('/', (req: BriefReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const brief = campaignBriefService.assemble(campaignId);
  if (!brief) {
    res.status(404).json({ error: 'Could not assemble brief — campaign data incomplete' });
    return;
  }

  res.json(brief);
});

// PATCH /api/campaigns/:campaignId/brief?workspaceId=...
campaignBriefRouter.patch('/', (req: BriefReq, res: Response) => {
  const { campaignId } = req.params;
  const { workspaceId } = req.query as Record<string, string | undefined>;

  if (!resolveCampaign(campaignId, workspaceId, res)) return;

  const body = req.body as Record<string, unknown>;
  const updated = campaignBriefService.patch(campaignId, {
    timingStartDate:     body.timingStartDate     as string | undefined,
    timingEndDate:       body.timingEndDate       as string | undefined,
    offerDescription:    body.offerDescription    as string | undefined,
    offerValue:          body.offerValue          as string | undefined,
    offerUrgency:        body.offerUrgency        as string | undefined,
    additionalContext:   body.additionalContext   as string | undefined,
    proposition:         body.proposition        as string | undefined,
    audienceDescription: body.audienceDescription as string | undefined,
  });

  if (!updated) {
    res.status(500).json({ error: 'Failed to update brief' });
    return;
  }

  res.json(updated);
});
