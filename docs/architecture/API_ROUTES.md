# Marketing OS — Canonical API Routes

All routes follow REST resource-oriented conventions.
Do not create action endpoints (e.g. `/make-video`, `/remove-silence-now`).

## Core Marketing OS API

```
GET    /health

GET    /api/workspaces
GET    /api/workspaces/:workspaceId
POST   /api/workspaces
PATCH  /api/workspaces/:workspaceId

GET    /api/objectives
POST   /api/objectives
GET    /api/objectives/:objectiveId
PATCH  /api/objectives/:objectiveId
DELETE /api/objectives/:objectiveId

GET    /api/offers
POST   /api/offers
GET    /api/offers/:offerId
PATCH  /api/offers/:offerId
DELETE /api/offers/:offerId

GET    /api/audiences
POST   /api/audiences
GET    /api/audiences/:audienceId
PATCH  /api/audiences/:audienceId
DELETE /api/audiences/:audienceId

GET    /api/intake
POST   /api/bridge/intake

GET    /api/campaigns
POST   /api/campaigns              — requires objectiveId
GET    /api/campaigns/:campaignId
PATCH  /api/campaigns/:campaignId
DELETE /api/campaigns/:campaignId
GET    /api/campaigns/:campaignId/content
POST   /api/campaigns/:campaignId/revisions
GET    /api/campaigns/:campaignId/versions
GET    /api/campaigns/:campaignId/approval
PATCH  /api/campaigns/:campaignId/approval
POST   /api/campaigns/:campaignId/schedule
GET    /api/campaigns/:campaignId/performance

GET    /api/content/:contentId
PATCH  /api/content/:contentId
DELETE /api/content/:contentId
POST   /api/content/:contentId/revisions  — targeted only
GET    /api/content/:contentId/versions
GET    /api/content/:contentId/approval
PATCH  /api/content/:contentId/approval

GET    /api/performance
GET    /api/performance/insights
GET    /api/performance/baselines

GET    /api/experiments
POST   /api/experiments
GET    /api/experiments/:experimentId
PATCH  /api/experiments/:experimentId

GET    /api/archive/campaigns

GET    /api/memory
GET    /api/memory/learnings
POST   /api/memory

GET    /api/sops
POST   /api/sops
GET    /api/sops/:sopId
PATCH  /api/sops/:sopId
DELETE /api/sops/:sopId

GET    /api/integrations
GET    /api/integrations/:provider
POST   /api/integrations/:provider/connect
DELETE /api/integrations/:provider
```

## TOTAL EDIT API

```
GET    /api/editor/projects
POST   /api/editor/projects
GET    /api/editor/projects/:projectId
POST   /api/editor/projects/:projectId/media
POST   /api/editor/projects/:projectId/directive
GET    /api/editor/projects/:projectId/timeline
POST   /api/editor/projects/:projectId/renders
GET    /api/editor/renders/:renderId
POST   /api/editor/projects/:projectId/exports
GET    /api/editor/presets
GET    /api/editor/projects/:projectId/frames
GET    /api/editor/integrations
```

## Legacy Routes (Phase 2 baseline — temporary)

These routes remain for compatibility while canonical routes are built.
Document any alias removal in an ADR.

```
/api/entities        → will become /api/workspaces
/api/content         → will become /api/campaigns/:id/content
/api/sops            → canonical — already aligned
/api/performance     → canonical — already aligned
/api/media           → will move into /api/editor or asset management
/api/intake          → canonical
/api/bridge/intake   → canonical
```
