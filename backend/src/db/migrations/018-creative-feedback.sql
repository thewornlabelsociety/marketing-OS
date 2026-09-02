-- Migration 018: Creative feedback for learning system

CREATE TABLE IF NOT EXISTS creative_feedback (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  artifact_id TEXT REFERENCES creative_artifacts(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  feedback_text TEXT,
  operator_decision TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL
);
