import { Router } from 'express';

// GET  /api/objectives            — list system + workspace objectives
// POST /api/objectives            — create custom workspace objective
// GET  /api/objectives/:id
// PATCH /api/objectives/:id
// DELETE /api/objectives/:id
export const objectivesRouter = Router();
