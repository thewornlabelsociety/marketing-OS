import { db } from '../../database';
import type { ObjectiveRow } from '../../../types';
import type {
  ObjectiveCreateInput,
  ObjectivePatchInput,
  ObjectiveRepository,
} from '../../core/coreDomainTypes';

export class SqliteObjectiveRepository implements ObjectiveRepository {
  async listForWorkspace(workspaceId: string): Promise<ObjectiveRow[]> {
    return db
      .prepare(
        `SELECT * FROM objectives
         WHERE is_active = 1
           AND (workspace_id IS NULL OR workspace_id = ?)
         ORDER BY is_system DESC, name ASC`,
      )
      .all(workspaceId) as ObjectiveRow[];
  }

  async findById(id: string): Promise<ObjectiveRow | null> {
    const row = db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as ObjectiveRow | undefined;
    return row ?? null;
  }

  async findForCampaignValidation(id: string): Promise<ObjectiveRow | null> {
    const row = db
      .prepare('SELECT id, workspace_id, is_system FROM objectives WHERE id = ? AND is_active = 1')
      .get(id) as ObjectiveRow | undefined;
    return row ?? null;
  }

  async create(input: ObjectiveCreateInput): Promise<ObjectiveRow> {
    db.prepare(
      `INSERT INTO objectives
         (id, workspace_id, name, description, objective_type, primary_kpi, supporting_kpis,
          conversion_event, success_criteria, default_channels, is_system, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).run(
      input.id,
      input.workspaceId,
      input.name,
      input.description,
      input.objectiveType,
      input.primaryKpi,
      JSON.stringify(input.supportingKpis),
      input.conversionEvent,
      input.successCriteria,
      JSON.stringify(input.defaultChannels),
      input.createdAt,
      input.updatedAt,
    );
    const created = await this.findById(input.id);
    if (!created) throw new Error('Objective create failed');
    return created;
  }

  async patch(id: string, patch: ObjectivePatchInput, updatedAt: string): Promise<ObjectiveRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];

    const fieldMap: Record<string, keyof ObjectivePatchInput> = {
      name: 'name',
      description: 'description',
      objectiveType: 'objectiveType',
      primaryKpi: 'primaryKpi',
      conversionEvent: 'conversionEvent',
      successCriteria: 'successCriteria',
    };

    const columnMap: Record<keyof ObjectivePatchInput, string> = {
      name: 'name',
      description: 'description',
      objectiveType: 'objective_type',
      primaryKpi: 'primary_kpi',
      conversionEvent: 'conversion_event',
      successCriteria: 'success_criteria',
      isActive: 'is_active',
      supportingKpis: 'supporting_kpis',
      defaultChannels: 'default_channels',
    };

    for (const [jsKey, patchKey] of Object.entries(fieldMap)) {
      if (patchKey in patch && patch[patchKey] !== undefined) {
        sets.push(`${columnMap[patchKey]} = ?`);
        vals.push(patch[patchKey] ?? null);
      }
    }

    if (patch.isActive !== undefined) {
      sets.push('is_active = ?');
      vals.push(patch.isActive ? 1 : 0);
    }
    if (patch.supportingKpis !== undefined) {
      sets.push('supporting_kpis = ?');
      vals.push(JSON.stringify(patch.supportingKpis));
    }
    if (patch.defaultChannels !== undefined) {
      sets.push('default_channels = ?');
      vals.push(JSON.stringify(patch.defaultChannels));
    }

    if (sets.length === 0) return this.findById(id);

    sets.push('updated_at = ?');
    vals.push(updatedAt, id);

    db.prepare(`UPDATE objectives SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return this.findById(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = db.prepare('DELETE FROM objectives WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
