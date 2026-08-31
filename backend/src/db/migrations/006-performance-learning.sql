-- Migration 006: Performance, attribution, and learning

CREATE TABLE IF NOT EXISTS performance_observations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  schedule_id TEXT,
  content_key TEXT NOT NULL,
  source_creative_artifact_id TEXT NOT NULL,
  source_creative_version INTEGER NOT NULL,
  channel TEXT NOT NULL,
  provider_key TEXT,
  destination_id TEXT,
  external_publish_id TEXT,
  observed_at DATETIME NOT NULL,
  measurement_window TEXT NOT NULL DEFAULT '7_DAYS',
  metrics TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'MANUAL',
  raw_metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES scheduled_content_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_perf_obs_campaign ON performance_observations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_perf_obs_content ON performance_observations(campaign_id, content_key);
CREATE INDEX IF NOT EXISTS idx_perf_obs_schedule ON performance_observations(schedule_id);

CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  content_key TEXT,
  schedule_id TEXT,
  conversion_type TEXT NOT NULL,
  value REAL,
  currency TEXT,
  external_conversion_id TEXT,
  occurred_at DATETIME NOT NULL,
  attribution_model TEXT NOT NULL,
  attribution_confidence TEXT NOT NULL,
  attribution_evidence TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_external ON conversion_events(workspace_id, external_conversion_id)
  WHERE external_conversion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversion_campaign ON conversion_events(campaign_id);

CREATE TABLE IF NOT EXISTS performance_evaluations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  objective_type TEXT NOT NULL,
  measurement_window TEXT NOT NULL,
  classification TEXT NOT NULL,
  confidence TEXT NOT NULL,
  primary_kpi TEXT NOT NULL,
  primary_kpi_value REAL,
  score REAL,
  reasons TEXT NOT NULL DEFAULT '[]',
  evaluated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_perf_eval_campaign ON performance_evaluations(campaign_id, measurement_window);

CREATE TABLE IF NOT EXISTS workspace_learnings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'LOW',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  relevance_tags TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learnings_workspace ON workspace_learnings(workspace_id, status);

CREATE TABLE IF NOT EXISTS learning_evidence (
  id TEXT PRIMARY KEY,
  learning_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  observed_at DATETIME NOT NULL,
  weight REAL,
  FOREIGN KEY (learning_id) REFERENCES workspace_learnings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learning_evidence ON learning_evidence(learning_id);
