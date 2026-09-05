import type { PoolClient } from 'pg';
import { PostgresQueryable } from '../../core/postgresQueryable';
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
  PLAN_INSERT_PLACEHOLDERS_POSTGRES,
  planInsertParams,
  type BriefRow,
  type PlanRow,
} from '../../core/planningMappers';
import { maybeInjectPlanningFailure } from '../../core/planningVerificationHooks';

export class PostgresCampaignBriefRepository implements CampaignBriefRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findByCampaignId(campaignId: string) {
    const result = await this.db.query('SELECT * FROM campaign_briefs WHERE campaign_id = $1', [campaignId]);
    const row = result.rows[0] as BriefRow | undefined;
    return row ? mapBriefRow(row) : null;
  }

  async insert(input: BriefInsertInput) {
    await this.db.query(`
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    `, [
      input.id, input.campaignId, input.workspaceId,
      input.sourceSummary, input.objectiveSummary,
      input.audienceDescription, input.audienceSegment, input.audienceProblem, input.audienceDesire,
      input.proposition, JSON.stringify(input.keyDetails),
      input.offerDescription, input.offerValue, input.offerUrgency, JSON.stringify(input.offerConstraints),
      input.timingStartDate, input.timingEndDate, JSON.stringify(input.timingImportantDates),
      JSON.stringify(input.constraints), input.additionalContext,
      input.completenessStatus, JSON.stringify(input.completenessMissingFields),
      input.createdAt, input.updatedAt,
    ]);
    return (await this.findByCampaignId(input.campaignId))!;
  }

  async updateByCampaignId(input: BriefUpsertInput) {
    await this.db.query(`
      UPDATE campaign_briefs SET
        source_summary = $1, objective_summary = $2,
        audience_description = $3, audience_segment = $4,
        audience_problem = $5, audience_desire = $6,
        proposition = $7, key_details = $8,
        offer_description = $9, offer_value = $10, offer_urgency = $11, offer_constraints = $12,
        timing_start_date = $13, timing_end_date = $14, timing_important_dates = $15,
        constraints = $16, additional_context = $17,
        completeness_status = $18, completeness_missing_fields = $19,
        updated_at = $20
      WHERE campaign_id = $21
    `, [
      input.sourceSummary, input.objectiveSummary,
      input.audienceDescription, input.audienceSegment, input.audienceProblem, input.audienceDesire,
      input.proposition, JSON.stringify(input.keyDetails),
      input.offerDescription, input.offerValue, input.offerUrgency, JSON.stringify(input.offerConstraints),
      input.timingStartDate, input.timingEndDate, JSON.stringify(input.timingImportantDates),
      JSON.stringify(input.constraints), input.additionalContext,
      input.completenessStatus, JSON.stringify(input.completenessMissingFields),
      input.updatedAt, input.campaignId,
    ]);
    return (await this.findByCampaignId(input.campaignId))!;
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
    let idx = 1;
    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (jsKey in fields) {
        sets.push(`${dbCol} = $${idx++}`);
        vals.push(fields[jsKey as keyof BriefPatchFields] ?? null);
      }
    }
    if (sets.length === 0) return this.findByCampaignId(campaignId);
    sets.push(`updated_at = $${idx++}`);
    vals.push(updatedAt, campaignId);
    await this.db.query(`UPDATE campaign_briefs SET ${sets.join(', ')} WHERE campaign_id = $${idx}`, vals);
    return this.findByCampaignId(campaignId);
  }

  async deleteById(id: string) {
    const result = await this.db.query('DELETE FROM campaign_briefs WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM campaign_briefs WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresCampaignPlanRepository implements CampaignPlanRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async getCurrent(campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM campaign_plans WHERE campaign_id = $1 AND is_current = 1 ORDER BY version DESC LIMIT 1',
      [campaignId],
    );
    const row = result.rows[0] as PlanRow | undefined;
    return row ? mapPlanRow(row) : null;
  }

  async listVersions(campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM campaign_plans WHERE campaign_id = $1 ORDER BY version DESC',
      [campaignId],
    );
    return (result.rows as PlanRow[]).map(mapPlanRow);
  }

  async getById(planId: string, campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM campaign_plans WHERE id = $1 AND campaign_id = $2',
      [planId, campaignId],
    );
    const row = result.rows[0] as PlanRow | undefined;
    return row ? mapPlanRow(row) : null;
  }

  async getMaxVersion(campaignId: string) {
    const result = await this.db.query(
      'SELECT MAX(version) as max_v FROM campaign_plans WHERE campaign_id = $1',
      [campaignId],
    );
    const row = result.rows[0] as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async insert(input: PlanStoreInput) {
    maybeInjectPlanningFailure('generate_before_insert');
    maybeInjectPlanningFailure('revise_before_insert');
    await this.db.query(
      `INSERT INTO campaign_plans (${PLAN_INSERT_COLUMNS}) VALUES (${PLAN_INSERT_PLACEHOLDERS_POSTGRES})`,
      planInsertParams(input),
    );
    maybeInjectPlanningFailure('generate_after_insert');
    maybeInjectPlanningFailure('revise_after_insert');
    const result = await this.db.query('SELECT * FROM campaign_plans WHERE id = $1', [input.id]);
    return mapPlanRow(result.rows[0] as PlanRow);
  }

  async markAllNonCurrent(campaignId: string) {
    await this.db.query('UPDATE campaign_plans SET is_current = 0 WHERE campaign_id = $1', [campaignId]);
    maybeInjectPlanningFailure('generate_after_unset_current');
    maybeInjectPlanningFailure('revise_after_unset_current');
  }

  async markCurrent(planId: string) {
    await this.db.query('UPDATE campaign_plans SET is_current = 1 WHERE id = $1', [planId]);
  }

  async updateStatus(planId: string, status: string, updatedAt: string) {
    maybeInjectPlanningFailure('approve_after_plan_status');
    await this.db.query('UPDATE campaign_plans SET status = $1, updated_at = $2 WHERE id = $3', [status, updatedAt, planId]);
  }

  async deleteById(id: string) {
    const result = await this.db.query('DELETE FROM campaign_plans WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM campaign_plans WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresRevisionRequestRepository implements RevisionRequestRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async create(input: RevisionCreateInput) {
    await this.db.query(`
      INSERT INTO revision_requests
        (id, campaign_id, workspace_id, from_plan_id, from_plan_version, request_text, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      input.id, input.campaignId, input.workspaceId, input.fromPlanId, input.fromPlanVersion,
      input.requestText, input.status, input.createdAt, input.updatedAt,
    ]);
  }

  async updateStatus(id: string, status: string, updatedAt: string) {
    maybeInjectPlanningFailure('revise_before_revision_applied');
    await this.db.query('UPDATE revision_requests SET status = $1, updated_at = $2 WHERE id = $3', [status, updatedAt, id]);
  }

  async findLatestForCampaign(campaignId: string) {
    const result = await this.db.query(
      'SELECT id, status FROM revision_requests WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 1',
      [campaignId],
    );
    return (result.rows[0] as { id: string; status: string } | undefined) ?? null;
  }

  async deleteById(id: string) {
    const result = await this.db.query('DELETE FROM revision_requests WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM revision_requests WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresPlanApprovalRepository implements PlanApprovalRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'SELECT approved_plan_id, approved_version, approved_at FROM plan_approvals WHERE campaign_id = $1',
      [campaignId],
    );
    const row = result.rows[0] as { approved_plan_id: string; approved_version: number; approved_at: string } | undefined;
    if (!row) return null;
    return {
      approvedPlanId: row.approved_plan_id,
      approvedVersion: row.approved_version,
      approvedAt: row.approved_at,
    };
  }

  async upsertByCampaignId(input: PlanApprovalUpsertInput) {
    await this.db.query(`
      INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (campaign_id) DO UPDATE SET
        approved_plan_id = EXCLUDED.approved_plan_id,
        approved_version = EXCLUDED.approved_version,
        approved_at = EXCLUDED.approved_at
    `, [
      input.id, input.campaignId, input.workspaceId, input.approvedPlanId,
      input.approvedVersion, input.approvedAt, input.createdAt,
    ]);
    maybeInjectPlanningFailure('approve_after_upsert');
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM plan_approvals WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export function createPostgresPlanningRepositories(client?: PoolClient) {
  return {
    brief: new PostgresCampaignBriefRepository(client),
    plan: new PostgresCampaignPlanRepository(client),
    revision: new PostgresRevisionRequestRepository(client),
    approval: new PostgresPlanApprovalRepository(client),
  };
}
