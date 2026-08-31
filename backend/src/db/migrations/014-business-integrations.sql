-- Generic, read-only business source integrations and normalized source records.
CREATE TABLE IF NOT EXISTS business_integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  capabilities TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL DEFAULT '{}',
  credential_ref TEXT,
  sync_checkpoint TEXT,
  last_attempted_sync_at TEXT,
  last_successful_sync_at TEXT,
  last_error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  image_urls TEXT NOT NULL DEFAULT '[]',
  price_amount REAL,
  price_currency TEXT,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE',
  occurred_at TEXT,
  source_updated_at TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id) REFERENCES business_integrations(id) ON DELETE CASCADE,
  UNIQUE(integration_id, external_id)
);

CREATE TABLE IF NOT EXISTS business_integration_credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT NOT NULL UNIQUE,
  encrypted_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id) REFERENCES business_integrations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_records_workspace_type
  ON source_records(workspace_id, source_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS creative_source_links (
  creative_artifact_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (creative_artifact_id, source_record_id),
  FOREIGN KEY (creative_artifact_id) REFERENCES creative_artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (source_record_id) REFERENCES source_records(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS creative_derivations (
  parent_artifact_id TEXT NOT NULL,
  child_artifact_id TEXT NOT NULL UNIQUE,
  relationship TEXT NOT NULL DEFAULT 'REPURPOSED_FROM',
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_artifact_id) REFERENCES creative_artifacts(id) ON DELETE RESTRICT,
  FOREIGN KEY (child_artifact_id) REFERENCES creative_artifacts(id) ON DELETE CASCADE
);
