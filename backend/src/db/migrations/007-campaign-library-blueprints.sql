-- Migration 007: Campaign library and blueprints

CREATE TABLE IF NOT EXISTS campaign_library_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL UNIQUE,
  classifications TEXT NOT NULL DEFAULT '[]',
  archived_at DATETIME,
  cancellation_reason_type TEXT,
  cancellation_notes TEXT,
  evergreen INTEGER NOT NULL DEFAULT 0,
  seasonal TEXT,
  blueprint_candidate INTEGER NOT NULL DEFAULT 0,
  blueprint_id TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_workspace ON campaign_library_records(workspace_id);
CREATE INDEX IF NOT EXISTS idx_library_classifications ON campaign_library_records(workspace_id, archived_at);

CREATE TABLE IF NOT EXISTS campaign_blueprints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  objective_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (source_campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blueprints_workspace ON campaign_blueprints(workspace_id, status);

CREATE TABLE IF NOT EXISTS campaign_blueprint_versions (
  id TEXT PRIMARY KEY,
  blueprint_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  strategic_pattern TEXT NOT NULL DEFAULT '{}',
  content_pattern TEXT NOT NULL DEFAULT '[]',
  channel_pattern TEXT NOT NULL DEFAULT '[]',
  cadence_pattern TEXT,
  evidence_summary TEXT NOT NULL DEFAULT '{}',
  source_examples TEXT NOT NULL DEFAULT '[]',
  learned_why TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blueprint_id) REFERENCES campaign_blueprints(id) ON DELETE CASCADE,
  UNIQUE(blueprint_id, version)
);

CREATE TABLE IF NOT EXISTS blueprint_usages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  campaign_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (blueprint_id) REFERENCES campaign_blueprints(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blueprint_usages ON blueprint_usages(blueprint_id);

ALTER TABLE campaigns ADD COLUMN source_blueprint_id TEXT;
ALTER TABLE campaigns ADD COLUMN source_blueprint_version INTEGER;
