import { Router } from 'express';

// Canonical TOTAL EDIT API surface (Marketing OS side):
// GET  /api/editor/projects
// POST /api/editor/projects
// GET  /api/editor/projects/:projectId
// POST /api/editor/projects/:projectId/media
// POST /api/editor/projects/:projectId/directive
// GET  /api/editor/projects/:projectId/timeline
// POST /api/editor/projects/:projectId/renders
// GET  /api/editor/renders/:renderId
// POST /api/editor/projects/:projectId/exports
// GET  /api/editor/presets
// GET  /api/editor/projects/:projectId/frames
// GET  /api/editor/integrations
// Do NOT create action endpoints like /make-video or /remove-silence-now.
export const editorRouter = Router();
