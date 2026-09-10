import type { PoolClient } from 'pg';
import { PostgresQueryable } from '../../core/postgresQueryable';
import type {
  ApprovedCurrentCreativeRow,
  CreativeArtifactInsert,
  CreativeArtifactRepository,
  CreativeApprovalRepository,
  CreativeApprovalUpsert,
  CreativeRevisionInsert,
  CreativeRevisionRepository,
} from '../../core/creativeDomainTypes';
import type { CreativeApproval } from '../../../types/creativeArtifact';
import {
  mapCreativeArtifactRow,
  normalizeCreativeTimestamp,
  type CreativeArtifactRow,
} from '../../core/creativeMappers';
import { maybeInjectCreativeFailure } from '../../core/creativeVerificationHooks';

export class PostgresCreativeArtifactRepository implements CreativeArtifactRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findCurrentByCampaignAndKey(campaignId: string, contentKey: string) {
    const result = await this.db.query(
      'SELECT * FROM creative_artifacts WHERE campaign_id = $1 AND content_key = $2 AND is_current = 1 ORDER BY version DESC LIMIT 1',
      [campaignId, contentKey],
    );
    const row = result.rows[0] as CreativeArtifactRow | undefined;
    return row ? mapCreativeArtifactRow(row) : null;
  }

  async findById(id: string, campaignId: string) {
    const result = await this.db.query(
      'SELECT * FROM creative_artifacts WHERE id = $1 AND campaign_id = $2',
      [id, campaignId],
    );
    const row = result.rows[0] as CreativeArtifactRow | undefined;
    return row ? mapCreativeArtifactRow(row) : null;
  }

  async listByCampaignAndKey(campaignId: string, contentKey: string) {
    const result = await this.db.query(
      'SELECT * FROM creative_artifacts WHERE campaign_id = $1 AND content_key = $2 ORDER BY version DESC',
      [campaignId, contentKey],
    );
    return (result.rows as CreativeArtifactRow[]).map(mapCreativeArtifactRow);
  }

  async maxVersionForCampaignAndKey(campaignId: string, contentKey: string) {
    const result = await this.db.query(
      'SELECT MAX(version) AS max_v FROM creative_artifacts WHERE campaign_id = $1 AND content_key = $2',
      [campaignId, contentKey],
    );
    const row = result.rows[0] as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async clearCurrentForCampaignAndContentKey(campaignId: string, contentKey: string) {
    await this.db.query(
      'UPDATE creative_artifacts SET is_current = 0 WHERE campaign_id = $1 AND content_key = $2',
      [campaignId, contentKey],
    );
    maybeInjectCreativeFailure('generate_after_clear_current');
  }

  async insert(input: CreativeArtifactInsert) {
    await this.db.query(`
      INSERT INTO creative_artifacts
        (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
         content_key, deliverable_id, version, status, is_current, channel, content_type, format,
         title, content, quality, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      input.id, input.workspaceId, input.campaignId,
      input.sourceContentPlanId, input.sourceContentPlanVersion,
      input.contentKey, input.deliverableId, input.version, input.status,
      input.channel, input.contentType, input.format,
      input.title, input.content, input.quality,
      input.createdAt, input.updatedAt,
    ]);
    maybeInjectCreativeFailure('generate_after_insert');
    return (await this.findById(input.id, input.campaignId))!;
  }

  async replaceCurrentForCampaignAndContentKey(input: CreativeArtifactInsert) {
    await this.clearCurrentForCampaignAndContentKey(input.campaignId, input.contentKey);
    return this.insert(input);
  }

  async updateStatus(id: string, status: string, updatedAt: string) {
    await this.db.query(
      'UPDATE creative_artifacts SET status = $1, updated_at = $2 WHERE id = $3',
      [status, updatedAt, id],
    );
  }

  async patchContent(id: string, contentJson: string, status: string, updatedAt: string) {
    await this.db.query(
      'UPDATE creative_artifacts SET content = $1, status = $2, updated_at = $3 WHERE id = $4',
      [contentJson, status, updatedAt, id],
    );
    maybeInjectCreativeFailure('patch_after_content_update');
  }

  async patchMediaAsset(id: string, mediaAssetId: string, status: string, updatedAt: string) {
    await this.db.query(
      'UPDATE creative_artifacts SET media_asset_id = $1, status = $2, updated_at = $3 WHERE id = $4',
      [mediaAssetId, status, updatedAt, id],
    );
  }

  async listApprovedCurrentForWorkspace(workspaceId: string): Promise<ApprovedCurrentCreativeRow[]> {
    const result = await this.db.query(`
      SELECT
        ca.id          AS artifact_id,
        ca.campaign_id,
        ca.content_key,
        ca.channel,
        ca.content_type,
        ca.format,
        ca.version,
        c.name         AS campaign_name
      FROM creative_artifacts ca
      INNER JOIN creative_approvals cap ON cap.creative_artifact_id = ca.id
      INNER JOIN campaigns c ON c.id = ca.campaign_id
      WHERE ca.workspace_id = $1 AND ca.is_current = 1
      ORDER BY c.name, ca.channel, ca.content_key
      LIMIT 50
    `, [workspaceId]);
    return result.rows.map((r: Record<string, unknown>) => ({
      artifactId: r.artifact_id as string,
      campaignId: r.campaign_id as string,
      contentKey: r.content_key as string,
      channel: r.channel as string,
      contentType: r.content_type as string,
      format: r.format as string,
      version: r.version as number,
      campaignName: r.campaign_name as string,
    }));
  }
}

export class PostgresCreativeRevisionRepository implements CreativeRevisionRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async insert(input: CreativeRevisionInsert) {
    await this.db.query(`
      INSERT INTO creative_revision_requests
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, source_version,
         request_text, target_hint, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      input.id, input.workspaceId, input.campaignId, input.contentKey,
      input.creativeArtifactId, input.sourceVersion,
      input.requestText, input.targetHint, input.status,
      input.createdAt, input.updatedAt,
    ]);
  }

  async markApplied(id: string, resultingArtifactId: string, resultingVersion: number, updatedAt: string) {
    await this.db.query(`
      UPDATE creative_revision_requests
      SET status = 'APPLIED', resulting_artifact_id = $1, resulting_version = $2, updated_at = $3
      WHERE id = $4
    `, [resultingArtifactId, resultingVersion, updatedAt, id]);
  }

  async markFailed(id: string, updatedAt: string) {
    await this.db.query(
      `UPDATE creative_revision_requests SET status = 'FAILED', updated_at = $1 WHERE id = $2`,
      [updatedAt, id],
    );
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'DELETE FROM creative_revision_requests WHERE campaign_id = $1',
      [campaignId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresCreativeApprovalRepository implements CreativeApprovalRepository {
  private readonly db: PostgresQueryable;

  constructor(client?: PoolClient) {
    this.db = new PostgresQueryable(client);
  }

  async findByCampaignAndKey(campaignId: string, contentKey: string): Promise<CreativeApproval | null> {
    const result = await this.db.query(
      'SELECT * FROM creative_approvals WHERE campaign_id = $1 AND content_key = $2',
      [campaignId, contentKey],
    );
    const row = result.rows[0] as {
      campaign_id: string;
      content_key: string;
      creative_artifact_id: string;
      approved_version: number;
      approved_at: string | Date;
    } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentKey: row.content_key,
      creativeArtifactId: row.creative_artifact_id,
      approvedVersion: row.approved_version,
      approvedAt: normalizeCreativeTimestamp(row.approved_at),
    };
  }

  async upsertByCampaignAndKey(input: CreativeApprovalUpsert) {
    await this.db.query(`
      INSERT INTO creative_approvals
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (campaign_id, content_key) DO UPDATE SET
        creative_artifact_id = EXCLUDED.creative_artifact_id,
        approved_version = EXCLUDED.approved_version,
        approved_at = EXCLUDED.approved_at
    `, [
      input.id, input.workspaceId, input.campaignId, input.contentKey,
      input.creativeArtifactId, input.approvedVersion, input.approvedAt, input.createdAt,
    ]);
    maybeInjectCreativeFailure('approve_after_upsert');
  }

  async deleteByCampaignAndKey(campaignId: string, contentKey: string) {
    const result = await this.db.query(
      'DELETE FROM creative_approvals WHERE campaign_id = $1 AND content_key = $2',
      [campaignId, contentKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    const result = await this.db.query(
      'DELETE FROM creative_approvals WHERE campaign_id = $1',
      [campaignId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export function createPostgresCreativeRepositories(client?: PoolClient) {
  return {
    artifact: new PostgresCreativeArtifactRepository(client),
    revision: new PostgresCreativeRevisionRepository(client),
    approval: new PostgresCreativeApprovalRepository(client),
  };
}
