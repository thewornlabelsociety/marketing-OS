import { Router } from 'express';

// GET  /api/publishing
// POST /api/publishing            — schedule or publish immediately
// GET  /api/publishing/:recordId
// DELETE /api/publishing/:recordId  — cancel scheduled publish
export const publishingRouter = Router();
