CREATE TABLE IF NOT EXISTS attention_signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  campaign_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL DEFAULT '0',
  title TEXT NOT NULL,
  summary TEXT,
  action_label TEXT,
  action_target TEXT,
  dismissible INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, signal_key)
);

CREATE INDEX IF NOT EXISTS idx_attention_workspace_status ON attention_signals(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_attention_campaign ON attention_signals(campaign_id);
