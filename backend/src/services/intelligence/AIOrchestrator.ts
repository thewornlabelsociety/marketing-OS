import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';
import { aiUsageLedgerService } from './AIUsageLedgerService';
import type { MarketingAIBrief, AIGenerationResult } from '../../types/marketing';

/**
 * AIOrchestrator is the single entry point for all AI generation in Marketing OS.
 * It translates a MarketingAIBrief into a provider request, logs token usage,
 * and returns the generated content.
 */
export class AIOrchestrator {
  async generate(brief: MarketingAIBrief): Promise<AIGenerationResult> {
    const provider = getAIProvider();
    if (!provider) {
      throw new Error('AI provider is not configured');
    }

    const model = brief.model ?? aiEnv.campaignModel;
    const result = await provider.generateTracked({
      systemPrompt: brief.systemPrompt,
      userPrompt: brief.userPrompt,
      model,
      maxTokens: brief.maxTokens,
    });

    // Log usage — fire-and-forget, never throws
    try {
      aiUsageLedgerService.record({
        workspaceId: brief.workspaceId,
        provider: aiEnv.provider ?? 'unknown',
        model,
        taskType: brief.taskType,
        usage: result.usage,
        artifactId: brief.artifactId ?? null,
        campaignId: brief.campaignId ?? null,
      });
    } catch (err) {
      console.warn('[AIOrchestrator] usage logging failed:', (err as Error).message);
    }

    return result;
  }

  isAvailable(): boolean {
    return aiEnv.isConfigured && getAIProvider() !== null;
  }
}

export const aiOrchestrator = new AIOrchestrator();
