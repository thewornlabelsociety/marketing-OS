import type { ModelPricing } from '../types/marketing';

// Token pricing in USD per 1,000 tokens.
// Update these when provider pricing changes.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-5-20251101':    { inputPer1kTokens: 0.015,   outputPer1kTokens: 0.075   },
  'claude-sonnet-4-5-20251015':  { inputPer1kTokens: 0.003,   outputPer1kTokens: 0.015   },
  'claude-haiku-4-5-20251001':   { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  // OpenAI
  'gpt-4o':                      { inputPer1kTokens: 0.005,   outputPer1kTokens: 0.015   },
  'gpt-4o-mini':                 { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006  },
  // Gemini
  'gemini-1.5-pro':              { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005   },
  'gemini-1.5-flash':            { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
};

/**
 * Static USD→NZD estimate.
 * This rate is not real-time. NZD figures derived from it are estimates only.
 * Every usage record stores the exact rate and source used — never recalculate
 * historical records using a later rate.
 */
export const STATIC_USD_TO_NZD = 1.64;
export const FX_RATE_SOURCE = 'static' as const;

export interface CostResult {
  /** Provider cost in USD, derived from published pricing */
  usd: number;
  /** NZD estimate at the rate captured in fxRateUsed — NOT a provider-billed amount */
  estimatedNzd: number;
  /** The exact USD→NZD rate used to produce estimatedNzd */
  fxRateUsed: number;
  /** How the rate was obtained — 'static' means hardcoded approximation */
  fxRateSource: string;
}

export function computeCost(model: string, inputTokens: number, outputTokens: number): CostResult {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return { usd: 0, estimatedNzd: 0, fxRateUsed: STATIC_USD_TO_NZD, fxRateSource: FX_RATE_SOURCE };
  }
  const usd = (inputTokens / 1000) * pricing.inputPer1kTokens + (outputTokens / 1000) * pricing.outputPer1kTokens;
  return {
    usd,
    estimatedNzd: usd * STATIC_USD_TO_NZD,
    fxRateUsed: STATIC_USD_TO_NZD,
    fxRateSource: FX_RATE_SOURCE,
  };
}
