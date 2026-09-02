-- Migration 016: Add marketing_scope to campaigns and creative_artifacts
-- Scope describes the marketing context (brand voice, shop promotion, etc.)

ALTER TABLE campaigns ADD COLUMN marketing_scope TEXT DEFAULT NULL;
ALTER TABLE creative_artifacts ADD COLUMN marketing_scope TEXT DEFAULT NULL;
