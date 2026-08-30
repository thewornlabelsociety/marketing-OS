-- Migration 011: Canonical media assets and publication media lineage

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  campaign_id TEXT,
  content_key TEXT,
  creative_artifact_id TEXT,
  creative_version INTEGER,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  checksum TEXT NOT NULL,
  original_filename TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_workspace ON media_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_creative ON media_assets(campaign_id, content_key, creative_artifact_id, creative_version);

ALTER TABLE publish_attempts ADD COLUMN media_asset_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE publish_attempts ADD COLUMN media_checksums TEXT NOT NULL DEFAULT '[]';
ALTER TABLE publish_attempts ADD COLUMN media_delivery_metadata TEXT;

ALTER TABLE performance_observations ADD COLUMN media_asset_id TEXT;
