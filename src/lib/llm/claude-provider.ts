// =============================================================================
// Claude LLM Provider - Stub for future implementation
// =============================================================================

import type { LLMProvider } from './provider';

export class ClaudeProvider implements LLMProvider {
  name = 'claude';

  async generate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error('Claude provider not yet implemented. Please use Gemini provider.');
  }

  async generateJSON<T>(_prompt: string, _systemPrompt?: string): Promise<T> {
    throw new Error('Claude provider not yet implemented. Please use Gemini provider.');
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
