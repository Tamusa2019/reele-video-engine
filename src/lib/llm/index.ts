// =============================================================================
// LLM Service - Provider-agnostic LLM layer with priority fallback
// Priority: Gemini > Claude > OpenAI
// =============================================================================

import type { LLMProvider } from './provider';
import { GeminiProvider } from './gemini-provider';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';

// Singleton instance
let llmServiceInstance: LLMService | null = null;

export class LLMService {
  private providers: LLMProvider[];
  private cachedProvider: LLMProvider | null = null;

  constructor() {
    this.providers = [
      new GeminiProvider(),
      new ClaudeProvider(),
      new OpenAIProvider(),
    ];
  }

  /** Get the singleton instance */
  static getInstance(): LLMService {
    if (!llmServiceInstance) {
      llmServiceInstance = new LLMService();
    }
    return llmServiceInstance;
  }

  /** Find the first available provider */
  async getAvailableProvider(): Promise<LLMProvider> {
    // Return cached provider if still available
    if (this.cachedProvider) {
      if (await this.cachedProvider.isAvailable()) {
        return this.cachedProvider;
      }
      this.cachedProvider = null;
    }

    // Try providers in priority order
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          this.cachedProvider = provider;
          console.log(`[LLMService] Using provider: ${provider.name}`);
          return provider;
        }
      } catch (error) {
        console.warn(`[LLMService] Provider ${provider.name} availability check failed:`, error);
      }
    }

    throw new Error('No LLM provider available. Please check your API keys and configuration.');
  }

  /** Generate a text response */
  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const provider = await this.getAvailableProvider();
    return provider.generate(prompt, systemPrompt);
  }

  /** Generate a structured JSON response */
  async generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const provider = await this.getAvailableProvider();
    return provider.generateJSON<T>(prompt, systemPrompt);
  }
}

/** Convenience function to get the LLM service singleton */
export function getLLMService(): LLMService {
  return LLMService.getInstance();
}
