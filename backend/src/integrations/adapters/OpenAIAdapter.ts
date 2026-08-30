import axios from 'axios';
import type { AIProvider, StructuredGenerationRequest } from '../contracts/AIProvider';

export class OpenAIAdapter implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generateStructured(req: StructuredGenerationRequest): Promise<string> {
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

    const choices = (response.data as { choices: Array<{ message: { content: string } }> }).choices;
    const content = choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned no content');
    return content.trim();
  }
}
