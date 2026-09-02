import axios from 'axios';
import type { AIProvider, StructuredGenerationRequest } from '../contracts/AIProvider';
import type { AIGenerationResult } from '../../types/marketing';

export class AnthropicAdapter implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generateTracked(req: StructuredGenerationRequest): Promise<AIGenerationResult> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const data = response.data as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Anthropic returned no text content');

    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/```\s*([\s\S]*?)```/);
    const content = jsonMatch ? jsonMatch[1].trim() : raw;

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    return {
      content,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    };
  }

  async generateStructured(req: StructuredGenerationRequest): Promise<string> {
    return (await this.generateTracked(req)).content;
  }
}
