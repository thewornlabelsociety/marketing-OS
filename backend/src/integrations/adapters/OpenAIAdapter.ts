import axios from 'axios';
import type { AIProvider, StructuredGenerationRequest } from '../contracts/AIProvider';
import type { AIGenerationResult } from '../../types/marketing';

export class OpenAIAdapter implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generateTracked(req: StructuredGenerationRequest): Promise<AIGenerationResult> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const data = response.data as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned no content');

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? (inputTokens + outputTokens);

    return {
      content: content.trim(),
      usage: { inputTokens, outputTokens, totalTokens },
    };
  }

  async generateStructured(req: StructuredGenerationRequest): Promise<string> {
    return (await this.generateTracked(req)).content;
  }
}
