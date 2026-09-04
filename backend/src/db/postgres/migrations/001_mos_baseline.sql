-- Migration 001: MOS canonical Postgres baseline (squashed from SQLite schema.sql + migrations 001-023)

-- Table: ai_usage_records
CREATE TABLE IF NOT EXISTS "ai_usage_records" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "task_type" TEXT NOT NULL,
  "artifact_id" TEXT,
  "campaign_id" TEXT,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimated_cost_nzd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fx_rate_used" DOUBLE PRECISION NOT NULL DEFAULT 1.64,
  "fx_rate_source" TEXT NOT NULL DEFAULT 'static',
  "created_at" TIMESTAMPTZ NOT NULL
);

-- Table: attention_signals
CREATE TABLE IF NOT EXISTS "attention_signals" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "signal_key" TEXT NOT NULL,
  "signal_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "campaign_id" TEXT,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_version" TEXT NOT NULL DEFAULT '0',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "action_label" TEXT,
  "action_target" TEXT,
  "dismissible" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "detected_at" TIMESTAMPTZ NOT NULL,
  "resolved_at" TIMESTAMPTZ,
  "dismissed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: blueprint_usages
CREATE TABLE IF NOT EXISTS "blueprint_usages" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "blueprint_id" TEXT NOT NULL,
  "blueprint_version" INTEGER NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: business_integration_credentials
CREATE TABLE IF NOT EXISTS "business_integration_credentials" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "integration_id" TEXT NOT NULL,
  "encrypted_value" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: business_integrations
CREATE TABLE IF NOT EXISTS "business_integrations" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "integration_type" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "capabilities" TEXT NOT NULL DEFAULT '[]',
  "config" TEXT NOT NULL DEFAULT '{}',
  "credential_ref" TEXT,
  "sync_checkpoint" TEXT,
  "last_attempted_sync_at" TIMESTAMPTZ,
  "last_successful_sync_at" TIMESTAMPTZ,
  "last_error_summary" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: campaign_blueprint_versions
CREATE TABLE IF NOT EXISTS "campaign_blueprint_versions" (
  "id" TEXT PRIMARY KEY,
  "blueprint_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "strategic_pattern" TEXT NOT NULL DEFAULT '{}',
  "content_pattern" TEXT NOT NULL DEFAULT '[]',
  "channel_pattern" TEXT NOT NULL DEFAULT '[]',
  "cadence_pattern" TEXT,
  "evidence_summary" TEXT NOT NULL DEFAULT '{}',
  "source_examples" TEXT NOT NULL DEFAULT '[]',
  "learned_why" TEXT NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: campaign_blueprints
CREATE TABLE IF NOT EXISTS "campaign_blueprints" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "source_campaign_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "objective_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: campaign_briefs
CREATE TABLE IF NOT EXISTS "campaign_briefs" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "source_summary" TEXT,
  "objective_summary" TEXT,
  "audience_description" TEXT,
  "audience_segment" TEXT,
  "audience_problem" TEXT,
  "audience_desire" TEXT,
  "proposition" TEXT,
  "key_details" TEXT NOT NULL DEFAULT '[]',
  "offer_description" TEXT,
  "offer_value" TEXT,
  "offer_urgency" TEXT,
  "offer_constraints" TEXT NOT NULL DEFAULT '[]',
  "timing_start_date" TEXT,
  "timing_end_date" TEXT,
  "timing_important_dates" TEXT NOT NULL DEFAULT '[]',
  "constraints" TEXT NOT NULL DEFAULT '[]',
  "additional_context" TEXT,
  "completeness_status" TEXT NOT NULL DEFAULT 'NEEDS_INPUT',
  "completeness_missing_fields" TEXT NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: campaign_library_records
CREATE TABLE IF NOT EXISTS "campaign_library_records" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "classifications" TEXT NOT NULL DEFAULT '[]',
  "archived_at" TIMESTAMPTZ,
  "cancellation_reason_type" TEXT,
  "cancellation_notes" TEXT,
  "evergreen" INTEGER NOT NULL DEFAULT 0,
  "seasonal" TEXT,
  "blueprint_candidate" INTEGER NOT NULL DEFAULT 0,
  "blueprint_id" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: campaign_plans
CREATE TABLE IF NOT EXISTS "campaign_plans" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "is_current" INTEGER NOT NULL DEFAULT 1,
  "strategy_campaign_angle" TEXT,
  "strategy_core_message" TEXT,
  "strategy_proposition" TEXT,
  "strategy_audience_focus" TEXT,
  "hooks" TEXT NOT NULL DEFAULT '{"primary":"","supporting":[]}',
  "proof_points" TEXT NOT NULL DEFAULT '[]',
  "cta_primary" TEXT,
  "cta_alternatives" TEXT NOT NULL DEFAULT '[]',
  "channels" TEXT NOT NULL DEFAULT '[]',
  "content_mix" TEXT NOT NULL DEFAULT '[]',
  "cadence_summary" TEXT,
  "cadence_duration" TEXT,
  "creative_visual_direction" TEXT,
  "creative_photography_direction" TEXT,
  "creative_video_direction" TEXT,
  "creative_copy_direction" TEXT,
  "measurement_objective" TEXT,
  "measurement_primary_kpi" TEXT,
  "measurement_supporting_kpis" TEXT NOT NULL DEFAULT '[]',
  "measurement_conversion_event" TEXT,
  "rationale_summary" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: campaigns
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "objective_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFTING',
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "source_title" TEXT NOT NULL,
  "source_description" TEXT,
  "source_metadata" TEXT NOT NULL DEFAULT '{}',
  "brief" TEXT,
  "channels" TEXT NOT NULL DEFAULT '[]',
  "cancellation_reason" TEXT,
  "scheduled_at" TIMESTAMPTZ,
  "published_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "source_blueprint_id" TEXT,
  "source_blueprint_version" INTEGER,
  "marketing_scope" TEXT DEFAULT NULL,
  "recommendation_id" TEXT
);

