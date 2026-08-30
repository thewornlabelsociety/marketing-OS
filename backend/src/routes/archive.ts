import { Router } from 'express';

// GET /api/archive/campaigns
// Filterable by: workspace, objective, channel, content type, offer,
// date, performance, revenue, engagement, hook, audience, creative style
// Cancelled campaigns retain cancellation reason.
// Rejected revisions are retained as learning data.
export const archiveRouter = Router();
