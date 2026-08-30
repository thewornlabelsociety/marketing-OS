# TOTAL EDIT Architecture

## Principle

TOTAL EDIT is an independent editing domain.
Marketing OS consumes TOTAL EDIT. TOTAL EDIT does not depend on Marketing OS.

## Package Boundary

```
packages/total-edit-core/          — pure domain, no runtime deps
packages/total-edit-adapter-local/ — ffmpeg + filesystem adapter
workers/total-edit-worker/         — local render job worker
```

## What TOTAL EDIT Must NOT Import

- React (or any UI framework)
- Express (or any HTTP framework)
- SQLite, PostgreSQL, or any database client
- Marketing OS domain code (campaigns, brands, workspaces, etc.)
- Brand-specific logic
- Provider-specific integrations

## How Marketing OS Consumes TOTAL EDIT

Through the `EditingProvider` contract in `backend/src/integrations/contracts/EditingProvider.ts`.

The `editorRouter` in `backend/src/routes/editor.ts` translates HTTP requests into
`EditingProvider` calls and returns responses. No TOTAL EDIT internals leak into the route layer.

## Canonical TOTAL EDIT API

```
POST /api/editor/projects
GET  /api/editor/projects/:projectId
POST /api/editor/projects/:projectId/media
POST /api/editor/projects/:projectId/directive
GET  /api/editor/projects/:projectId/timeline
POST /api/editor/projects/:projectId/renders
GET  /api/editor/renders/:renderId
POST /api/editor/projects/:projectId/exports
GET  /api/editor/presets
GET  /api/editor/projects/:projectId/frames
GET  /api/editor/integrations
```

## Editing Rules

- **Original media is immutable.** Raw uploads are never overwritten.
- **Edits are non-destructive instructions** (directives), not mutations of the source.
- **Rendering is asynchronous and job-based.** `POST /renders` starts a job; `GET /renders/:id` polls status.
- **No brand-specific editing conditionals.** Directives are generic.
- **Editing behaviour is defined by directives and presets**, not by if-statements on brand names.
