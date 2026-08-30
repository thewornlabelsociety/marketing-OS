import { db } from '../db/database';

export class BrandMemoryService {
  public static syncHookToVault(entityId: string, hook: string): boolean {
    const row = db.prepare('SELECT brand_kit FROM entities WHERE id = ?').get(entityId) as
      | { brand_kit: string }
      | undefined;
    if (!row) return false;

    const kit = JSON.parse(row.brand_kit);
    if (!kit.memoryVault) kit.memoryVault = { topPerformingHooks: [] };
    if (!kit.memoryVault.topPerformingHooks) kit.memoryVault.topPerformingHooks = [];

    if (!kit.memoryVault.topPerformingHooks.includes(hook)) {
      kit.memoryVault.topPerformingHooks.unshift(hook);
      db.prepare('UPDATE entities SET brand_kit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        JSON.stringify(kit),
        entityId
      );
      return true;
    }
    return false;
  }
}
