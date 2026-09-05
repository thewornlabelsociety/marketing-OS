# ADR: PG-3B Campaign Planning Postgres Parity

## Status

Accepted — implementation complete pending verification.

## Context

PG-3A added migration `003_pg3_unique_constraints.sql` (one brief per campaign, one approval per campaign) and migration-aware verification.

PG-3B migrates campaign brief and planning persistence to the shared repository layer while keeping normal MOS runtime on SQLite.

## Decision

1. **Scope:** `campaign_briefs`, `campaign_plans`, `revision_requests`, `plan_approvals` via planning repositories; reuse PG-2 repos for campaigns, entities, objectives.
2. **Services:** `CampaignBriefService`, `CampaignContextBuilder`, and `CampaignPlannerService` use `getCoreRepositories()` with injectable factories for verification.
3. **Routes:** `routes/campaignBrief.ts` and `routes/campaignPlans.ts` only — async repository-backed guards and service calls.
4. **Postgres transactions:** Multi-write planning operations use `withPostgresTransaction` + `createCoreRepositoriesWithClient(client)`. AI calls run outside transactions; DB writes commit atomically.
5. **SQLite:** Sequential repository wrappers preserve existing runtime semantics; no new SQLite transaction model.
6. **AI injection:** Optional `AIProvider` on `CampaignPlannerService`; production default remains `getAIProvider()`. Verification uses deterministic mock provider.
7. **Driver gate unchanged:** Postgres requires `CORE_DB_DRIVER=postgres` and `PG2_VERIFICATION_ALLOWED=1`.

## Consequences

- Brief/plan routes work through repositories on both engines in verification mode.
- Postgres generate/revise/approve have stronger atomicity than legacy SQLite sequential writes.
- Content, creative, publishing, performance, and other downstream domains remain SQLite-direct until future phases.
- A campaign existing only in Postgres is still not valid for full MOS workflows outside PG-3B verification.

## Deferred

- Content/creative/scheduling/publishing/performance repository migration
- SQLite → Postgres application-data copy
- Normal runtime Postgres cutover
