# ADR 011 — PG-3A Migration-Aware Postgres Verification

**Date:** 2026-09-05
**Status:** Accepted

---

## Context

PG-1 established a squashed Postgres baseline (`001_mos_baseline.sql`, `002_system_objectives_seed.sql`) and compared live Supabase schema against `sqliteSchemaManifest.json`. PG-3A applied forward migration `003_pg3_unique_constraints.sql` to restore SQLite one-row-per-campaign uniqueness on `campaign_briefs.campaign_id` and `plan_approvals.campaign_id`.

PG-1 verification initially hardcoded “exactly two migrations (001, 002)” and treated the baseline manifest as the full effective schema. That rejected legitimate forward migration 003 and could not represent additive indexes without regenerating the baseline manifest.

---

## Decisions

### 1. Accepted migration registry (explicit forward acceptance)

**Decision:** Maintain `acceptedMigrations.ts` with pinned SHA-256 checksums for every accepted migration file. Baseline migrations 001 and 002 are always required. Forward migrations (003+) are registered intentionally; unregistered `.sql` files on disk fail verification.

**Reason:** Prevents silently trusting arbitrary new SQL while allowing intentional 004+ registration without rewriting the baseline concept.

---

### 2. Baseline schema manifest remains immutable squashed representation

**Decision:** `sqliteSchemaManifest.json` continues to represent the PG-1 squashed baseline only (51 tables, 29 non-PK indexes). Do not regenerate it to absorb Postgres-only forward migration indexes.

**Reason:** Baseline manifest documents the original SQLite-derived squashed state. Forward deltas belong to migration-scoped expectations.

---

### 3. Additive migration expectations

**Decision:** Maintain `forwardMigrationExpectations.ts` describing schema objects introduced by accepted forward migrations. Effective expected schema:

`baseline manifest + additive expectations from accepted forward migrations`

Migration 003 registers two unique indexes:
- `uq_campaign_briefs_campaign_id` on `campaign_briefs(campaign_id)`
- `uq_plan_approvals_campaign_id` on `plan_approvals(campaign_id)`

**Reason:** Explicit verification of forward migration artifacts without weakening baseline comparison or allowing arbitrary extra objects.

---

### 4. Separated index counts

**Decision:** PG-1 reports and verifies:
- baseline non-PK indexes: 29
- additive accepted migration indexes: 2 (current)
- effective expected non-PK indexes: 31

**Reason:** Future 004+ migrations can add additive indexes without conflating baseline manifest cardinality.

---

### 5. Live tracking integrity

**Decision:** Verification requires live `postgres_migrations` rows to match the accepted registry exactly (filename set, checksums, no duplicates). Migration runner idempotent rerun and checksum mismatch protection remain required.

---

## Consequences

- Adding migration 004 requires: new `.sql` file, registry entry with pinned checksum, additive expectations if schema objects are introduced, and verification rerun.
- PG-1 live schema checks split into baseline manifest parity and additive forward expectations.
- PG-2/PG-3A checksum guards import the shared accepted migration registry.

---

## References

- ADR 009 — PG-1 Supabase Postgres Foundation
- ADR 010 — PG-2 Core Domain Postgres Parity
- Migration 003: `003_pg3_unique_constraints.sql`