-- Table: content_items
CREATE TABLE IF NOT EXISTS "content_items" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body_markdown" TEXT,
  "assets" TEXT DEFAULT '[]',
  "status" TEXT DEFAULT 'draft',
  "target_channels" TEXT DEFAULT '[]',
  "scheduled_for" TIMESTAMPTZ,
  "is_archived" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: content_plan_approvals
CREATE TABLE IF NOT EXISTS "content_plan_approvals" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "content_plan_id" TEXT NOT NULL,
  "content_plan_version" INTEGER NOT NULL,
  "approved_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: content_plan_revision_requests
CREATE TABLE IF NOT EXISTS "content_plan_revision_requests" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "from_content_plan_id" TEXT NOT NULL,
  "from_content_plan_version" INTEGER NOT NULL,
  "resulting_content_plan_id" TEXT,
  "resulting_content_plan_version" INTEGER,
  "request_text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: content_plans
CREATE TABLE IF NOT EXISTS "content_plans" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "source_plan_id" TEXT NOT NULL,
  "source_plan_version" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
  "is_current" INTEGER NOT NULL DEFAULT 1,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: conversion_events
CREATE TABLE IF NOT EXISTS "conversion_events" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "content_key" TEXT,
  "schedule_id" TEXT,
  "conversion_type" TEXT NOT NULL,
  "value" DOUBLE PRECISION,
  "currency" TEXT,
  "external_conversion_id" TEXT,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "attribution_model" TEXT NOT NULL,
  "attribution_confidence" TEXT NOT NULL,
  "attribution_evidence" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "metadata" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: creative_approvals
CREATE TABLE IF NOT EXISTS "creative_approvals" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "content_key" TEXT NOT NULL,
  "creative_artifact_id" TEXT NOT NULL,
  "approved_version" INTEGER NOT NULL,
  "approved_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: creative_artifacts
CREATE TABLE IF NOT EXISTS "creative_artifacts" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "source_content_plan_id" TEXT NOT NULL,
  "source_content_plan_version" INTEGER NOT NULL,
  "content_key" TEXT NOT NULL,
  "deliverable_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
  "is_current" INTEGER NOT NULL DEFAULT 1,
  "channel" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "quality" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "media_asset_id" TEXT,
  "creative_direction" TEXT DEFAULT NULL,
  "marketing_scope" TEXT DEFAULT NULL,
  "ai_provider" TEXT DEFAULT NULL,
  "ai_model" TEXT DEFAULT NULL,
  "ai_generated" INTEGER NOT NULL DEFAULT 0,
  "ai_task_type" TEXT DEFAULT NULL,
  "repurpose_request_id" TEXT DEFAULT NULL,
  "marketing_scopes_json" TEXT DEFAULT NULL
);

