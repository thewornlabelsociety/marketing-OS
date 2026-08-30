# Marketing OS — Domain Model

## Core Entities

### Workspace
- Replaces the legacy `entities` table in Phase 3+
- One workspace per brand identity
- Contains: Brand Brain, Objective Library, Offers, Audiences, Assets, Campaigns, Memory

### Campaign
- **Must reference an Objective** — campaigns without an objective are invalid
- Lifecycle: `DRAFTING → READY_FOR_REVIEW → CHANGES_REQUESTED → REVISING → READY_FOR_APPROVAL → APPROVED → SCHEDULED → PUBLISHED → MEASURING → COMPLETE`
- Terminal: `CANCELLED | ARCHIVED`

### Objective
- First-class persisted record
- System templates have `workspaceId: null`
- Custom objectives are workspace-scoped
- Controls how campaign performance is judged

### Content Item
- Belongs to a Campaign
- Has its own approval lifecycle
- Maintains version history
- Revisions are always targeted — do not regenerate what wasn't requested

### Performance
- Exists at: workspace, campaign, content item, channel, advertisement, conversion
- Scored against campaign objective, not vanity metrics
- Compared against workspace historic baselines

### Memory
- Market Performance Memory: what customers responded to
- User Preference Memory: what this user approves/rejects/changes
- Always workspace-scoped
- Never silently promoted to global rules

### Experiment
- First-class record with hypothesis, variants, metrics, winner, learning
- Learnings feed Brand Memory explicitly

## Key Invariants

1. A campaign without an objective cannot be created.
2. Performance is always evaluated against its campaign's objective.
3. Revision scope is targeted unless full regeneration is explicitly requested.
4. Version history is never destroyed.
5. Cancelled campaigns retain their cancellation reason.
6. Memory is workspace-scoped — never global.
7. TOTAL EDIT is independent — it does not read campaign or brand data.
