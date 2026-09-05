import { getPostgresPool } from '../../postgres/postgresPool';
import type { TenantInsert, TenantRepository } from '../../core/coreDomainTypes';
import { mapPostgresEntityRow, mapPostgresObjectiveRow, mapPostgresCampaignRow } from '../../core/postgresRowUtils';
import type { EntityRow, ObjectiveRow, CampaignRow } from '../../../types';
import type {
  EntityUpsertInput,
  WorkspaceRepository,
  ObjectiveCreateInput,
  ObjectivePatchInput,
  ObjectiveRepository,
  CampaignCreateInput,
  CampaignListFilters,
  CampaignPatchInput,
  CampaignRepository,
} from '../../core/coreDomainTypes';
import { CAMPAIGN_JOIN_POSTGRES as JOIN_SQL } from '../../core/coreDomainTypes';

export class PostgresTenantRepository implements TenantRepository {
  async findById(id: string): Promise<{ id: string } | null> {
    const result = await getPostgresPool().query('SELECT id FROM tenants WHERE id = $1', [id]);
    return (result.rows[0] as { id: string } | undefined) ?? null;
  }

  async insertIfNotExists(input: TenantInsert): Promise<'inserted' | 'skipped'> {
    const existing = await this.findById(input.id);
    if (existing) return 'skipped';
    await getPostgresPool().query(
      'INSERT INTO tenants (id, plan_tier, license_key) VALUES ($1, $2, $3)',
      [input.id, input.planTier ?? 'pro', input.licenseKey ?? null],
    );
    return 'inserted';
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await getPostgresPool().query('DELETE FROM tenants WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  async listActive(): Promise<EntityRow[]> {
    const result = await getPostgresPool().query(
      'SELECT * FROM entities WHERE is_archived = 0 ORDER BY name ASC',
    );
    return result.rows.map((r) => mapPostgresEntityRow(r as Record<string, unknown>));
  }

  async findById(id: string): Promise<EntityRow | null> {
    const result = await getPostgresPool().query('SELECT * FROM entities WHERE id = $1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresEntityRow(row) : null;
  }

  async findBrandKit(id: string): Promise<string | null> {
    const result = await getPostgresPool().query('SELECT brand_kit FROM entities WHERE id = $1', [id]);
    const row = result.rows[0] as { brand_kit: string } | undefined;
    return row?.brand_kit ?? null;
  }

  async exists(id: string): Promise<boolean> {
    const result = await getPostgresPool().query('SELECT id FROM entities WHERE id = $1', [id]);
    return result.rows.length > 0;
  }

  async upsert(input: EntityUpsertInput): Promise<void> {
    await getPostgresPool().query(
      `INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         brand_kit = EXCLUDED.brand_kit,
         api_keys = EXCLUDED.api_keys,
         updated_at = NOW()`,
      [
        input.id,
        input.tenantId,
        input.name,
        input.slug,
        JSON.stringify(input.brandKit),
        JSON.stringify(input.apiKeys),
      ],
    );
  }

  async patchBrandKit(id: string, brandKitJson: string): Promise<EntityRow | null> {
    const result = await getPostgresPool().query(
      'UPDATE entities SET brand_kit = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [brandKitJson, id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresEntityRow(row) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await getPostgresPool().query('DELETE FROM entities WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresObjectiveRepository implements ObjectiveRepository {
  async listForWorkspace(workspaceId: string): Promise<ObjectiveRow[]> {
    const result = await getPostgresPool().query(
      `SELECT * FROM objectives
       WHERE is_active = 1
         AND (workspace_id IS NULL OR workspace_id = $1)
       ORDER BY is_system DESC, name ASC`,
      [workspaceId],
    );
    return result.rows.map((r) => mapPostgresObjectiveRow(r as Record<string, unknown>));
  }

  async findById(id: string): Promise<ObjectiveRow | null> {
    const result = await getPostgresPool().query('SELECT * FROM objectives WHERE id = $1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresObjectiveRow(row) : null;
  }

  async findForCampaignValidation(id: string): Promise<ObjectiveRow | null> {
    const result = await getPostgresPool().query(
      'SELECT id, workspace_id, is_system FROM objectives WHERE id = $1 AND is_active = 1',
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresObjectiveRow(row) : null;
  }

  async create(input: ObjectiveCreateInput): Promise<ObjectiveRow> {
    await getPostgresPool().query(
      `INSERT INTO objectives
         (id, workspace_id, name, description, objective_type, primary_kpi, supporting_kpis,
          conversion_event, success_criteria, default_channels, is_system, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 1, $11, $12)`,
      [
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
      ],
    );
    const created = await this.findById(input.id);
    if (!created) throw new Error('Objective create failed');
    return created;
  }

  async patch(id: string, patch: ObjectivePatchInput, updatedAt: string): Promise<ObjectiveRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      vals.push(val);
    };

    if (patch.name !== undefined) add('name', patch.name);
    if (patch.description !== undefined) add('description', patch.description);
    if (patch.objectiveType !== undefined) add('objective_type', patch.objectiveType);
    if (patch.primaryKpi !== undefined) add('primary_kpi', patch.primaryKpi);
    if (patch.conversionEvent !== undefined) add('conversion_event', patch.conversionEvent);
    if (patch.successCriteria !== undefined) add('success_criteria', patch.successCriteria);
    if (patch.isActive !== undefined) add('is_active', patch.isActive ? 1 : 0);
    if (patch.supportingKpis !== undefined) add('supporting_kpis', JSON.stringify(patch.supportingKpis));
    if (patch.defaultChannels !== undefined) add('default_channels', JSON.stringify(patch.defaultChannels));

    if (sets.length === 0) return this.findById(id);

    add('updated_at', updatedAt);
    vals.push(id);

    const result = await getPostgresPool().query(
      `UPDATE objectives SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresObjectiveRow(row) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await getPostgresPool().query('DELETE FROM objectives WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresCampaignRepository implements CampaignRepository {
  async list(filters: CampaignListFilters): Promise<CampaignRow[]> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.workspaceId) {
      conditions.push(`c.workspace_id = $${idx++}`);
      params.push(filters.workspaceId);
    }
    if (filters.status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(filters.status);
    }

    const result = await getPostgresPool().query(
      `${JOIN_SQL} WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC`,
      params,
    );
    return result.rows.map((r) => mapPostgresCampaignRow(r as Record<string, unknown>));
  }

  async findByIdWithObjective(id: string): Promise<CampaignRow | null> {
    const result = await getPostgresPool().query(`${JOIN_SQL} WHERE c.id = $1`, [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresCampaignRow(row) : null;
  }

  async findById(id: string): Promise<CampaignRow | null> {
    const result = await getPostgresPool().query('SELECT * FROM campaigns WHERE id = $1', [id]);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapPostgresCampaignRow(row) : null;
  }

  async create(input: CampaignCreateInput): Promise<CampaignRow> {
    await getPostgresPool().query(
      `INSERT INTO campaigns
         (id, workspace_id, objective_id, name, status, source_type, source_id,
          source_title, source_description, source_metadata, brief, channels, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'DRAFTING', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
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
      ],
    );
    const created = await this.findByIdWithObjective(input.id);
    if (!created) throw new Error('Campaign create failed');
    return created;
  }

  async patch(id: string, patch: CampaignPatchInput, updatedAt: string): Promise<CampaignRow | null> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      vals.push(val);
    };

    if (patch.name !== undefined) add('name', patch.name);
    if (patch.brief !== undefined) add('brief', patch.brief);
    if (patch.sourceTitle !== undefined) add('source_title', patch.sourceTitle);
    if (patch.sourceDescription !== undefined) add('source_description', patch.sourceDescription);
    if (patch.cancellationReason !== undefined) add('cancellation_reason', patch.cancellationReason);
    if (patch.scheduledAt !== undefined) add('scheduled_at', patch.scheduledAt);
    if (patch.publishedAt !== undefined) add('published_at', patch.publishedAt);
    if (patch.completedAt !== undefined) add('completed_at', patch.completedAt);
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.channels !== undefined) add('channels', JSON.stringify(patch.channels));
    if (patch.sourceMetadata !== undefined) add('source_metadata', JSON.stringify(patch.sourceMetadata));
    if (patch.objectiveId !== undefined) add('objective_id', patch.objectiveId);

    if (sets.length === 0) return this.findByIdWithObjective(id);

    add('updated_at', updatedAt);
    vals.push(id);

    const result = await getPostgresPool().query(
      `UPDATE campaigns SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (result.rows.length === 0) return null;
    return this.findByIdWithObjective(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await getPostgresPool().query('DELETE FROM campaigns WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
