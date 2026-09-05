# ADR: PG-2 Core Domain Postgres Repository Parity

## Status

Accepted — implementation complete pending verification.

## Context

PG-1 established a verified Supabase Postgres foundation (schema baseline + migrations) while MOS runtime remained SQLite-first.

PG-2 must prove that the **core entity / objective / campaign persistence layer** behaves equivalently through SQLite and Postgres repositories — without approving normal MOS runtime on Postgres.

## Decision

1. **Scope:** `tenants` (fixture/FK only), `entities`, `objectives`, `campaigns`.
2. **Route conversion:** `routes/entities.ts`, `routes/objectives.ts`, `routes/campaigns.ts` only (~24 SQLite call sites).
3. **Driver gate:**
   - Default `CORE_DB_DRIVER=sqlite`
   - Postgres requires `CORE_DB_DRIVER=postgres` **and** `PG2_VERIFICATION_ALLOWED=1`
   - `DATABASE_URL` alone never activates Postgres
4. **Split-brain acknowledged:** 27 downstream files still read/write `campaigns` via SQLite. Postgres core mode is **verification-only** in PG-2.
5. **Data copy deferred:** No SQLite → Postgres application-data migration tooling in PG-2. Verification uses isolated fixture IDs with exact-ID cleanup only.

## Consequences

- Normal MOS / Replit operation remains SQLite-backed.
- A campaign stored only in Postgres is **not** visible to brief/plan/content/creative/schedule/publishing/performance/library/dashboard flows until those domains migrate.
- `plan_approvals` UNIQUE discrepancy (SQLite has `campaign_id UNIQUE`, PG `001` does not) remains deferred to campaign-planning migration phase.

## Deferred

- Campaign briefs / plans / revision_requests / plan_approvals repository migration
- SQLite → Postgres application-data copy CLI
- 27-file campaign dependency migration (runtime cutover checklist)
- Server-wide Postgres cutover
