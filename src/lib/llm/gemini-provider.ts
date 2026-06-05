// =============================================================================
// Gemini LLM Provider - Uses z-ai-web-dev-sdk
// =============================================================================

import ZAI from 'z-ai-web-dev-sdk';
import type { LLMProvider } from './provider';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
      });
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('[GeminiProvider] Generation error:', error);
      throw new Error(`Gemini generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const response = await this.generate(prompt, systemPrompt);

    // Try to extract JSON from markdown code blocks first
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        // Fall through to direct parsing
      }
    }

    // Try to find JSON object/array directly in the response
    const objectMatch = response.match(/\{[\s\S]*\}/);
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    const directMatch = objectMatch || arrayMatch;

    if (directMatch) {
      try {
        return JSON.parse(directMatch[0]) as T;
      } catch {
        // Fall through
      }
    }

    // Last resort: try parsing the entire response
    try {
      return JSON.parse(response) as T;
    } catch {
      throw new Error(`Failed to parse JSON from Gemini response. Response preview: ${response.substring(0, 200)}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const zai = await ZAI.create();
      // Simple availability check - if we can create the client, it's available
      return !!zai;
    } catch {
      return false;
    }
  }
}
