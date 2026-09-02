-- Migration 019: AI provenance tracking on creative artifacts

ALTER TABLE creative_artifacts ADD COLUMN ai_provider TEXT DEFAULT NULL;
ALTER TABLE creative_artifacts ADD COLUMN ai_model TEXT DEFAULT NULL;
ALTER TABLE creative_artifacts ADD COLUMN ai_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE creative_artifacts ADD COLUMN ai_task_type TEXT DEFAULT NULL;
