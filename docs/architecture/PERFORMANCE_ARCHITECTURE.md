# Performance Architecture

## Scope

Performance data exists at multiple levels:

| Level | Purpose |
|---|---|
| Workspace | Overall brand health and baseline |
| Campaign | Did this campaign achieve its objective? |
| Content item | Which specific pieces performed? |
| Channel | Which platforms drove results? |
| Advertisement | Paid ad metrics and ROAS |
| Conversion | Leads, trials, purchases, revenue |

## Objective-Based Evaluation

Performance is **always** evaluated against the campaign's objective.

```
campaign.objectiveId → objective.objectiveType → primary KPI selection → score
```

Do NOT apply a universal performance metric to all campaigns.

## Metric Availability

Not every provider supports every metric.
All provider-sourced metrics are nullable.
Use `null` to distinguish "not available" from "zero".

## Classification

```
EXCEPTIONAL → top ~10% vs workspace baseline
HIGH_PERFORMING
ABOVE_AVERAGE
AVERAGE
BELOW_AVERAGE
LOW_PERFORMING
INSUFFICIENT_DATA → not enough data to classify
```

Classification must consider workspace historic baseline, not industry benchmarks.

## Baselines

`BaselineService` maintains rolling baselines:
- Workspace baseline (all campaigns)
- Channel baseline (per channel)
- Content format baseline (carousels vs reels vs posts etc.)
- Objective baseline (sales campaigns vs awareness campaigns)
- Campaign-level historical average

## Learning Loop

```
Performance data → InsightService → BrandMemoryService (market performance memory)
```

Memory updates are explicit — they do not happen automatically from any performance write.

## Performance Classification Must NOT

- Be based primarily on likes
- Ignore the campaign's objective
- Apply the same primary KPI to every campaign type
- Compare against industry benchmarks instead of workspace history
