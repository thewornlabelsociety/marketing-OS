-- Migration 023: Per-slide media asset on carousel source links.
-- Adds an optional media_asset_id to creative_source_links so that
-- MOS-owned uploaded media can be associated with individual carousel slides.
-- For WLS product carousels the image continues to resolve from source_records.image_urls.
ALTER TABLE creative_source_links ADD COLUMN media_asset_id TEXT REFERENCES media_assets(id);
