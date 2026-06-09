import Groq from 'groq-sdk';
import type { LLMProvider } from './provider';

export class GroqProvider implements LLMProvider {
  name = 'groq';

  private getClient(): Groq {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is not set. Get a free key at https://console.groq.com/keys');
    }
    return new Groq({ apiKey });
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const client = this.getClient();
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[GroqProvider] Generation error:', msg);
      if (msg.includes('429') || msg.includes('rate_limit')) {
        throw new Error('Groq API rate limit reached. Wait a moment and try again.');
      }
      throw new Error(`Groq generation failed: ${msg}`);
    }
  }

  async generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const response = await this.generate(prompt, systemPrompt);
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      try { return JSON.parse(jsonMatch[1].trim()) as T; } catch {}
    }
    const objectMatch = response.match(/\{[\s\S]*\}/);
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    const directMatch = objectMatch || arrayMatch;
    if (directMatch) {
      try { return JSON.parse(directMatch[0]) as T; } catch {}
    }
    try { return JSON.parse(response) as T; }
    catch { throw new Error(`Failed to parse JSON from Groq response. Preview: ${response.substring(0, 200)}`); }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('[GroqProvider] GROQ_API_KEY not set');
      return false;
    }
    console.log('[GroqProvider] GROQ_API_KEY found - provider available');
    return true;
  }
}
