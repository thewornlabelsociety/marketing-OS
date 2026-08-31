-- Scope the external_conversion_id uniqueness to workspace so different workspaces
-- (including separate test runs) can reuse the same external identifiers.
DROP INDEX IF EXISTS idx_conversion_external;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_external
  ON conversion_events(workspace_id, external_conversion_id)
  WHERE external_conversion_id IS NOT NULL;
