import axios from 'axios';
import type { AIProvider, StructuredGenerationRequest } from '../contracts/AIProvider';

export class AnthropicAdapter implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generateStructured(req: StructuredGenerationRequest): Promise<string> {
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

    const content = (response.data as { content: Array<{ type: string; text: string }> }).content;
    const textBlock = content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Anthropic returned no text content');

    // Extract JSON from the response (model may wrap in markdown fences)
    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/```\s*([\s\S]*?)```/);
    return jsonMatch ? jsonMatch[1].trim() : raw;
  }
}
