# ADR: PG-4B Content Planning Postgres Parity

## Status

Accepted — implementation complete pending verification.

## Context

PG-4A added migration `004_pg4_content_plan_unique_constraints.sql` (`uq_content_plan_approvals_campaign_id`) so Postgres can use `ON CONFLICT (campaign_id) DO UPDATE` for content-plan approval pins.

PG-4B migrates content-planning persistence to the shared repository layer while keeping normal MOS runtime on SQLite.

## Decision

1. **Scope:** `content_plans`, `content_plan_revision_requests`, `content_plan_approvals` via `contentPlanning` repositories; reuse PG-2/PG-3 repos for upstream campaign/strategy prerequisites.
2. **Services:** `ContentPlannerService` uses `getCoreRepositories()` with injectable AI and repository factories for verification. Production AI selection remains unchanged.
3. **Routes:** `routes/contentPlans.ts` uses async repository-backed campaign guards (`campaign.findById`) with preserved 400/403/404 semantics.
4. **Postgres transactions:** Generate, revise success, and approve use `withPostgresTransaction` + `createCoreRepositoriesWithClient(client)`. AI calls run outside transactions.
5. **SQLite:** Repository implementations preserve existing ordering, version semantics, TEXT JSON bodies, and approval upsert behaviour.
6. **Verification hooks:** `PG4B_INJECT_FAILURE` stages (`generate_after_clear_current`, `revise_after_clear_current`, `revise_before_revision_applied`, `approve_after_upsert`) for rollback probes only.
7. **Hard stop:** PG-4B ends at `resolveApprovedContentPlan()`. Creative persistence remains out of scope.

## Consequences

- Content-plan routes and service persistence work through repositories on both engines in verification mode.
- Current vs approved semantics preserved: `getCurrent()` may differ from pinned approval used by creative generation.
- Creative, media, scheduling, publishing, performance, learnings, blueprints, and other domains remain SQLite-direct.
- `CampaignContextBuilder` may still read optional SQLite-only context (Brand Brain, learnings, blueprints) — acceptable for PG-4B.

## Deferred

- `creative_artifacts` / `CreativeGeneratorService` persistence migration (PG-5)
- Partial unique index on current content plans (optional concurrency hardening)
- SQLite → Postgres application-data copy
- Normal runtime Postgres cutover
