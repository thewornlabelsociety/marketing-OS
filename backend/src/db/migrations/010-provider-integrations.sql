-- Migration 010: Provider integrations (Meta publishing + performance)

ALTER TABLE integration_connections ADD COLUMN provider_account_id TEXT;
ALTER TABLE integration_connections ADD COLUMN provider_account_name TEXT;
ALTER TABLE integration_connections ADD COLUMN access_credential_ref TEXT;
ALTER TABLE integration_connections ADD COLUMN refresh_credential_ref TEXT;
ALTER TABLE integration_connections ADD COLUMN expires_at DATETIME;
ALTER TABLE integration_connections ADD COLUMN scopes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE integration_connections ADD COLUMN last_verified_at DATETIME;
ALTER TABLE integration_connections ADD COLUMN last_error_code TEXT;
ALTER TABLE integration_connections ADD COLUMN last_error_summary TEXT;

ALTER TABLE publishing_destinations ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]';

ALTER TABLE publish_attempts ADD COLUMN destination_id TEXT;
ALTER TABLE publish_attempts ADD COLUMN connection_id TEXT;
ALTER TABLE publish_attempts ADD COLUMN provider_status TEXT;
ALTER TABLE publish_attempts ADD COLUMN error_category TEXT;

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_connection ON provider_credentials(connection_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
