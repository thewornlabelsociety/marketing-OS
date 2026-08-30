# Marketing OS — Product Constitution

This document is the permanent product guardrail for Marketing OS.
Read it before any major feature work. It supersedes implementation convenience.

---

## What Marketing OS Is

Marketing OS is an AI-assisted social media marketing campaign creator.

The system does as much work as possible before requiring human input.
The human user remains the final approver of all campaign decisions.

### Core Experience Flow

```
WHAT ARE WE MARKETING?
→ CAMPAIGN OBJECTIVE
→ BRAND BRAIN
→ CAMPAIGN PLAN
→ CONTENT + CREATIVE
→ QUALITY CHECK
→ REVIEW
→ CHANGES REQUESTED / ITERATE
→ APPROVE
→ SCHEDULE / PUBLISH
→ PERFORMANCE
→ LEARN
→ IMPROVE THE NEXT CAMPAIGN
```

---

## What Marketing OS Markets

Marketing OS must support all of:

- Physical products
- Inventory batches
- Services
- Software features
- Packages
- Events
- Offers and promotions
- Announcements
- Educational content
- Manually entered campaign ideas
- Imported data from external applications

---

## Brand Agnosticism

Marketing OS must remain completely brand-agnostic.

**Never hardcode:**
- Brand names
- Customer names
- Workspace IDs
- Business-specific campaigns
- Brand-specific if-statements
- Required default brands or demo workspaces

Generic marketing objective templates are permitted.
Generic system configuration is permitted.
Business data belongs in persistence and configuration.

---

## Campaign Objectives

Every campaign **must** have an objective. Campaigns without an objective are invalid.

Objectives are first-class persisted records. Each workspace has an Objective Library.

### Objective Library Contents

- System-provided templates (generic, configurable, brand-agnostic)
- Workspace-created custom objectives

### System Objective Templates

Sales · Lead Generation · Traffic · Awareness · Engagement · Launch ·
Event Promotion · Email List Growth · Customer Retention · Re-engagement ·
Education · Community Growth · Inventory Clearance

These are generic marketing concepts. They must not contain business-specific assumptions.

### Objective Fields

`id · workspaceId (null for system templates) · name · description ·
objectiveType · primaryKpi · supportingKpis[] · conversionEvent ·
successCriteria · defaultChannels[] · isSystem · isActive ·
createdAt · updatedAt`

---

## Campaign Lifecycle

One canonical lifecycle. Do not create competing definitions.

```
DRAFTING
READY_FOR_REVIEW
CHANGES_REQUESTED
REVISING
READY_FOR_APPROVAL
APPROVED
SCHEDULED
PUBLISHED
MEASURING
COMPLETE

Terminal: CANCELLED | ARCHIVED
```

---

## Approval and Review Language

Use only these terms. No exceptions.

| Allowed | Forbidden |
|---|---|
| Review | CEO Review |
| Changes Requested | CEO Approval |
| Revise / Revising | — |
| Ready for Approval | — |
| Approve / Approved | — |

---

## Revision Rules

- Revision instructions must be targeted.
- **Do NOT regenerate an entire campaign because one asset or caption needs changing.**
- Only change explicitly requested content unless the user asks for full regeneration.
- Maintain version history. The user must be able to restore or compare previous versions.

---

## Campaign Quality Gate

Before any content is marked READY_FOR_REVIEW, run quality checks:

Brand voice compliance · banned vocabulary · preferred vocabulary ·
objective alignment · correct audience · clear CTA · correct product/offer details ·
duplicate hooks · channel suitability · content length · correct asset dimensions ·
links · required deliverables · campaign completeness

Where possible, auto-repair quality failures before presenting for review.

---

## Performance Evaluation

**Campaign performance must always be evaluated against its objective.**

Do NOT judge success primarily by engagement unless engagement is the campaign objective.

Always ask: **DID THIS CAMPAIGN ACCOMPLISH ITS OBJECTIVE?**

### Objective-Based Primary KPIs

| Objective | Primary Metric |
|---|---|
| Sales | Revenue / conversions |
| Lead Generation | Qualified leads / cost per lead |
| Traffic | Qualified clicks / sessions |
| Awareness | Reach / impressions / video views |
| Engagement | Comments / shares / saves / meaningful interaction |
| Launch | Campaign-specific conversion event |

### Performance Classifications

EXCEPTIONAL · HIGH_PERFORMING · ABOVE_AVERAGE · AVERAGE ·
BELOW_AVERAGE · LOW_PERFORMING · INSUFFICIENT_DATA

Scoring considers: campaign objective, primary KPI, supporting KPIs,
conversion, revenue/ROI, workspace baseline, channel baseline,
content-type baseline.

**Do not create a simplistic likes-based score.**

---

## Baselines

Performance is compared primarily against the workspace's own historic performance.

