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
   * The returned string is the raw JSON response which callers must parse.
   */
  generateStructured(request: StructuredGenerationRequest): Promise<string>;
}
