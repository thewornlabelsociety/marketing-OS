import type { ContentPlan } from '../../types/contentPlan';
import { ensureContentPlanBodyIds } from '../../services/campaigns/ContentPlanValidator';

export interface ContentPlanRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  source_plan_id: string;
  source_plan_version: number;
  version: number;
  status: string;
  is_current: number;
  body: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export function normalizeContentPlanTimestamp(value: string | Date): string {
  return new Date(value).toISOString();
}

function parseBody(row: ContentPlanRow): Pick<ContentPlan, 'summary' | 'concepts' | 'deliverables' | 'cadence'> {
  const body = JSON.parse(row.body) as Pick<ContentPlan, 'summary' | 'concepts' | 'deliverables' | 'cadence'>;
  const withIds = ensureContentPlanBodyIds({
    concepts: body.concepts ?? [],
    deliverables: body.deliverables ?? [],
  });
  return {
    summary: body.summary,
    concepts: withIds.concepts,
    deliverables: withIds.deliverables,
    cadence: body.cadence ?? { phases: [] },
  };
}

export function mapContentPlanRow(row: ContentPlanRow): ContentPlan {
  const body = parseBody(row);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    sourcePlanId: row.source_plan_id,
    sourcePlanVersion: row.source_plan_version,
    version: row.version,
    summary: body.summary,
    concepts: body.concepts,
    deliverables: body.deliverables,
    cadence: body.cadence,
    status: row.status as ContentPlan['status'],
    isCurrent: row.is_current === 1,
    createdAt: normalizeContentPlanTimestamp(row.created_at),
    updatedAt: normalizeContentPlanTimestamp(row.updated_at),
  };
}
