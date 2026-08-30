# ADR 006 — Performance Feedback Loop

**Status:** Accepted

## Decision

Campaign performance is always evaluated against its objective.
Performance data feeds Brand Memory explicitly through service calls.
Baselines are derived from the workspace's own historical performance.

## Rationale

Universal success metrics (especially engagement-based) do not measure business outcomes.
A campaign with high likes but no sales has not succeeded if its objective was Sales.
Performance classification must reflect what the campaign was trying to achieve.

## Feedback Loop

```
Campaign published
  → Performance data collected (per channel, per content item)
  → ObjectiveEvaluationService scores against objective
  → PerformanceScoringService classifies (EXCEPTIONAL ... INSUFFICIENT_DATA)
  → InsightService derives learnings
  → BrandMemoryService.syncHookToVault() writes to market performance memory (explicit call)
  → BaselineService updates workspace/channel/objective baselines
  → Next campaign planning uses updated memory and baselines
```

## Consequences

- `performance_logs` rows always include `objective_id`
- Classification cannot be computed without an objective — returns `INSUFFICIENT_DATA`
- Memory is not updated automatically from performance writes — requires explicit service call
- Baselines are workspace-scoped, not industry-benchmark-based
