import { getCoreRepositories } from '../../db/core/createCoreRepositories';

export class BrandMemoryService {
  public static async syncHookToVault(entityId: string, hook: string): Promise<boolean> {
    const repos = getCoreRepositories();
    const brandKitJson = await repos.workspace.findBrandKit(entityId);
    if (brandKitJson === null) return false;

    const kit = JSON.parse(brandKitJson) as Record<string, unknown> & { memoryVault?: { topPerformingHooks: string[] } };
    if (!kit.memoryVault) kit.memoryVault = { topPerformingHooks: [] };
    if (!kit.memoryVault.topPerformingHooks) kit.memoryVault.topPerformingHooks = [];

    if (!kit.memoryVault.topPerformingHooks.includes(hook)) {
      kit.memoryVault.topPerformingHooks.unshift(hook);
      await repos.workspace.patchBrandKit(entityId, JSON.stringify(kit));
      return true;
    }
    return false;
  }
}
