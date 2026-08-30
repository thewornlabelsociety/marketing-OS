# Objective Model

## Objectives Are First-Class Records

An Objective is a persisted entity, not a string enum. Every campaign references one.

## Library Structure

Each workspace has an Objective Library containing:
1. **System templates** — generic, configurable, `workspaceId: null`
2. **Custom objectives** — workspace-created, `workspaceId: <id>`

## System Template Examples

These are generic marketing concepts. They contain no business-specific assumptions.

| Type | Primary KPI |
|---|---|
| SALES | Revenue / conversions |
| LEAD_GENERATION | Qualified leads / cost per lead |
| TRAFFIC | Qualified clicks / sessions |
| AWARENESS | Reach / impressions / video views |
| ENGAGEMENT | Comments / shares / saves |
| LAUNCH | Campaign-specific conversion event |
| EVENT_PROMOTION | RSVPs / ticket sales / attendance |
| EMAIL_LIST_GROWTH | New subscribers / cost per subscriber |
| CUSTOMER_RETENTION | Repeat purchases / churn reduction |
| RE_ENGAGEMENT | Reactivated accounts / win-back rate |
| EDUCATION | Content completion / knowledge checks |
| COMMUNITY_GROWTH | New members / follower growth |
| INVENTORY_CLEARANCE | Units sold / revenue from batch |

## Objective Fields

```typescript
interface Objective {
  id: string;
  workspaceId: string | null;   // null = system template
  name: string;
  description: string;
  objectiveType: ObjectiveType;
  primaryKpi: string;
  supportingKpis: string[];
  conversionEvent: string | null;
  successCriteria: string | null;
  defaultChannels: string[];
  isSystem: boolean;
  isActive: boolean;
}
```

## Critical Rule

Performance is evaluated against the campaign's objective.
Do NOT judge success by engagement unless `objectiveType === 'ENGAGEMENT'`.
Do NOT apply a universal success metric to all campaigns.
