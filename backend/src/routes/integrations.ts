import { Router } from 'express';

// GET  /api/integrations
// GET  /api/integrations/:provider
// POST /api/integrations/:provider/connect
// DELETE /api/integrations/:provider
// Provider-specific logic must live in adapter classes, not here.
export const integrationsRouter = Router();