-- Table: creative_derivations
CREATE TABLE IF NOT EXISTS "creative_derivations" (
  "parent_artifact_id" TEXT NOT NULL,
  "child_artifact_id" TEXT NOT NULL,
  "relationship" TEXT NOT NULL DEFAULT 'REPURPOSED_FROM',
  "created_at" TIMESTAMPTZ NOT NULL
);

-- Table: creative_feedback
CREATE TABLE IF NOT EXISTS "creative_feedback" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "artifact_id" TEXT,
  "campaign_id" TEXT,
  "feedback_type" TEXT NOT NULL,
  "sentiment" TEXT NOT NULL,
  "feedback_text" TEXT,
  "operator_decision" TEXT,
  "context_json" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL
);

-- Table: creative_revision_requests
CREATE TABLE IF NOT EXISTS "creative_revision_requests" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "content_key" TEXT NOT NULL,
  "creative_artifact_id" TEXT NOT NULL,
  "source_version" INTEGER NOT NULL,
  "request_text" TEXT NOT NULL,
  "target_hint" TEXT,
  "resulting_artifact_id" TEXT,
  "resulting_version" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: creative_source_links
CREATE TABLE IF NOT EXISTS "creative_source_links" (
  "creative_artifact_id" TEXT NOT NULL,
  "source_record_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "media_asset_id" TEXT,
  PRIMARY KEY ("creative_artifact_id", "source_record_id")
);

-- Table: entities
CREATE TABLE IF NOT EXISTS "entities" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "brand_kit" TEXT NOT NULL,
  "api_keys" TEXT DEFAULT '{}',
  "is_archived" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: experiment_analyses
CREATE TABLE IF NOT EXISTS "experiment_analyses" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "measurement_window" TEXT NOT NULL,
  "analyzed_at" TIMESTAMPTZ NOT NULL,
  "primary_kpi" TEXT NOT NULL,
  "variant_results" TEXT NOT NULL DEFAULT '[]',
  "winner_variant_id" TEXT,
  "outcome" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "evidence_completeness" TEXT NOT NULL DEFAULT 'PARTIAL',
  "warnings" TEXT NOT NULL DEFAULT '[]',
  "campaign_objective_impact" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: experiment_distributions
CREATE TABLE IF NOT EXISTS "experiment_distributions" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "schedule_id" TEXT,
  "started_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "channel" TEXT NOT NULL,
  "destination_id" TEXT,
  "estimated_audience" INTEGER,
  "actual_audience" INTEGER,
  "allocation_percentage" DOUBLE PRECISION,
  "mode" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: experiment_variants
CREATE TABLE IF NOT EXISTS "experiment_variants" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content_key" TEXT NOT NULL,
  "creative_artifact_id" TEXT NOT NULL,
  "creative_version" INTEGER NOT NULL,
  "schedule_id" TEXT,
  "channel" TEXT NOT NULL,
  "destination_id" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: experiments
CREATE TABLE IF NOT EXISTS "experiments" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "hypothesis" TEXT NOT NULL,
  "hypothesis_structured" TEXT,
  "experiment_type" TEXT NOT NULL DEFAULT 'AB',
  "objective_id" TEXT NOT NULL,
  "primary_kpi" TEXT NOT NULL,
  "experiment_kpi" TEXT,
  "experiment_kpi_rationale" TEXT,
  "guardrail_metrics" TEXT NOT NULL DEFAULT '[]',
  "variable_type" TEXT NOT NULL,
  "control_description" TEXT NOT NULL,
  "variant_description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "mode" TEXT NOT NULL DEFAULT 'OBSERVATIONAL_COMPARISON',
  "minimum_evidence_policy" TEXT NOT NULL DEFAULT '{}',
  "minimum_meaningful_lift" DOUBLE PRECISION,
  "outcome" TEXT,
  "winner_variant_id" TEXT,
  "confidence" TEXT,
  "cancellation_reason" TEXT,
  "started_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: intake_queue
