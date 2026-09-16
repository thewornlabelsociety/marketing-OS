import { getCoreRepositories } from '../../db/core/createCoreRepositories';
import { KNOWLEDGE_DOMAIN_PATHS } from '../../types/marketing';
import type { KnowledgeDomain } from '../../types/marketing';

/**
 * Reads and writes marketing knowledge from the workspace's brand_kit JSON blob.
 * The brand_kit is the canonical store for brand identity, voice, audience,
 * and all other marketing intelligence for a workspace.
 */
export class MarketingKnowledgeService {
  private async getBrandKit(workspaceId: string): Promise<Record<string, unknown>> {
    const json = await getCoreRepositories().workspace.findBrandKit(workspaceId);
    if (json === null) return {};
    try { return JSON.parse(json || '{}') as Record<string, unknown>; }
    catch { return {}; }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((cur: unknown, key) => {
      if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  /** Read one or more knowledge domains for a workspace. Returns a merged object. */
  async read(workspaceId: string, domains: KnowledgeDomain[]): Promise<Record<string, unknown>> {
    const kit = await this.getBrandKit(workspaceId);
    const result: Record<string, unknown> = {};
    for (const domain of domains) {
      const paths = KNOWLEDGE_DOMAIN_PATHS[domain];
      for (const p of paths) {
        const value = this.getNestedValue(kit, p);
        if (value !== undefined) {
          result[p] = value;
        }
      }
    }
    return result;
  }

  /** Read the full brand_kit for a workspace. */
  async readAll(workspaceId: string): Promise<Record<string, unknown>> {
    return this.getBrandKit(workspaceId);
  }

  /** Deep-merge updates into the brand_kit for a workspace. */
  async update(workspaceId: string, updates: Record<string, unknown>): Promise<void> {
    const repos = getCoreRepositories();
    const current = await this.getBrandKit(workspaceId);
    const merged = deepMerge(current, updates);
    await repos.workspace.patchBrandKit(workspaceId, JSON.stringify(merged));
  }

  /**
   * Apply a structured knowledge seed to a workspace's brand_kit.
   * Only writes keys that are missing — does not overwrite existing knowledge.
   */
  async seedIfEmpty(workspaceId: string, seed: Record<string, unknown>): Promise<{ applied: boolean; skippedKeys: string[] }> {
    const repos = getCoreRepositories();
    const current = await this.getBrandKit(workspaceId);
    const skippedKeys: string[] = [];
    const toApply: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(seed)) {
      if (current[key] !== undefined) {
        skippedKeys.push(key);
      } else {
        toApply[key] = value;
      }
    }

    if (Object.keys(toApply).length === 0) {
      return { applied: false, skippedKeys };
    }

    const merged = deepMerge(current, toApply);
    await repos.workspace.patchBrandKit(workspaceId, JSON.stringify(merged));

    return { applied: true, skippedKeys };
  }

  /** Format knowledge domains as a compact string for inclusion in AI prompts. */
  async formatForPrompt(workspaceId: string, domains: KnowledgeDomain[]): Promise<string> {
    const knowledge = await this.read(workspaceId, domains);
    if (Object.keys(knowledge).length === 0) return '';
    return JSON.stringify(knowledge, null, 2);
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export const marketingKnowledgeService = new MarketingKnowledgeService();
