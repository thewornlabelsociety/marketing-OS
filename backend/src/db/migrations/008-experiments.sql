-- Migration 008: Experiment / A-B testing engine

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT NOT NULL,
  hypothesis_structured TEXT,
  experiment_type TEXT NOT NULL DEFAULT 'AB',
  objective_id TEXT NOT NULL,
  primary_kpi TEXT NOT NULL,
  experiment_kpi TEXT,
  experiment_kpi_rationale TEXT,
  guardrail_metrics TEXT NOT NULL DEFAULT '[]',
  variable_type TEXT NOT NULL,
  control_description TEXT NOT NULL,
  variant_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  mode TEXT NOT NULL DEFAULT 'OBSERVATIONAL_COMPARISON',
  minimum_evidence_policy TEXT NOT NULL DEFAULT '{}',
  minimum_meaningful_lift REAL,
  outcome TEXT,
  winner_variant_id TEXT,
  confidence TEXT,
  cancellation_reason TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (objective_id) REFERENCES objectives(id)
);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace ON experiments(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_experiments_campaign ON experiments(campaign_id);

CREATE TABLE IF NOT EXISTS experiment_variants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  content_key TEXT NOT NULL,
  creative_artifact_id TEXT NOT NULL,
  creative_version INTEGER NOT NULL,
  schedule_id TEXT,
  channel TEXT NOT NULL,
  destination_id TEXT,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiment_variants ON experiment_variants(experiment_id);

CREATE TABLE IF NOT EXISTS experiment_distributions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  schedule_id TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  channel TEXT NOT NULL,
  destination_id TEXT,
  estimated_audience INTEGER,
  actual_audience INTEGER,
  allocation_percentage REAL,
  mode TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES experiment_variants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiment_distributions ON experiment_distributions(experiment_id);

CREATE TABLE IF NOT EXISTS experiment_analyses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  measurement_window TEXT NOT NULL,
  analyzed_at DATETIME NOT NULL,
  primary_kpi TEXT NOT NULL,
  variant_results TEXT NOT NULL DEFAULT '[]',
  winner_variant_id TEXT,
  outcome TEXT NOT NULL,
  confidence TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  evidence_completeness TEXT NOT NULL DEFAULT 'PARTIAL',
  warnings TEXT NOT NULL DEFAULT '[]',
  campaign_objective_impact TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiment_analyses ON experiment_analyses(experiment_id, measurement_window);
