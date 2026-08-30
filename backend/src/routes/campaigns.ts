import { Router } from 'express';

// GET  /api/campaigns
// POST /api/campaigns             — campaigns require an objectiveId
// GET  /api/campaigns/:campaignId
// PATCH /api/campaigns/:campaignId
// DELETE /api/campaigns/:campaignId
// GET  /api/campaigns/:campaignId/content
// POST /api/campaigns/:campaignId/revisions
// GET  /api/campaigns/:campaignId/versions
// GET  /api/campaigns/:campaignId/approval
// PATCH /api/campaigns/:campaignId/approval
// POST /api/campaigns/:campaignId/schedule
// GET  /api/campaigns/:campaignId/performance
export const campaignsRouter = Router();
