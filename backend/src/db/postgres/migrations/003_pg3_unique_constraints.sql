-- PG-3A: Restore SQLite UNIQUE semantics for one-row-per-campaign tables.
-- Additive only: unique indexes, no data mutation.

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_briefs_campaign_id
  ON campaign_briefs (campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_approvals_campaign_id
  ON plan_approvals (campaign_id);
