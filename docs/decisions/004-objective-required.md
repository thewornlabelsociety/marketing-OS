# ADR 004 — Objectives Are Required

**Status:** Accepted

## Decision

Every campaign must reference an Objective. A campaign without an objective is invalid and
must be rejected at the API layer.

## Rationale

Without an objective:
- There is no basis for evaluating whether a campaign succeeded
- Performance scoring defaults to vanity metrics (likes, views) which do not measure business outcomes
- The planning stage has no direction for content tone, CTAs, or channel selection
- Revisions have no success criteria

An objective library (system templates + custom workspace objectives) gives users a
curated starting point while remaining completely brand-agnostic.

## Consequences

- `POST /api/campaigns` requires `objectiveId` — returns 400 if missing
- `ObjectiveEvaluationService` uses the campaign's objective type to select the correct primary KPI
- `PerformanceScoringService` cannot classify a campaign without an objective
- The Create Campaign UI requires objective selection before proceeding