CREATE TABLE IF NOT EXISTS "intake_queue" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "brand" TEXT,
  "title" TEXT,
  "fabric" TEXT,
  "price" DOUBLE PRECISION,
  "photos" TEXT DEFAULT '[]',
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: integration_connections
CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "provider_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "display_name" TEXT NOT NULL,
  "capabilities" TEXT NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "provider_account_id" TEXT,
  "provider_account_name" TEXT,
  "access_credential_ref" TEXT,
  "refresh_credential_ref" TEXT,
  "expires_at" TIMESTAMPTZ,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "last_verified_at" TIMESTAMPTZ,
  "last_error_code" TEXT,
  "last_error_summary" TEXT
);

-- Table: learning_evidence
CREATE TABLE IF NOT EXISTS "learning_evidence" (
  "id" TEXT PRIMARY KEY,
  "learning_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "observed_at" TIMESTAMPTZ NOT NULL,
  "weight" DOUBLE PRECISION
);

-- Table: marketing_recommendations
CREATE TABLE IF NOT EXISTS "marketing_recommendations" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "recommendation_type" TEXT NOT NULL,
  "generation_source" TEXT NOT NULL DEFAULT 'RULE_BASED',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "confidence" DOUBLE PRECISION,
  "marketing_scopes_json" TEXT NOT NULL DEFAULT '[]',
  "objective_id" TEXT,
  "primary_channel" TEXT NOT NULL,
  "secondary_channels_json" TEXT NOT NULL DEFAULT '[]',
  "content_type" TEXT,
  "creative_direction" TEXT,
  "source_product_ids_json" TEXT NOT NULL DEFAULT '[]',
  "source_seller_ids_json" TEXT NOT NULL DEFAULT '[]',
  "hook" TEXT,
  "angle" TEXT,
  "cta" TEXT,
  "talking_points_json" TEXT,
  "suggested_duration_seconds" INTEGER,
  "accepted_campaign_id" TEXT,
  "accepted_artifact_id" TEXT,
  "expires_at" TIMESTAMPTZ,
  "accepted_at" TIMESTAMPTZ,
  "dismissed_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: media_assets
CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT,
  "content_key" TEXT,
  "creative_artifact_id" TEXT,
  "creative_version" INTEGER,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksum" TEXT NOT NULL,
  "original_filename" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: oauth_states
CREATE TABLE IF NOT EXISTS "oauth_states" (
  "state" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "provider_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL
);

-- Table: objectives
CREATE TABLE IF NOT EXISTS "objectives" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "objective_type" TEXT NOT NULL,
  "primary_kpi" TEXT NOT NULL,
  "supporting_kpis" TEXT NOT NULL DEFAULT '[]',
  "conversion_event" TEXT,
  "success_criteria" TEXT,
  "default_channels" TEXT NOT NULL DEFAULT '[]',
  "is_system" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: performance_evaluations
CREATE TABLE IF NOT EXISTS "performance_evaluations" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "objective_id" TEXT NOT NULL,
  "objective_type" TEXT NOT NULL,
  "measurement_window" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "primary_kpi" TEXT NOT NULL,
  "primary_kpi_value" DOUBLE PRECISION,
  "score" DOUBLE PRECISION,
  "reasons" TEXT NOT NULL DEFAULT '[]',
  "evaluated_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: performance_logs
CREATE TABLE IF NOT EXISTS "performance_logs" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "impressions" INTEGER DEFAULT 0,
  "revenue" DOUBLE PRECISION DEFAULT 0.0,
  "conversions" INTEGER DEFAULT 0,
  "hook" TEXT,
  "ai_learnings" TEXT,
  "is_synced_to_vault" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: performance_observations
CREATE TABLE IF NOT EXISTS "performance_observations" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "schedule_id" TEXT,
  "content_key" TEXT NOT NULL,
  "source_creative_artifact_id" TEXT NOT NULL,
  "source_creative_version" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "provider_key" TEXT,
  "destination_id" TEXT,
  "external_publish_id" TEXT,
  "observed_at" TIMESTAMPTZ NOT NULL,
  "measurement_window" TEXT NOT NULL DEFAULT '7_DAYS',
  "metrics" TEXT NOT NULL DEFAULT '{}',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "raw_metadata" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "media_asset_id" TEXT
);

