-- PG-6: SQLite schema parity for creative_derivations.
-- SQLite declares child_artifact_id TEXT NOT NULL UNIQUE — a child artifact can
-- belong to exactly one parent derivation. Postgres is missing this constraint
-- entirely, which prevents ON CONFLICT resolution during the SQLite→Postgres
-- data migration and leaves Postgres without a uniqueness guarantee that SQLite
-- enforces.
-- The table has no explicit composite primary key in either database; uniqueness
-- is on child_artifact_id alone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_creative_derivations_child_artifact_id
ON creative_derivations (child_artifact_id);
