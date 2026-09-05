import { db } from '../../database';
import type { TenantInsert, TenantRepository } from '../../core/coreDomainTypes';

export class SqliteTenantRepository implements TenantRepository {
  async findById(id: string): Promise<{ id: string } | null> {
    const row = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id) as { id: string } | undefined;
    return row ?? null;
  }

  async insertIfNotExists(input: TenantInsert): Promise<'inserted' | 'skipped'> {
    const existing = await this.findById(input.id);
    if (existing) return 'skipped';
    db.prepare(
      'INSERT INTO tenants (id, plan_tier, license_key) VALUES (?, ?, ?)',
    ).run(input.id, input.planTier ?? 'pro', input.licenseKey ?? null);
    return 'inserted';
  }

  async deleteById(id: string): Promise<boolean> {
    const result = db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
