-- Migration 012: Truthful manual publication reconciliation provenance

ALTER TABLE publish_attempts ADD COLUMN resolution_method TEXT;
ALTER TABLE publish_attempts ADD COLUMN resolution_evidence TEXT;
ALTER TABLE publish_attempts ADD COLUMN resolved_at DATETIME;
