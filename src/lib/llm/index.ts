// =============================================================================
// LLM Service - Provider-agnostic LLM layer with configurable provider
//
// Set LLM_PROVIDER env var to choose your provider:
//   "groq"   → Groq (free, fast, 30 req/min) — default
//   "gemini" → Google Gemini (free, 15 req/min)
//
// If LLM_PROVIDER is not set, tries providers in order: groq → gemini
// If the chosen provider fails, automatically falls back to the next one.
// =============================================================================

import type { LLMProvider } from './provider';
import { GroqProvider } from './groq-provider';
import { GeminiProvider } from './gemini-provider';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';

// Singleton instance
let llmServiceInstance: LLMService | null = null;

export class LLMService {
  private providers: LLMProvider[];
  private cachedProvider: LLMProvider | null = null;

  constructor() {
    // All available providers (order = priority for auto-detection)
    this.providers = [
      new GroqProvider(),
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

  /** Find the first available provider, respecting LLM_PROVIDER env var */
  async getAvailableProvider(): Promise<LLMProvider> {
    // Return cached provider if still available
    if (this.cachedProvider) {
      if (await this.cachedProvider.isAvailable()) {
        return this.cachedProvider;
      }
      console.warn('[LLMService] Cached provider no longer available, finding new one');
      this.cachedProvider = null;
    }

    const preferredProvider = process.env.LLM_PROVIDER?.toLowerCase().trim();

    // If LLM_PROVIDER is set, try that specific provider first
    if (preferredProvider) {
      const match = this.providers.find(p => p.name === preferredProvider);
      if (match) {
        try {
          const available = await match.isAvailable();
          if (available) {
            console.log(`[LLMService] Using preferred provider: ${match.name}`);
            this.cachedProvider = match;
            return match;
          }
          console.warn(`[LLMService] Preferred provider "${preferredProvider}" is not available (missing API key?). Falling back...`);
        } catch (error) {
          console.warn(`[LLMService] Preferred provider "${preferredProvider}" failed:`, error);
        }
      } else {
        console.warn(`[LLMService] Unknown LLM_PROVIDER: "${preferredProvider}". Available: groq, gemini`);
      }
    }

    // Auto-detect: try providers in priority order
    console.log('[LLMService] Checking providers for availability...');
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        console.log(`[LLMService] Provider ${provider.name}: ${available ? 'AVAILABLE' : 'unavailable'}`);
        if (available) {
          this.cachedProvider = provider;
          return provider;
        }
      } catch (error) {
        console.warn(`[LLMService] Provider ${provider.name} check error:`, error);
      }
    }

    throw new Error(
      'No LLM provider available. Please set one of these environment variables:\n' +
      '  - GROQ_API_KEY (free, recommended) → https://console.groq.com/keys\n' +
      '  - GEMINI_API_KEY (free) → https://aistudio.google.com/apikey'
    );
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
