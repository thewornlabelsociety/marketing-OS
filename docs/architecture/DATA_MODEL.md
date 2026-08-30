# Data Model

## Current Schema (SQLite — Phase 2 Baseline)

The current schema (`backend/src/db/schema.sql`) was created for the Phase 2 baseline.
It uses `entities` as the workspace table and a simplified structure.

The canonical domain types are defined in `backend/src/types/`.

## Canonical Tables (Target Schema — Phase 3+)

### tenants
`id · plan_tier · license_key · created_at`

### workspaces
`id · tenant_id · name · slug · brand_brain JSON · automation_level · is_active · created_at · updated_at`

### objectives
`id · workspace_id (nullable) · name · description · objective_type · primary_kpi ·
supporting_kpis JSON · conversion_event · success_criteria · default_channels JSON ·
is_system · is_active · created_at · updated_at`

### offers
`id · workspace_id · offer_type · name · description · price · currency · sku ·
inventory · is_active · metadata JSON · created_at · updated_at`

### audiences
`id · workspace_id · name · description · demographics JSON · interests JSON ·
pain_points JSON · channels JSON · is_active · created_at · updated_at`

### campaigns
`id · workspace_id · objective_id · name · status · brief JSON · strategy JSON ·
channels JSON · scheduled_at · published_at · completed_at · cancellation_reason ·
created_at · updated_at`

### content_items
`id · workspace_id · campaign_id · content_type · channel · title · body · hook ·
cta · asset_ids JSON · status · version_number · parent_version_id · quality_check_passed ·
quality_issues JSON · created_at · updated_at`

### approvals
`id · workspace_id · target_type · target_id · status · revision_notes · approved_at ·
created_at · updated_at`

### performance_logs
`id · workspace_id · campaign_id · objective_id · channel · metrics JSON ·
classification · objective_score · recorded_at · created_at`

### experiments
`id · workspace_id · campaign_id · name · hypothesis · variant_a JSON · variant_b JSON ·
audience_id · channels JSON · start_date · end_date · status · metrics JSON ·
winner · confidence · learning · created_at · updated_at`

### memory_entries
`id · workspace_id · memory_type · key · value · confidence · source_type · source_id ·
created_at · updated_at`

### sops
`id · workspace_id · name · description · trigger · automation_level · steps JSON ·
is_active · created_at · updated_at`

### integrations
`id · workspace_id · provider · category · status · capabilities JSON · config JSON ·
last_sync_at · created_at · updated_at`

### publish_records
`id · workspace_id · campaign_id · content_id · channel · provider · status ·
scheduled_at · published_at · external_id · error_message · created_at · updated_at`

## Migration Strategy

Schema changes are managed through `backend/src/db/migrations/`.
Each migration is a numbered SQL file.
Migrations run on startup via `initDatabase()` after the base schema is applied.