Baseline types: workspace · channel · content format · objective · campaign

---

## Campaign Library

Do not permanently delete completed campaign knowledge.

Library categories: High Performing · Low Performing · Evergreen · Completed ·
Cancelled · Experiments · Seasonal · Archived

Cancelled campaigns must retain a cancellation reason.
Rejected concepts and revisions are useful learning data — preserve them.

---

## Memory Model

Brand Memory distinguishes two types of learning:

**Market Performance Memory** — What customers responded to:
winning hook patterns · high-converting content · strong channels ·
best timings · strong offers · successful creative formats

**User Preference Memory** — What the user repeatedly approves, rejects, or changes:
preferred tone · preferred image style · disliked phrases ·
preferred hooks · preferred CTAs

**Do not silently convert one user's preference into a global rule.**
All memory is workspace-scoped.

---

## Automation Levels

`MANUAL · APPROVAL_REQUIRED · AUTOPILOT`

- Do not activate AUTOPILOT broadly in early builds.
- Anything involving paid advertising spend requires explicit approval
  until a dedicated spending-policy system exists.

---

## Integration Architecture

Never embed provider-specific logic in the core domain.
Use provider contracts/adapters.

Core Marketing OS must not depend directly on any specific provider.

---

## TOTAL EDIT Boundary

TOTAL EDIT is a separate editing domain consumed by Marketing OS.
TOTAL EDIT must never import Marketing OS domain code.

TOTAL EDIT core must not import: React · Express · SQLite · Postgres ·
Marketing OS domain code · brand-specific logic · provider integrations

Rules:
- Original media is immutable.
- Edits are non-destructive instructions.
- Rendering is asynchronous and job-based.

---

## SaaS Readiness Boundary

Current: SQLite · local filesystem · local processing · tenant_local

Do NOT implement until actually needed:
Billing · subscriptions · enterprise auth · complex permissions ·
distributed infrastructure

Design interfaces so infrastructure can be replaced later.

---

## UI Design System

### Primary Navigation

Six items only. Do not grow this list without a strong reason.

```
Dashboard · Campaigns · Create · Calendar · Performance · Library
```

Secondary/configuration areas (not in main sidebar):
Brand Brain · Objectives · Offers · Audiences · SOPs · Integrations · TOTAL EDIT · Settings

### Page Structure Pattern

Each page uses: tabs for related views, compact dropdowns for choices,
icon actions for secondary tools, contextual right-side drawers, advanced settings hidden by default.

**No walls of cards. No button grids. No widget dashboard overload.**

### Campaigns Page Example

```
Campaigns
[ Active ] [ Review ] [ Scheduled ] [ Completed ]
```

Clean list or table. Clicking a campaign opens it.
Actions (duplicate, archive, revise) sit in a compact three-dot menu or Lucide icon — not permanent buttons.

### Create Page Pattern

```
What are we marketing?

[ Select workspace ▼ ]
[ Product / Service / Offer / Event / Idea ▼ ]
[ Select item or enter details ]

Objective: [ Sales ▼ ]

[ Create Campaign ]
```

Everything sophisticated happens after that first form.

### SOP Drawer Pattern

SOPs are always available from a checklist icon in the page header.
Clicking it opens a right-hand drawer without leaving the current page.
SOPs must be context-aware: campaign SOP in a campaign, brand SOP during setup, publishing checks when publishing.

```
Campaign: Winter Drop                      [ ☰ ]
─────────────────────────┬─────────────────────
Campaign content here    │ SOP
                         │ Winter Drop
                         │ ✓ Products selected
                         │ ✓ Campaign created
                         │ □ Check prices
                         │ □ Review carousel
                         │ □ Approve captions
                         │ □ Confirm schedule
                         │ □ Publish
                         │ 5 of 7 complete
─────────────────────────┴─────────────────────
```

### Advanced Pattern

Any setting not needed most days belongs behind:

```
Advanced ▾
```

This includes: attribution settings, custom KPI rules, provider IDs,
integration mapping, automation policies, export options, technical metadata.

### The Four Default Questions

The default interface should answer only:

1. What am I working on?
2. What needs my attention?
3. What do I do next?
4. How did it perform?

Everything else is revealed progressively.

### Hard UI Rules

**Before adding a new visible button:** ask whether the action can live in a
dropdown, overflow menu, tab, contextual drawer, or advanced section instead.

**A page should have one obvious primary action wherever possible.**

Do not allow: Generate, Regenerate, Preview, Edit, Duplicate, Export, Analyse,
Schedule, Publish buttons all competing for attention on the same view.

### Component Rules

- Use Lucide icons for all iconography.
- **No emojis in product UI.**
- Avoid pill-heavy design.
- Avoid unnecessary technical language.
- Use plain-English labels.
- Keep the workspace selector compact.
- Surface only relevant decisions — the system works behind the scenes.