-- Table: plan_approvals
CREATE TABLE IF NOT EXISTS "plan_approvals" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "approved_plan_id" TEXT NOT NULL,
  "approved_version" INTEGER NOT NULL,
  "approved_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: provider_credentials
CREATE TABLE IF NOT EXISTS "provider_credentials" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "credential_type" TEXT NOT NULL,
  "encrypted_value" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: publish_attempts
CREATE TABLE IF NOT EXISTS "publish_attempts" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "provider_key" TEXT NOT NULL,
  "source_creative_artifact_id" TEXT NOT NULL,
  "source_creative_version" INTEGER NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "external_publish_id" TEXT,
  "external_url" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "destination_id" TEXT,
  "connection_id" TEXT,
  "provider_status" TEXT,
  "error_category" TEXT,
  "media_asset_ids" TEXT NOT NULL DEFAULT '[]',
  "media_checksums" TEXT NOT NULL DEFAULT '[]',
  "media_delivery_metadata" TEXT,
  "resolution_method" TEXT,
  "resolution_evidence" TEXT,
  "resolved_at" TIMESTAMPTZ
);

-- Table: publishing_destinations
CREATE TABLE IF NOT EXISTS "publishing_destinations" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "provider_key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "external_destination_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "capabilities" TEXT NOT NULL DEFAULT '[]'
);

-- Table: recurring_drop_templates
CREATE TABLE IF NOT EXISTS "recurring_drop_templates" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" INTEGER DEFAULT 1,
  "slots" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: repurpose_requests
CREATE TABLE IF NOT EXISTS "repurpose_requests" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "source_artifact_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: revision_requests
CREATE TABLE IF NOT EXISTS "revision_requests" (
  "id" TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "from_plan_id" TEXT NOT NULL,
  "from_plan_version" INTEGER NOT NULL,
  "request_text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: scheduled_content_items
CREATE TABLE IF NOT EXISTS "scheduled_content_items" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "content_key" TEXT NOT NULL,
  "source_creative_artifact_id" TEXT NOT NULL,
  "source_creative_version" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "destination_id" TEXT,
  "scheduled_for" TIMESTAMPTZ NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "publication_mode" TEXT NOT NULL DEFAULT 'MANUAL',
  "media_assets" TEXT NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "published_at" TIMESTAMPTZ,
  "external_publish_id" TEXT,
  "external_url" TEXT,
  "cancelled_at" TIMESTAMPTZ,
  "block_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: sops
CREATE TABLE IF NOT EXISTS "sops" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "recurrence" TEXT DEFAULT 'one_time',
  "steps" TEXT NOT NULL,
  "last_completed_at" TIMESTAMPTZ,
  "is_archived" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: source_records
CREATE TABLE IF NOT EXISTS "source_records" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "integration_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "description" TEXT,
  "image_urls" TEXT NOT NULL DEFAULT '[]',
  "price_amount" DOUBLE PRECISION,
  "price_currency" TEXT,
  "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "occurred_at" TIMESTAMPTZ,
  "source_updated_at" TIMESTAMPTZ,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "last_synced_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: tenants
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" TEXT PRIMARY KEY,
  "plan_tier" TEXT DEFAULT 'pro',
  "license_key" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Table: workspace_ai_budget
CREATE TABLE IF NOT EXISTS "workspace_ai_budget" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "monthly_limit_usd" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  "alert_threshold_pct" INTEGER NOT NULL DEFAULT 80,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "last_recommendation_context_sig" TEXT,
  "last_recommendation_generated_at" TIMESTAMPTZ
);

-- Table: workspace_channel_strategy
CREATE TABLE IF NOT EXISTS "workspace_channel_strategy" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "channels_json" TEXT NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);

