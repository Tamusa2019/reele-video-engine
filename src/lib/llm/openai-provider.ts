// =============================================================================
// OpenAI LLM Provider - Stub for future implementation
// =============================================================================

import type { LLMProvider } from './provider';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';

  async generate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error('OpenAI provider not yet implemented. Please use Gemini provider.');
  }

  async generateJSON<T>(_prompt: string, _systemPrompt?: string): Promise<T> {
    throw new Error('OpenAI provider not yet implemented. Please use Gemini provider.');
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
