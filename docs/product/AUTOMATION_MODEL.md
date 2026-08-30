# Automation Model

## Automation Levels

```
MANUAL           — All actions require explicit human initiation
APPROVAL_REQUIRED — System suggests/executes steps but pauses for human approval
AUTOPILOT        — System executes steps autonomously (future; not broadly activated)
```

## AUTOPILOT Policy

AUTOPILOT must not be activated broadly in the initial build.
Any step involving paid advertising spend requires explicit approval regardless of automation level.
A dedicated spending-policy system must exist before AUTOPILOT can control ad spend.

## SOPs (Standard Operating Procedures)

SOPs are workspace-scoped workflow definitions.

Fields: `id · workspaceId · name · description · trigger · automationLevel · steps[] · isActive`

Triggers: `CAMPAIGN_CREATED · CONTENT_READY · REVIEW_COMPLETE · CAMPAIGN_APPROVED · CAMPAIGN_PUBLISHED · MANUAL`

Each step has: `order · action · params · requiresApproval`

Steps with `requiresApproval: true` pause execution for human input regardless of automation level.

## SOP UI Pattern

SOPs appear as context-aware right-side drawers, accessible from a checklist icon in the page header.
Users never navigate away from their work to see what comes next.

The drawer is context-aware:
- In a campaign: shows the campaign SOP
- During brand setup: shows the brand setup SOP
- During publishing: shows publishing checks
