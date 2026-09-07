import { db } from '../../database';
import type {
  ContentPlanApprovalRepository,
  ContentPlanApprovalUpsert,
  ContentPlanInsert,
  ContentPlanRepository,
  ContentPlanRevisionInsert,
  ContentPlanRevisionRepository,
} from '../../core/contentPlanningDomainTypes';
import type { ContentPlanStatus } from '../../../types/contentPlan';
import { mapContentPlanRow, type ContentPlanRow } from '../../core/contentPlanningMappers';

export class SqliteContentPlanRepository implements ContentPlanRepository {
  async findCurrentByCampaignId(campaignId: string) {
    const row = db
      .prepare('SELECT * FROM content_plans WHERE campaign_id = ? AND is_current = 1 ORDER BY version DESC LIMIT 1')
      .get(campaignId) as ContentPlanRow | undefined;
    return row ? mapContentPlanRow(row) : null;
  }

  async findById(id: string, campaignId: string) {
    const row = db
      .prepare('SELECT * FROM content_plans WHERE id = ? AND campaign_id = ?')
      .get(id, campaignId) as ContentPlanRow | undefined;
    return row ? mapContentPlanRow(row) : null;
  }

  async listByCampaignId(campaignId: string) {
    const rows = db
      .prepare('SELECT * FROM content_plans WHERE campaign_id = ? ORDER BY version DESC')
      .all(campaignId) as ContentPlanRow[];
    return rows.map(mapContentPlanRow);
  }

  async maxVersion(campaignId: string) {
    const row = db
      .prepare('SELECT MAX(version) as max_v FROM content_plans WHERE campaign_id = ?')
      .get(campaignId) as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async clearCurrentForCampaign(campaignId: string) {
    db.prepare('UPDATE content_plans SET is_current = 0 WHERE campaign_id = ?').run(campaignId);
  }

  async insert(input: ContentPlanInsert) {
    db.prepare(`
      INSERT INTO content_plans
        (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
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
    );
    return (await this.findById(input.id, input.campaignId))!;
  }

  async replaceCurrentVersion(input: ContentPlanInsert) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE content_plans SET is_current = 0 WHERE campaign_id = ?').run(input.campaignId);
      db.prepare(`
        INSERT INTO content_plans
          (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
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
      );
    });
    tx();
    return (await this.findById(input.id, input.campaignId))!;
  }

  async updateStatus(id: string, status: ContentPlanStatus, updatedAt: string) {
    db.prepare('UPDATE content_plans SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
  }

  async restoreCurrent(id: string) {
    db.prepare('UPDATE content_plans SET is_current = 1 WHERE id = ?').run(id);
  }

  async deleteById(id: string) {
    return db.prepare('DELETE FROM content_plans WHERE id = ?').run(id).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM content_plans WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqliteContentPlanRevisionRepository implements ContentPlanRevisionRepository {
  async insert(input: ContentPlanRevisionInsert) {
    db.prepare(`
      INSERT INTO content_plan_revision_requests
        (id, workspace_id, campaign_id, from_content_plan_id, from_content_plan_version, request_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.workspaceId,
      input.campaignId,
      input.fromContentPlanId,
      input.fromContentPlanVersion,
      input.requestText,
      input.status,
      input.createdAt,
      input.updatedAt,
    );
  }

  async markApplied(
    id: string,
    resultingContentPlanId: string,
    resultingContentPlanVersion: number,
    updatedAt: string,
  ) {
    db.prepare(`
      UPDATE content_plan_revision_requests
      SET status = 'APPLIED', resulting_content_plan_id = ?, resulting_content_plan_version = ?, updated_at = ?
      WHERE id = ?
    `).run(resultingContentPlanId, resultingContentPlanVersion, updatedAt, id);
  }

  async markFailed(id: string, updatedAt: string) {
    db.prepare(`UPDATE content_plan_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`)
      .run(updatedAt, id);
  }

  async deleteById(id: string) {
    return db.prepare('DELETE FROM content_plan_revision_requests WHERE id = ?').run(id).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM content_plan_revision_requests WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqliteContentPlanApprovalRepository implements ContentPlanApprovalRepository {
  async findByCampaignId(campaignId: string) {
    const row = db
      .prepare('SELECT * FROM content_plan_approvals WHERE campaign_id = ?')
      .get(campaignId) as {
        campaign_id: string;
        content_plan_id: string;
        content_plan_version: number;
        approved_at: string;
      } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentPlanId: row.content_plan_id,
      contentPlanVersion: row.content_plan_version,
      approvedAt: row.approved_at,
    };
  }

  async upsertByCampaignId(input: ContentPlanApprovalUpsert) {
    db.prepare(`
      INSERT INTO content_plan_approvals
        (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        content_plan_id = excluded.content_plan_id,
        content_plan_version = excluded.content_plan_version,
        approved_at = excluded.approved_at
    `).run(
      input.id,
      input.campaignId,
      input.workspaceId,
      input.contentPlanId,
      input.contentPlanVersion,
      input.approvedAt,
      input.createdAt,
    );
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM content_plan_approvals WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export function createSqliteContentPlanningRepositories() {
  return {
    plan: new SqliteContentPlanRepository(),
    revision: new SqliteContentPlanRevisionRepository(),
    approval: new SqliteContentPlanApprovalRepository(),
  };
}
