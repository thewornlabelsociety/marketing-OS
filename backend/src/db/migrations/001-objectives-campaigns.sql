-- Migration 001: Add objectives and campaigns tables

CREATE TABLE IF NOT EXISTS objectives (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  objective_type TEXT NOT NULL,
  primary_kpi TEXT NOT NULL,
  supporting_kpis TEXT NOT NULL DEFAULT '[]',
  conversion_event TEXT,
  success_criteria TEXT,
  default_channels TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFTING',
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_title TEXT NOT NULL,
  source_description TEXT,
  source_metadata TEXT NOT NULL DEFAULT '{}',
  brief TEXT,
  channels TEXT NOT NULL DEFAULT '[]',
  cancellation_reason TEXT,
  scheduled_at DATETIME,
  published_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (objective_id) REFERENCES objectives(id)
);
