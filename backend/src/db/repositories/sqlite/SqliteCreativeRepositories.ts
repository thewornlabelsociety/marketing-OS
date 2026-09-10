import { db } from '../../database';
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
import { mapCreativeArtifactRow, type CreativeArtifactRow } from '../../core/creativeMappers';

export class SqliteCreativeArtifactRepository implements CreativeArtifactRepository {
  async findCurrentByCampaignAndKey(campaignId: string, contentKey: string) {
    const row = db.prepare(`
      SELECT * FROM creative_artifacts
      WHERE campaign_id = ? AND content_key = ? AND is_current = 1
      ORDER BY version DESC LIMIT 1
    `).get(campaignId, contentKey) as CreativeArtifactRow | undefined;
    return row ? mapCreativeArtifactRow(row) : null;
  }

  async findById(id: string, campaignId: string) {
    const row = db.prepare(
      'SELECT * FROM creative_artifacts WHERE id = ? AND campaign_id = ?',
    ).get(id, campaignId) as CreativeArtifactRow | undefined;
    return row ? mapCreativeArtifactRow(row) : null;
  }

  async listByCampaignAndKey(campaignId: string, contentKey: string) {
    const rows = db.prepare(`
      SELECT * FROM creative_artifacts
      WHERE campaign_id = ? AND content_key = ?
      ORDER BY version DESC
    `).all(campaignId, contentKey) as CreativeArtifactRow[];
    return rows.map(mapCreativeArtifactRow);
  }

  async maxVersionForCampaignAndKey(campaignId: string, contentKey: string) {
    const row = db.prepare(`
      SELECT MAX(version) AS max_v FROM creative_artifacts
      WHERE campaign_id = ? AND content_key = ?
    `).get(campaignId, contentKey) as { max_v: number | null };
    return row.max_v ?? 0;
  }

  async clearCurrentForCampaignAndContentKey(campaignId: string, contentKey: string) {
    db.prepare(
      'UPDATE creative_artifacts SET is_current = 0 WHERE campaign_id = ? AND content_key = ?',
    ).run(campaignId, contentKey);
  }

