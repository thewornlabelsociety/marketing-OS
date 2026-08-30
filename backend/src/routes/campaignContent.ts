import { Router } from 'express';

// GET  /api/content/:contentId
// PATCH /api/content/:contentId
// DELETE /api/content/:contentId
// POST /api/content/:contentId/revisions   — targeted revisions only
// GET  /api/content/:contentId/versions
// GET  /api/content/:contentId/approval
// PATCH /api/content/:contentId/approval
export const campaignContentRouter = Router();
