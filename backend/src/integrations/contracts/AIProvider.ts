import type { AIUsageData, AIGenerationResult } from '../../types/marketing';

export type { AIUsageData, AIGenerationResult };

export interface StructuredGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens?: number;
}

export interface AIProvider {
  /**
   * Generate a structured JSON response.
   * The system prompt must instruct the model to respond with valid JSON only.
   * Returns the raw JSON string — callers must parse.
   * @deprecated Use generateTracked when you need usage data for cost accounting.
   */
  generateStructured(request: StructuredGenerationRequest): Promise<string>;

  /**
   * Like generateStructured but also returns token usage from the provider.
   * Use this for all new call sites so AI costs can be logged.
   */
  generateTracked(request: StructuredGenerationRequest): Promise<AIGenerationResult>;
}
