import type { PoolClient } from 'pg';
import { PostgresQueryable } from '../../core/postgresQueryable';
import type {
  ContentPlanApprovalRepository,
  ContentPlanApprovalUpsert,
  ContentPlanInsert,
  ContentPlanRepository,
  ContentPlanRevisionInsert,
  ContentPlanRevisionRepository,
} from '../../core/contentPlanningDomainTypes';
import type { ContentPlanStatus } from '../../../types/contentPlan';
import { mapContentPlanRow, normalizeContentPlanTimestamp, type ContentPlanRow } from '../../core/contentPlanningMappers';
import { maybeInjectContentPlanningFailure } from '../../core/contentPlanningVerificationHooks';

export class PostgresContentPlanRepository implements ContentPlanRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findCurrentByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM content_plans WHERE campaign_id = $1 AND is_current = 1 ORDER BY version DESC LIMIT 1',
      [campaignId],
    );
    const row = result.rows[0] as ContentPlanRow | undefined;
    return row ? mapContentPlanRow(row) : null;
  }

  async findById(id: string, campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM content_plans WHERE id = $1 AND campaign_id = $2',
      [id, campaignId],
    );
    const row = result.rows[0] as ContentPlanRow | undefined;
    return row ? mapContentPlanRow(row) : null;
  }

  async listByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM content_plans WHERE campaign_id = $1 ORDER BY version DESC',
      [campaignId],
    );
    return (result.rows as ContentPlanRow[]).map(mapContentPlanRow);
  }

  async maxVersion(campaignId: string) {
    const result = await this.db.query(
      'SELECT MAX(version) as max_v FROM content_plans WHERE campaign_id = $1',
      [campaignId],
    );
    const row = result.rows[0] as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async clearCurrentForCampaign(campaignId: string) {
    await this.db.query('UPDATE content_plans SET is_current = 0 WHERE campaign_id = $1', [campaignId]);
    maybeInjectContentPlanningFailure('generate_after_clear_current');
    maybeInjectContentPlanningFailure('revise_after_clear_current');
  }

  async insert(input: ContentPlanInsert) {
    await this.db.query(`
      INSERT INTO content_plans
        (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)
    `, [
      input.id,
      input.workspaceId,
      input.campaignId,
      input.sourcePlanId,
      input.sourcePlanVersion,
      input.version,
      input.status,
      input.body,
      input.createdAt,
      input.updatedAt,
    ]);
    return (await this.findById(input.id, input.campaignId))!;
  }

  async replaceCurrentVersion(input: ContentPlanInsert) {
    await this.clearCurrentForCampaign(input.campaignId);
    return this.insert(input);
  }

  async updateStatus(id: string, status: ContentPlanStatus, updatedAt: string) {
    maybeInjectContentPlanningFailure('approve_after_plan_status');
    await this.db.query('UPDATE content_plans SET status = $1, updated_at = $2 WHERE id = $3', [status, updatedAt, id]);
  }

  async restoreCurrent(id: string) {
    await this.db.query('UPDATE content_plans SET is_current = 1 WHERE id = $1', [id]);
  }

  async deleteById(id: string) {
    const result = await this.db.query('DELETE FROM content_plans WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM content_plans WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresContentPlanRevisionRepository implements ContentPlanRevisionRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async insert(input: ContentPlanRevisionInsert) {
    await this.db.query(`
      INSERT INTO content_plan_revision_requests
        (id, workspace_id, campaign_id, from_content_plan_id, from_content_plan_version, request_text, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      input.id,
      input.workspaceId,
      input.campaignId,
      input.fromContentPlanId,
      input.fromContentPlanVersion,
      input.requestText,
      input.status,
      input.createdAt,
      input.updatedAt,
    ]);
  }

  async markApplied(
    id: string,
    resultingContentPlanId: string,
    resultingContentPlanVersion: number,
    updatedAt: string,
  ) {
    maybeInjectContentPlanningFailure('revise_before_revision_applied');
    await this.db.query(`
      UPDATE content_plan_revision_requests
      SET status = 'APPLIED', resulting_content_plan_id = $1, resulting_content_plan_version = $2, updated_at = $3
      WHERE id = $4
    `, [resultingContentPlanId, resultingContentPlanVersion, updatedAt, id]);
  }

  async markFailed(id: string, updatedAt: string) {
    await this.db.query(
      `UPDATE content_plan_revision_requests SET status = 'FAILED', updated_at = $1 WHERE id = $2`,
      [updatedAt, id],
    );
  }

  async deleteById(id: string) {
    const result = await this.db.query('DELETE FROM content_plan_revision_requests WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM content_plan_revision_requests WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresContentPlanApprovalRepository implements ContentPlanApprovalRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM content_plan_approvals WHERE campaign_id = $1',
      [campaignId],
    );
    const row = result.rows[0] as {
      campaign_id: string;
      content_plan_id: string;
      content_plan_version: number;
      approved_at: string | Date;
    } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentPlanId: row.content_plan_id,
      contentPlanVersion: row.content_plan_version,
      approvedAt: normalizeContentPlanTimestamp(row.approved_at),
    };
  }

  async upsertByCampaignId(input: ContentPlanApprovalUpsert) {
    await this.db.query(`
      INSERT INTO content_plan_approvals
        (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (campaign_id) DO UPDATE SET
        content_plan_id = EXCLUDED.content_plan_id,
        content_plan_version = EXCLUDED.content_plan_version,
        approved_at = EXCLUDED.approved_at
    `, [
      input.id,
      input.campaignId,
      input.workspaceId,
      input.contentPlanId,
      input.contentPlanVersion,
      input.approvedAt,
      input.createdAt,
    ]);
    maybeInjectContentPlanningFailure('approve_after_upsert');
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query('DELETE FROM content_plan_approvals WHERE campaign_id = $1', [campaignId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export function createPostgresContentPlanningRepositories(client?: PoolClient) {
  return {
    plan: new PostgresContentPlanRepository(client),
    revision: new PostgresContentPlanRevisionRepository(client),
    approval: new PostgresContentPlanApprovalRepository(client),
  };
}
