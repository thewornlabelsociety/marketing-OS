# ADR 009 — PG-1 Supabase Postgres Foundation

**Date:** 2026-09-05
**Status:** Accepted

---

## Context

Marketing OS currently runs on SQLite (`better-sqlite3`) with a 51-table canonical schema spread across `schema.sql` and 23 incremental migrations. Supabase Postgres is the target production database, but PG-1 must add Postgres capability **without** cutting over runtime, converting services, or copying production data.

---

## Decisions

### 1. Parallel Postgres track — no runtime cutover in PG-1

**Decision:** Add `backend/src/db/postgres/` as a parallel migration and connection layer. `server.ts` and all services continue using SQLite via `database.ts`.

**Reason:** PG-1 establishes foundation only. Service-level query conversion belongs to a later phase.

---

### 2. Squashed Postgres baseline (not 23 translated SQLite files)

**Decision:** Canonical Supabase migrations begin with:

- `001_mos_baseline.sql` — final-state DDL squashed from fully migrated SQLite
- `002_system_objectives_seed.sql` — 13 system objectives (`ON CONFLICT DO NOTHING`)

**Reason:** SQLite has duplicate `012-*` migration prefixes and order-dependent index drops. A squashed baseline avoids replaying evolution bugs and gives Postgres a clean starting point.

**Explicit exclusion:** `tenant_local` bootstrap is **not** in Postgres migration history. It remains SQLite/local-runtime seed logic in `database.ts`.

---

### 3. Checksum-based Postgres migration tracking

**Decision:** Track applied files in `postgres_migrations(filename, checksum, applied_at)` with SHA-256 checksums. Each migration runs in a transaction. Re-applying skips recorded files; checksum mismatches fail loudly.

**Reason:** Detects edited migration files after apply. Stronger than SQLite's filename-only tracker.

**Immutability:** Once `001_mos_baseline.sql` and `002_system_objectives_seed.sql` are applied to Supabase, they are **immutable**. Checksum tracking enforces this at runtime. All subsequent Postgres schema changes must be new numbered migrations (`003_*.sql`, `004_*.sql`, …). Baseline generators may only overwrite canonical files before first apply (`--allow-pre-baseline-overwrite`); otherwise they write audit copies under `postgres/audit/`.

---

### 3b. Non-destructive live verification

**Decision:** PG-1 migration runner and verifier contain no `DROP DATABASE`, `DROP SCHEMA`, `DROP TABLE`, `TRUNCATE`, or schema-reset logic. Migrations use idempotent DDL (`CREATE IF NOT EXISTS`) and idempotent seeds (`ON CONFLICT DO NOTHING`). Live verification uses session-scoped `TEMP` tables only.

**“Clean initialization”** means applying canonical migrations to an **empty or new** Supabase project — not forcibly emptying an existing database.

---

### 4. Authoritative schema manifest for verification

**Decision:** Maintain `sqliteSchemaManifest.json` generated from a fresh temp SQLite DB with `schema.sql` + migrations `001–023`. PG-1 verification compares live Postgres against expected tables, columns, Postgres types, nullability, defaults, primary keys, foreign keys, unique constraints, indexes, and partial-index predicates.

**Engine translations accounted for:**

| SQLite | Postgres |
|--------|----------|
| `DATETIME` / timestamp-like `TEXT` (`*_at`, etc.) | `TIMESTAMPTZ` |
| `REAL` | `DOUBLE PRECISION` |
| `INTEGER` flags | `INTEGER` (parity; no BOOLEAN conversion in PG-1) |
| JSON stored in `TEXT` | `TEXT` (parity; no JSONB in PG-1) |

---

### 5. Configuration contract: `DATABASE_URL` only

**Decision:** Postgres connectivity uses `DATABASE_URL` exclusively in PG-1. No `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` fallbacks. The application consumes the **exact** connection string supplied by Supabase — it does not construct, guess, or relabel connection URLs (direct vs pooler/session vs pooler/transaction).

**Reason:** Minimal configuration surface. Supabase documents multiple connection modes; operators choose the mode in Supabase and paste the resulting URL verbatim.

---

### 6. SSL remains deliberate and secure

**Decision:** `postgresConfig.ts` enables TLS with `rejectUnauthorized: true` for Supabase hosts and `sslmode=require|verify-*` URLs. Does **not** globally hardcode `rejectUnauthorized: false`.

**Reason:** Certificate verification must not be silently weakened. If Supabase connectivity requires adjustment, the issue is reported before changing verification policy.

---

### 7. Packages: `pg` + `@types/pg` only

**Decision:** No ORM, no `@supabase/supabase-js` in PG-1. Direct `pg` pool for migrations and verification.

---

### 8. SQLite path inconsistency deferred

**Decision:** `SQLITE_PATH` (used by `database.ts`) vs legacy `DB_PATH` (stub in `environment.ts`) inconsistency is **out of scope** for PG-1. Document as later cleanup; preserve existing SQLite behaviour exactly.

---

## Consequences

- `npm run verify:pg-1` validates Postgres when `DATABASE_URL` is set; exits **BLOCKED** (not FAIL) when unset.
- Local/Replit runtime unchanged (SQLite `app_data.db`).
- Future PG-2+ phases may introduce repository adapters, JSONB/BOOLEAN normalization, and server startup cutover.

---

## References

- Product guardrails: `CLAUDE.md`
- Local-first baseline: `docs/decisions/001-local-first-baseline.md`
- Dependency rules: `docs/architecture/DEPENDENCY_RULES.md`
