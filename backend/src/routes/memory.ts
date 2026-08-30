import { Router } from 'express';

// GET  /api/memory
// GET  /api/memory/learnings
// POST /api/memory               — explicit memory write (never silent)
// Memory is always workspace-scoped; never promoted to global rules.
export const memoryRouter = Router();
