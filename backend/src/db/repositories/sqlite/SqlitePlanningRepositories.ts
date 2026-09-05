import { db } from '../../database';
import type {
  BriefInsertInput,
  BriefUpsertInput,
  CampaignBriefRepository,
  CampaignPlanRepository,
  PlanApprovalRepository,
  PlanApprovalUpsertInput,
  PlanStoreInput,
  RevisionCreateInput,
  RevisionRequestRepository,
} from '../../core/planningDomainTypes';
import type { BriefPatchFields } from '../../core/planningDomainTypes';
import {
  mapBriefRow,
  mapPlanRow,
  PLAN_INSERT_COLUMNS,
  PLAN_INSERT_PLACEHOLDERS_SQLITE,
  planInsertParams,
  type BriefRow,
  type PlanRow,
} from '../../core/planningMappers';

export class SqliteCampaignBriefRepository implements CampaignBriefRepository {
  async findByCampaignId(campaignId: string) {
    const row = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow | undefined;
    return row ? mapBriefRow(row) : null;
  }

  async insert(input: BriefInsertInput) {
    db.prepare(`
      INSERT INTO campaign_briefs
        (id, campaign_id, workspace_id,
         source_summary, objective_summary,
         audience_description, audience_segment, audience_problem, audience_desire,
         proposition, key_details,
         offer_description, offer_value, offer_urgency, offer_constraints,
         timing_start_date, timing_end_date, timing_important_dates,
         constraints, additional_context,
         completeness_status, completeness_missing_fields,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.campaignId, input.workspaceId,
      input.sourceSummary, input.objectiveSummary,
      input.audienceDescription, input.audienceSegment, input.audienceProblem, input.audienceDesire,
      input.proposition, JSON.stringify(input.keyDetails),
      input.offerDescription, input.offerValue, input.offerUrgency, JSON.stringify(input.offerConstraints),
      input.timingStartDate, input.timingEndDate, JSON.stringify(input.timingImportantDates),
      JSON.stringify(input.constraints), input.additionalContext,
      input.completenessStatus, JSON.stringify(input.completenessMissingFields),
      input.createdAt, input.updatedAt,
    );
    const row = db.prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?').get(input.campaignId) as BriefRow;
    return mapBriefRow(row);
  }

  async updateByCampaignId(input: BriefUpsertInput) {
    db.prepare(`
      UPDATE campaign_briefs SET
        source_summary = ?, objective_summary = ?,
        audience_description = ?, audience_segment = ?,
        audience_problem = ?, audience_desire = ?,
        proposition = ?, key_details = ?,
        offer_description = ?, offer_value = ?, offer_urgency = ?, offer_constraints = ?,
        timing_start_date = ?, timing_end_date = ?, timing_important_dates = ?,
        constraints = ?, additional_context = ?,
        completeness_status = ?, completeness_missing_fields = ?,
        updated_at = ?
      WHERE campaign_id = ?
    `).run(
      input.sourceSummary, input.objectiveSummary,
      input.audienceDescription, input.audienceSegment, input.audienceProblem, input.audienceDesire,
      input.proposition, JSON.stringify(input.keyDetails),
      input.offerDescription, input.offerValue, input.offerUrgency, JSON.stringify(input.offerConstraints),
      input.timingStartDate, input.timingEndDate, JSON.stringify(input.timingImportantDates),
      JSON.stringify(input.constraints), input.additionalContext,
      input.completenessStatus, JSON.stringify(input.completenessMissingFields),
      input.updatedAt,
      input.campaignId,
    );
    const row = db.prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?').get(input.campaignId) as BriefRow;
    return mapBriefRow(row);
  }

  async patchFields(campaignId: string, fields: BriefPatchFields, updatedAt: string) {
    const fieldMap: Record<string, string> = {
      timingStartDate: 'timing_start_date',
      timingEndDate: 'timing_end_date',
      offerDescription: 'offer_description',
      offerValue: 'offer_value',
      offerUrgency: 'offer_urgency',
      additionalContext: 'additional_context',
      proposition: 'proposition',
      audienceDescription: 'audience_description',
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (jsKey in fields) {
        sets.push(`${dbCol} = ?`);
        vals.push(fields[jsKey as keyof BriefPatchFields] ?? null);
      }
    }
    if (sets.length === 0) {
      return this.findByCampaignId(campaignId);
    }
    sets.push('updated_at = ?');
    vals.push(updatedAt, campaignId);
    db.prepare(`UPDATE campaign_briefs SET ${sets.join(', ')} WHERE campaign_id = ?`).run(...vals);
    const row = db.prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?').get(campaignId) as BriefRow | undefined;
    return row ? mapBriefRow(row) : null;
  }

  async deleteById(id: string) {
    return db.prepare('DELETE FROM campaign_briefs WHERE id = ?').run(id).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM campaign_briefs WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqliteCampaignPlanRepository implements CampaignPlanRepository {
  async getCurrent(campaignId: string) {
    const row = db
      .prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1')
      .get(campaignId) as PlanRow | undefined;
    return row ? mapPlanRow(row) : null;
  }

  async listVersions(campaignId: string) {
    const rows = db
      .prepare('SELECT * FROM campaign_plans WHERE campaign_id = ? ORDER BY version DESC')
      .all(campaignId) as PlanRow[];
    return rows.map(mapPlanRow);
  }

  async getById(planId: string, campaignId: string) {
    const row = db
      .prepare('SELECT * FROM campaign_plans WHERE id = ? AND campaign_id = ?')
      .get(planId, campaignId) as PlanRow | undefined;
    return row ? mapPlanRow(row) : null;
  }

  async getMaxVersion(campaignId: string) {
    const row = db
      .prepare('SELECT MAX(version) as max_v FROM campaign_plans WHERE campaign_id = ?')
      .get(campaignId) as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async insert(input: PlanStoreInput) {
    db.prepare(`
      INSERT INTO campaign_plans (${PLAN_INSERT_COLUMNS})
      VALUES (${PLAN_INSERT_PLACEHOLDERS_SQLITE})
    `).run(...planInsertParams(input));
    const row = db.prepare('SELECT * FROM campaign_plans WHERE id = ?').get(input.id) as PlanRow;
    return mapPlanRow(row);
  }

  async markAllNonCurrent(campaignId: string) {
    db.prepare('UPDATE campaign_plans SET is_current = 0 WHERE campaign_id = ?').run(campaignId);
  }

  async markCurrent(planId: string) {
    db.prepare('UPDATE campaign_plans SET is_current = 1 WHERE id = ?').run(planId);
  }

  async updateStatus(planId: string, status: string, updatedAt: string) {
    db.prepare('UPDATE campaign_plans SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, planId);
  }

  async deleteById(id: string) {
    return db.prepare('DELETE FROM campaign_plans WHERE id = ?').run(id).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM campaign_plans WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqliteRevisionRequestRepository implements RevisionRequestRepository {
  async create(input: RevisionCreateInput) {
    db.prepare(`
      INSERT INTO revision_requests
        (id, campaign_id, workspace_id, from_plan_id, from_plan_version, request_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.campaignId, input.workspaceId, input.fromPlanId, input.fromPlanVersion,
      input.requestText, input.status, input.createdAt, input.updatedAt,
    );
  }

  async updateStatus(id: string, status: string, updatedAt: string) {
    db.prepare('UPDATE revision_requests SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
  }

  async findLatestForCampaign(campaignId: string) {
    const row = db
      .prepare('SELECT id, status FROM revision_requests WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(campaignId) as { id: string; status: string } | undefined;
    return row ?? null;
  }

  async deleteById(id: string) {
    return db.prepare('DELETE FROM revision_requests WHERE id = ?').run(id).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM revision_requests WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqlitePlanApprovalRepository implements PlanApprovalRepository {
  async findByCampaignId(campaignId: string) {
    const row = db
      .prepare('SELECT approved_plan_id, approved_version, approved_at FROM plan_approvals WHERE campaign_id = ?')
      .get(campaignId) as { approved_plan_id: string; approved_version: number; approved_at: string } | undefined;
    if (!row) return null;
    return {
      approvedPlanId: row.approved_plan_id,
      approvedVersion: row.approved_version,
      approvedAt: row.approved_at,
    };
  }

  async upsertByCampaignId(input: PlanApprovalUpsertInput) {
    db.prepare(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        approved_plan_id = excluded.approved_plan_id,
        approved_version = excluded.approved_version,
        approved_at = excluded.approved_at
    `).run(
      input.id, input.campaignId, input.workspaceId, input.approvedPlanId,
      input.approvedVersion, input.approvedAt, input.createdAt,
    );
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM plan_approvals WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export function createSqlitePlanningRepositories(): {
  brief: CampaignBriefRepository;
  plan: CampaignPlanRepository;
  revision: RevisionRequestRepository;
  approval: PlanApprovalRepository;
} {
  return {
    brief: new SqliteCampaignBriefRepository(),
    plan: new SqliteCampaignPlanRepository(),
    revision: new SqliteRevisionRequestRepository(),
    approval: new SqlitePlanApprovalRepository(),
  };
}
