-- Migration 003: Content Plans, revision requests, and approvals
-- CampaignPlan approval remains campaign-level APPROVED.
-- ContentPlan has its own artifact status and is not campaign lifecycle.

CREATE TABLE IF NOT EXISTS content_plans (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  source_plan_id TEXT NOT NULL,
  source_plan_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
  is_current INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_plan_revision_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  from_content_plan_id TEXT NOT NULL,
  from_content_plan_version INTEGER NOT NULL,
  resulting_content_plan_id TEXT,
  resulting_content_plan_version INTEGER,
  request_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_plan_approvals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  content_plan_id TEXT NOT NULL,
  content_plan_version INTEGER NOT NULL,
  approved_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);
