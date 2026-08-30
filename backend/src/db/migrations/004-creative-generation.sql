-- Migration 004: Creative artifacts, revision requests, and approvals

CREATE TABLE IF NOT EXISTS creative_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  source_content_plan_id TEXT NOT NULL,
  source_content_plan_version INTEGER NOT NULL,
  content_key TEXT NOT NULL,
  deliverable_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
  is_current INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL,
  content_type TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  quality TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creative_revision_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  creative_artifact_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  request_text TEXT NOT NULL,
  target_hint TEXT,
  resulting_artifact_id TEXT,
  resulting_version INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creative_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  creative_artifact_id TEXT NOT NULL,
  approved_version INTEGER NOT NULL,
  approved_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE(campaign_id, content_key)
);
