-- Migration 015: Add creative_direction to creative_artifacts (EDITORIAL / PRODUCT_LED / MINIMAL)
ALTER TABLE creative_artifacts ADD COLUMN creative_direction TEXT DEFAULT NULL;
