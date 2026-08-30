# Performance Model

## Core Rule

Campaign performance is always evaluated against its objective.
Do NOT use engagement as a default success metric.
Always ask: **Did this campaign accomplish its objective?**

## Performance Levels

Workspace → Campaign → Content Item → Channel → Advertisement → Conversion

## Metric Availability

Not every provider supports every metric. All metrics are nullable.

```
Reach & Visibility: reach, impressions, views, watch_time, completion_rate
Engagement: likes, comments, saves, shares
Traffic: clicks, ctr, website_sessions
Conversion: leads, trials, purchases, revenue
Advertising: ad_spend, cpc, cpa, roas
```

## Classification

```
EXCEPTIONAL
HIGH_PERFORMING
ABOVE_AVERAGE
AVERAGE
BELOW_AVERAGE
LOW_PERFORMING
INSUFFICIENT_DATA
```

Scoring considers: objective primary KPI, supporting KPIs, conversion, revenue,
workspace baseline, channel baseline, content-type baseline.

## Baseline Comparison

Performance is compared against the workspace's own historic results.
Not against industry benchmarks.

## Learning Loop

Performance → InsightService → explicit BrandMemoryService call → updated Brand Memory
