-- Phase 3N: link a selected media asset to the current creative artifact version.
-- Additive only. Existing rows get NULL (no media attached yet).
ALTER TABLE creative_artifacts ADD COLUMN media_asset_id TEXT REFERENCES media_assets(id);
