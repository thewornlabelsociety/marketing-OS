export type AIProviderName = 'anthropic' | 'openai' | 'gemini';

export interface AIEnvironment {
  provider: AIProviderName | null;
  apiKey: string | null;
  campaignModel: string;
  revisionModel: string;
  isConfigured: boolean;
}

const PROVIDER_DEFAULTS: Record<AIProviderName, { campaign: string; revision: string }> = {
  anthropic: { campaign: 'claude-opus-4-5-20251101', revision: 'claude-sonnet-4-5-20251015' },
  openai:    { campaign: 'gpt-4o', revision: 'gpt-4o-mini' },
  gemini:    { campaign: 'gemini-1.5-pro', revision: 'gemini-1.5-flash' },
};

const KEY_ENV_VARS: Record<AIProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai:    'OPENAI_API_KEY',
  gemini:    'GEMINI_API_KEY',
};

function resolveAIEnvironment(): AIEnvironment {
  const providerRaw = process.env.AI_PROVIDER?.toLowerCase().trim();

  if (!providerRaw) {
    return { provider: null, apiKey: null, campaignModel: '', revisionModel: '', isConfigured: false };
  }

  if (!['anthropic', 'openai', 'gemini'].includes(providerRaw)) {
    console.warn(`[AI] Unknown AI_PROVIDER "${providerRaw}" — campaign planning disabled`);
    return { provider: null, apiKey: null, campaignModel: '', revisionModel: '', isConfigured: false };
  }

  const provider = providerRaw as AIProviderName;
  const apiKey = process.env[KEY_ENV_VARS[provider]] ?? null;

  if (!apiKey) {
    console.warn(`[AI] AI_PROVIDER is "${provider}" but ${KEY_ENV_VARS[provider]} is not set — campaign planning disabled`);
    return { provider, apiKey: null, campaignModel: '', revisionModel: '', isConfigured: false };
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  const campaignModel = process.env.AI_CAMPAIGN_MODEL || defaults.campaign;
  const revisionModel = process.env.AI_REVISION_MODEL || defaults.revision;

  return { provider, apiKey, campaignModel, revisionModel, isConfigured: true };
}

export const aiEnv = resolveAIEnvironment();
