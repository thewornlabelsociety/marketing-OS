-- Migration 022: Repurpose Support — Phase 4D
-- Adds: repurpose_requests table for durable idempotency reservation,
--       repurpose_request_id FK on creative_artifacts (child lookup),
--       marketing_scopes_json on creative_artifacts (multi-scope storage).

CREATE TABLE IF NOT EXISTS repurpose_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_artifact_id TEXT NOT NULL REFERENCES creative_artifacts(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, source_artifact_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_repurpose_requests_workspace_source
  ON repurpose_requests(workspace_id, source_artifact_id);

ALTER TABLE creative_artifacts ADD COLUMN repurpose_request_id TEXT DEFAULT NULL
  REFERENCES repurpose_requests(id);

ALTER TABLE creative_artifacts ADD COLUMN marketing_scopes_json TEXT DEFAULT NULL;