-- Table: workspace_learnings
CREATE TABLE IF NOT EXISTS "workspace_learnings" (
  "id" TEXT PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'LOW',
  "evidence_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
  "relevance_tags" TEXT NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign keys
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "blueprint_usages" ADD CONSTRAINT "blueprint_usages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "blueprint_usages" ADD CONSTRAINT "blueprint_usages_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "campaign_blueprints" ("id") ON DELETE CASCADE;
ALTER TABLE "blueprint_usages" ADD CONSTRAINT "blueprint_usages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "business_integration_credentials" ADD CONSTRAINT "business_integration_credentials_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "business_integrations" ("id") ON DELETE CASCADE;
ALTER TABLE "business_integration_credentials" ADD CONSTRAINT "business_integration_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "business_integrations" ADD CONSTRAINT "business_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_blueprint_versions" ADD CONSTRAINT "campaign_blueprint_versions_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "campaign_blueprints" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_blueprints" ADD CONSTRAINT "campaign_blueprints_source_campaign_id_fkey" FOREIGN KEY ("source_campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_blueprints" ADD CONSTRAINT "campaign_blueprints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_briefs" ADD CONSTRAINT "campaign_briefs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_briefs" ADD CONSTRAINT "campaign_briefs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_library_records" ADD CONSTRAINT "campaign_library_records_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_library_records" ADD CONSTRAINT "campaign_library_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_plans" ADD CONSTRAINT "campaign_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_plans" ADD CONSTRAINT "campaign_plans_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives" ("id");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "marketing_recommendations" ("id") ON DELETE SET NULL;
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plan_approvals" ADD CONSTRAINT "content_plan_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plan_approvals" ADD CONSTRAINT "content_plan_approvals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plan_revision_requests" ADD CONSTRAINT "content_plan_revision_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plan_revision_requests" ADD CONSTRAINT "content_plan_revision_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_approvals" ADD CONSTRAINT "creative_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_approvals" ADD CONSTRAINT "creative_approvals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_artifacts" ADD CONSTRAINT "creative_artifacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_artifacts" ADD CONSTRAINT "creative_artifacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_artifacts" ADD CONSTRAINT "creative_artifacts_repurpose_request_id_fkey" FOREIGN KEY ("repurpose_request_id") REFERENCES "repurpose_requests" ("id");
ALTER TABLE "creative_artifacts" ADD CONSTRAINT "creative_artifacts_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id");
ALTER TABLE "creative_derivations" ADD CONSTRAINT "creative_derivations_child_artifact_id_fkey" FOREIGN KEY ("child_artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_derivations" ADD CONSTRAINT "creative_derivations_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE RESTRICT;
ALTER TABLE "creative_feedback" ADD CONSTRAINT "creative_feedback_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL;
ALTER TABLE "creative_feedback" ADD CONSTRAINT "creative_feedback_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE SET NULL;
ALTER TABLE "creative_feedback" ADD CONSTRAINT "creative_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_revision_requests" ADD CONSTRAINT "creative_revision_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_revision_requests" ADD CONSTRAINT "creative_revision_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_source_links" ADD CONSTRAINT "creative_source_links_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "source_records" ("id") ON DELETE RESTRICT;
ALTER TABLE "creative_source_links" ADD CONSTRAINT "creative_source_links_creative_artifact_id_fkey" FOREIGN KEY ("creative_artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE CASCADE;
ALTER TABLE "creative_source_links" ADD CONSTRAINT "creative_source_links_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id");
ALTER TABLE "entities" ADD CONSTRAINT "entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_analyses" ADD CONSTRAINT "experiment_analyses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_distributions" ADD CONSTRAINT "experiment_distributions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "experiment_variants" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_distributions" ADD CONSTRAINT "experiment_distributions_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_distributions" ADD CONSTRAINT "experiment_distributions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments" ("id") ON DELETE CASCADE;
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives" ("id");
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "intake_queue" ADD CONSTRAINT "intake_queue_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_learning_id_fkey" FOREIGN KEY ("learning_id") REFERENCES "workspace_learnings" ("id") ON DELETE CASCADE;
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_accepted_artifact_id_fkey" FOREIGN KEY ("accepted_artifact_id") REFERENCES "creative_artifacts" ("id") ON DELETE SET NULL;
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_accepted_campaign_id_fkey" FOREIGN KEY ("accepted_campaign_id") REFERENCES "campaigns" ("id") ON DELETE SET NULL;
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objectives" ("id") ON DELETE SET NULL;
ALTER TABLE "marketing_recommendations" ADD CONSTRAINT "marketing_recommendations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_logs" ADD CONSTRAINT "performance_logs_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_logs" ADD CONSTRAINT "performance_logs_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_items" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "scheduled_content_items" ("id") ON DELETE SET NULL;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "plan_approvals" ADD CONSTRAINT "plan_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "plan_approvals" ADD CONSTRAINT "plan_approvals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections" ("id") ON DELETE CASCADE;
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "scheduled_content_items" ("id") ON DELETE CASCADE;
ALTER TABLE "publishing_destinations" ADD CONSTRAINT "publishing_destinations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections" ("id") ON DELETE CASCADE;
ALTER TABLE "publishing_destinations" ADD CONSTRAINT "publishing_destinations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "recurring_drop_templates" ADD CONSTRAINT "recurring_drop_templates_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "repurpose_requests" ADD CONSTRAINT "repurpose_requests_source_artifact_id_fkey" FOREIGN KEY ("source_artifact_id") REFERENCES "creative_artifacts" ("id");
ALTER TABLE "repurpose_requests" ADD CONSTRAINT "repurpose_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "scheduled_content_items" ADD CONSTRAINT "scheduled_content_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "scheduled_content_items" ADD CONSTRAINT "scheduled_content_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "sops" ADD CONSTRAINT "sops_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "business_integrations" ("id") ON DELETE CASCADE;
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "workspace_ai_budget" ADD CONSTRAINT "workspace_ai_budget_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "workspace_channel_strategy" ADD CONSTRAINT "workspace_channel_strategy_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;
ALTER TABLE "workspace_learnings" ADD CONSTRAINT "workspace_learnings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "entities" ("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_attention_campaign ON attention_signals(campaign_id);
CREATE INDEX idx_attention_workspace_status ON attention_signals(workspace_id, status);
CREATE INDEX idx_blueprint_usages ON blueprint_usages(blueprint_id);
CREATE INDEX idx_blueprints_workspace ON campaign_blueprints(workspace_id, status);
CREATE INDEX idx_conversion_campaign ON conversion_events(campaign_id);
CREATE UNIQUE INDEX idx_conversion_external ON conversion_events(workspace_id, external_conversion_id) WHERE external_conversion_id IS NOT NULL;
CREATE INDEX idx_experiment_analyses ON experiment_analyses(experiment_id, measurement_window);
CREATE INDEX idx_experiment_distributions ON experiment_distributions(experiment_id);
CREATE INDEX idx_experiment_variants ON experiment_variants(experiment_id);
CREATE INDEX idx_experiments_campaign ON experiments(campaign_id);
CREATE INDEX idx_experiments_workspace ON experiments(workspace_id, status);
CREATE INDEX idx_learning_evidence ON learning_evidence(learning_id);
CREATE INDEX idx_learnings_workspace ON workspace_learnings(workspace_id, status);
CREATE INDEX idx_library_classifications ON campaign_library_records(workspace_id, archived_at);
CREATE INDEX idx_library_workspace ON campaign_library_records(workspace_id);
CREATE INDEX idx_marketing_recommendations_workspace_status ON marketing_recommendations(workspace_id, status, priority DESC);
CREATE INDEX idx_media_assets_creative ON media_assets(campaign_id, content_key, creative_artifact_id, creative_version);
CREATE INDEX idx_media_assets_workspace ON media_assets(workspace_id);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX idx_perf_eval_campaign ON performance_evaluations(campaign_id, measurement_window);
CREATE INDEX idx_perf_obs_campaign ON performance_observations(campaign_id);
CREATE INDEX idx_perf_obs_content ON performance_observations(campaign_id, content_key);
CREATE INDEX idx_perf_obs_schedule ON performance_observations(schedule_id);
CREATE INDEX idx_provider_credentials_connection ON provider_credentials(connection_id);
CREATE UNIQUE INDEX idx_publish_attempts_idempotency ON publish_attempts(idempotency_key) WHERE status = 'SUCCEEDED';
CREATE INDEX idx_repurpose_requests_workspace_source ON repurpose_requests(workspace_id, source_artifact_id);
CREATE INDEX idx_scheduled_content_campaign ON scheduled_content_items(campaign_id);
CREATE INDEX idx_scheduled_content_due ON scheduled_content_items(status, scheduled_for);
CREATE INDEX idx_source_records_workspace_type ON source_records(workspace_id, source_type, occurred_at DESC);
