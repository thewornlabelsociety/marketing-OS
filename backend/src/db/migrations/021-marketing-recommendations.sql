-- Migration 021: Marketing Recommendations — Phase 4B
-- Adds: marketing_recommendations table, recommendation_id on campaigns,
-- and operational throttle state on workspace_ai_budget.

CREATE TABLE IF NOT EXISTS marketing_recommendations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  recommendation_type TEXT NOT NULL,
  generation_source TEXT NOT NULL DEFAULT 'RULE_BASED',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  confidence REAL,
  marketing_scopes_json TEXT NOT NULL DEFAULT '[]',
  objective_id TEXT REFERENCES objectives(id) ON DELETE SET NULL,
  primary_channel TEXT NOT NULL,
  secondary_channels_json TEXT NOT NULL DEFAULT '[]',
  content_type TEXT,
  creative_direction TEXT,
  source_product_ids_json TEXT NOT NULL DEFAULT '[]',
  source_seller_ids_json TEXT NOT NULL DEFAULT '[]',
  hook TEXT,
  angle TEXT,
  cta TEXT,
  talking_points_json TEXT,
  suggested_duration_seconds INTEGER,
  accepted_campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  accepted_artifact_id TEXT REFERENCES creative_artifacts(id) ON DELETE SET NULL,
  expires_at TEXT,
  accepted_at TEXT,
  dismissed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_marketing_recommendations_workspace_status
  ON marketing_recommendations(workspace_id, status, priority DESC);

-- Lineage: which recommendation drove campaign creation
ALTER TABLE campaigns ADD COLUMN recommendation_id TEXT
  REFERENCES marketing_recommendations(id) ON DELETE SET NULL;

-- Operational throttle state — not brand knowledge, operational metadata
ALTER TABLE workspace_ai_budget
  ADD COLUMN last_recommendation_context_sig TEXT;
ALTER TABLE workspace_ai_budget
  ADD COLUMN last_recommendation_generated_at TEXT;