  async insert(input: CreativeArtifactInsert) {
    db.prepare(`
      INSERT INTO creative_artifacts
        (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
         content_key, deliverable_id, version, status, is_current, channel, content_type, format,
         title, content, quality, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.workspaceId, input.campaignId,
      input.sourceContentPlanId, input.sourceContentPlanVersion,
      input.contentKey, input.deliverableId, input.version, input.status,
      input.channel, input.contentType, input.format,
      input.title, input.content, input.quality,
      input.createdAt, input.updatedAt,
    );
    return (await this.findById(input.id, input.campaignId))!;
  }

  async replaceCurrentForCampaignAndContentKey(input: CreativeArtifactInsert) {
    const tx = db.transaction(() => {
      db.prepare(
        'UPDATE creative_artifacts SET is_current = 0 WHERE campaign_id = ? AND content_key = ?',
      ).run(input.campaignId, input.contentKey);
      db.prepare(`
        INSERT INTO creative_artifacts
          (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
           content_key, deliverable_id, version, status, is_current, channel, content_type, format,
           title, content, quality, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id, input.workspaceId, input.campaignId,
        input.sourceContentPlanId, input.sourceContentPlanVersion,
        input.contentKey, input.deliverableId, input.version, input.status,
        input.channel, input.contentType, input.format,
        input.title, input.content, input.quality,
        input.createdAt, input.updatedAt,
      );
    });
    tx();
    return (await this.findById(input.id, input.campaignId))!;
  }

  async updateStatus(id: string, status: string, updatedAt: string) {
    db.prepare('UPDATE creative_artifacts SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
  }

  async patchContent(id: string, contentJson: string, status: string, updatedAt: string) {
    db.prepare(
      'UPDATE creative_artifacts SET content = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(contentJson, status, updatedAt, id);
  }

  async patchMediaAsset(id: string, mediaAssetId: string, status: string, updatedAt: string) {
    db.prepare(
      'UPDATE creative_artifacts SET media_asset_id = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(mediaAssetId, status, updatedAt, id);
  }

  async listApprovedCurrentForWorkspace(workspaceId: string): Promise<ApprovedCurrentCreativeRow[]> {
    const rows = db.prepare(`
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
      WHERE ca.workspace_id = ? AND ca.is_current = 1
      ORDER BY c.name, ca.channel, ca.content_key
      LIMIT 50
    `).all(workspaceId) as Array<{
      artifact_id: string;
      campaign_id: string;
      content_key: string;
      channel: string;
      content_type: string;
      format: string;
      version: number;
      campaign_name: string;
    }>;
    return rows.map((r) => ({
      artifactId: r.artifact_id,
      campaignId: r.campaign_id,
      contentKey: r.content_key,
      channel: r.channel,
      contentType: r.content_type,
      format: r.format,
      version: r.version,
      campaignName: r.campaign_name,
    }));
  }
}

export class SqliteCreativeRevisionRepository implements CreativeRevisionRepository {
  async insert(input: CreativeRevisionInsert) {
    db.prepare(`
      INSERT INTO creative_revision_requests
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, source_version,
         request_text, target_hint, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.workspaceId, input.campaignId, input.contentKey,
      input.creativeArtifactId, input.sourceVersion,
      input.requestText, input.targetHint, input.status,
      input.createdAt, input.updatedAt,
    );
  }

  async markApplied(id: string, resultingArtifactId: string, resultingVersion: number, updatedAt: string) {
    db.prepare(`
      UPDATE creative_revision_requests
      SET status = 'APPLIED', resulting_artifact_id = ?, resulting_version = ?, updated_at = ?
      WHERE id = ?
    `).run(resultingArtifactId, resultingVersion, updatedAt, id);
  }

  async markFailed(id: string, updatedAt: string) {
    db.prepare(
      `UPDATE creative_revision_requests SET status = 'FAILED', updated_at = ? WHERE id = ?`,
    ).run(updatedAt, id);
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM creative_revision_requests WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export class SqliteCreativeApprovalRepository implements CreativeApprovalRepository {
  async findByCampaignAndKey(campaignId: string, contentKey: string): Promise<CreativeApproval | null> {
    const row = db.prepare(`
      SELECT * FROM creative_approvals WHERE campaign_id = ? AND content_key = ?
    `).get(campaignId, contentKey) as {
      campaign_id: string;
      content_key: string;
      creative_artifact_id: string;
      approved_version: number;
      approved_at: string;
    } | undefined;
    if (!row) return null;
    return {
      campaignId: row.campaign_id,
      contentKey: row.content_key,
      creativeArtifactId: row.creative_artifact_id,
      approvedVersion: row.approved_version,
      approvedAt: row.approved_at,
    };
  }

  async upsertByCampaignAndKey(input: CreativeApprovalUpsert) {
    db.prepare(`
      INSERT INTO creative_approvals
        (id, workspace_id, campaign_id, content_key, creative_artifact_id, approved_version, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, content_key) DO UPDATE SET
        creative_artifact_id = excluded.creative_artifact_id,
        approved_version = excluded.approved_version,
        approved_at = excluded.approved_at
    `).run(
      input.id, input.workspaceId, input.campaignId, input.contentKey,
      input.creativeArtifactId, input.approvedVersion, input.approvedAt, input.createdAt,
    );
  }

  async deleteByCampaignAndKey(campaignId: string, contentKey: string) {
    return db.prepare(
      'DELETE FROM creative_approvals WHERE campaign_id = ? AND content_key = ?',
    ).run(campaignId, contentKey).changes > 0;
  }

  async deleteByCampaignId(campaignId: string) {
    return db.prepare('DELETE FROM creative_approvals WHERE campaign_id = ?').run(campaignId).changes > 0;
  }
}

export function createSqliteCreativeRepositories() {
  return {
    artifact: new SqliteCreativeArtifactRepository(),
    revision: new SqliteCreativeRevisionRepository(),
    approval: new SqliteCreativeApprovalRepository(),
  };
}
