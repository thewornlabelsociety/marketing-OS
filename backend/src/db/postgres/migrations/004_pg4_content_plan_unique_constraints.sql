-- PG-4A: Restore SQLite UNIQUE semantics required by
-- content-plan approval upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_plan_approvals_campaign_id
  ON content_plan_approvals (campaign_id);
