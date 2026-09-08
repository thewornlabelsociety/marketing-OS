-- PG-5A: Restore SQLite UNIQUE semantics required by
-- creative approval upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_creative_approvals_campaign_content_key
ON creative_approvals (campaign_id, content_key);
