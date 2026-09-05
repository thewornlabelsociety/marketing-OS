import { db } from '../../database';
import type { EntityRow } from '../../../types';
import type { EntityUpsertInput, WorkspaceRepository } from '../../core/coreDomainTypes';

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  async listActive(): Promise<EntityRow[]> {
    return db
      .prepare('SELECT * FROM entities WHERE is_archived = 0 ORDER BY name ASC')
      .all() as EntityRow[];
  }

  async findById(id: string): Promise<EntityRow | null> {
    const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as EntityRow | undefined;
    return row ?? null;
  }

  async findBrandKit(id: string): Promise<string | null> {
    const row = db.prepare('SELECT brand_kit FROM entities WHERE id = ?').get(id) as { brand_kit: string } | undefined;
    return row?.brand_kit ?? null;
  }

  async exists(id: string): Promise<boolean> {
    const row = db.prepare('SELECT id FROM entities WHERE id = ?').get(id);
    return !!row;
  }

  async upsert(input: EntityUpsertInput): Promise<void> {
    db.prepare(`
      INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        slug = excluded.slug,
        brand_kit = excluded.brand_kit,
        api_keys = excluded.api_keys,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      input.id,
      input.tenantId,
      input.name,
      input.slug,
      JSON.stringify(input.brandKit),
      JSON.stringify(input.apiKeys),
    );
  }

  async patchBrandKit(id: string, brandKitJson: string): Promise<EntityRow | null> {
    const result = db.prepare(
      'UPDATE entities SET brand_kit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run(brandKitJson, id);
    if (result.changes === 0) return null;
    return this.findById(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = db.prepare('DELETE FROM entities WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
