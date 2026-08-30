-- Migration 005: Scheduling and publishing

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  display_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publishing_destinations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  external_destination_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_content_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  source_creative_artifact_id TEXT NOT NULL,
  source_creative_version INTEGER NOT NULL,
  channel TEXT NOT NULL,
  destination_id TEXT,
  scheduled_for DATETIME NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  publication_mode TEXT NOT NULL DEFAULT 'MANUAL',
  media_assets TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  published_at DATETIME,
  external_publish_id TEXT,
  external_url TEXT,
  cancelled_at DATETIME,
  block_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_content_campaign ON scheduled_content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_content_due ON scheduled_content_items(status, scheduled_for);

CREATE TABLE IF NOT EXISTS publish_attempts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  provider_key TEXT NOT NULL,
  source_creative_artifact_id TEXT NOT NULL,
  source_creative_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  external_publish_id TEXT,
  external_url TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (schedule_id) REFERENCES scheduled_content_items(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_attempts_idempotency ON publish_attempts(idempotency_key) WHERE status = 'SUCCEEDED';
