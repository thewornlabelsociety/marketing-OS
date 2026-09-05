import { db } from '../../database';
import type { CampaignRow } from '../../../types';
import type {
  CampaignCreateInput,
  CampaignListFilters,
  CampaignPatchInput,
  CampaignRepository,
} from '../../core/coreDomainTypes';
import { CAMPAIGN_JOIN_SQLITE as JOIN_SQL } from '../../core/coreDomainTypes';

export class SqliteCampaignRepository implements CampaignRepository {
  async list(filters: CampaignListFilters): Promise<CampaignRow[]> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.workspaceId) {
      conditions.push('c.workspace_id = ?');
      params.push(filters.workspaceId);
    }
    if (filters.status) {
      conditions.push('c.status = ?');
      params.push(filters.status);
    }

    return db
      .prepare(`${JOIN_SQL} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC`)
      .all(...params) as CampaignRow[];
  }

  async findByIdWithObjective(id: string): Promise<CampaignRow | null> {
    const row = db
      .prepare(`${JOIN_SQL} WHERE c.id = ?`)
      .get(id) as CampaignRow | undefined;
    return row ?? null;
  }

  async findById(id: string): Promise<CampaignRow | null> {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
    return row ?? null;
  }

  async create(input: CampaignCreateInput): Promise<CampaignRow> {
    db.prepare(
      `INSERT INTO campaigns
         (id, workspace_id, objective_id, name, status, source_type, source_id,
          source_title, source_description, source_metadata, brief, channels, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'DRAFTING', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.workspaceId,
      input.objectiveId,
      input.name,
      input.sourceType,
      input.sourceId,
      input.sourceTitle,
      input.sourceDescription,
      JSON.stringify(input.sourceMetadata),
      input.brief,
      JSON.stringify(input.channels),
      input.createdAt,
      input.updatedAt,
    );

    const created = await this.findByIdWithObjective(input.id);
    if (!created) throw new Error('Campaign create failed');
    return created;
  }

  async patch(id: string, patch: CampaignPatchInput, updatedAt: string): Promise<CampaignRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];

    const scalarMap: Record<string, keyof CampaignPatchInput> = {
      name: 'name',
      brief: 'brief',
      sourceTitle: 'sourceTitle',
      sourceDescription: 'sourceDescription',
      cancellationReason: 'cancellationReason',
      scheduledAt: 'scheduledAt',
      publishedAt: 'publishedAt',
      completedAt: 'completedAt',
    };

    const columnMap: Record<string, string> = {
      name: 'name',
      brief: 'brief',
      sourceTitle: 'source_title',
      sourceDescription: 'source_description',
      cancellationReason: 'cancellation_reason',
      scheduledAt: 'scheduled_at',
      publishedAt: 'published_at',
      completedAt: 'completed_at',
    };

    for (const [colKey, patchKey] of Object.entries(scalarMap)) {
      if (patch[patchKey] !== undefined) {
        sets.push(`${columnMap[colKey]} = ?`);
        vals.push(patch[patchKey] ?? null);
      }
    }

    if (patch.status !== undefined) {
      sets.push('status = ?');
      vals.push(patch.status);
    }
    if (patch.channels !== undefined) {
      sets.push('channels = ?');
      vals.push(JSON.stringify(patch.channels));
    }
    if (patch.sourceMetadata !== undefined) {
      sets.push('source_metadata = ?');
      vals.push(JSON.stringify(patch.sourceMetadata));
    }
    if (patch.objectiveId !== undefined) {
      sets.push('objective_id = ?');
      vals.push(patch.objectiveId);
    }

    if (sets.length === 0) return this.findByIdWithObjective(id);

    sets.push('updated_at = ?');
    vals.push(updatedAt, id);

    db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return this.findByIdWithObjective(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
