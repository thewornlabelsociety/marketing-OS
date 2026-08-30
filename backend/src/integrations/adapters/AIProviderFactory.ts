import { aiEnv } from '../../config/aiEnvironment';
import type { AIProvider } from '../contracts/AIProvider';
import { AnthropicAdapter } from './AnthropicAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';

let _provider: AIProvider | null = null;
let _resolved = false;

export function getAIProvider(): AIProvider | null {
  if (_resolved) return _provider;
  _resolved = true;

  if (!aiEnv.isConfigured || !aiEnv.provider || !aiEnv.apiKey) {
    _provider = null;
    return null;
  }

  switch (aiEnv.provider) {
    case 'anthropic':
      _provider = new AnthropicAdapter(aiEnv.apiKey);
      break;
    case 'openai':
      _provider = new OpenAIAdapter(aiEnv.apiKey);
      break;
    default:
      _provider = null;
  }

  return _provider;
}
