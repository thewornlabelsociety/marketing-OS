-- Migration 020: Workspace channel strategy configuration

CREATE TABLE IF NOT EXISTS workspace_channel_strategy (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  channels_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
