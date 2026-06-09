// =============================================================================
// Gemini LLM Provider - Uses official Google Gemini API
// Works from any server (Render, Vercel, local, etc.)
// Requires GEMINI_API_KEY environment variable
// =============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider } from './provider';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';

  private getClient(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Get one free at https://aistudio.google.com/apikey');
    }
    return new GoogleGenerativeAI(apiKey);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const genAI = this.getClient();
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: systemPrompt || 'You are a helpful assistant.',
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text();
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
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return false;
      // Try a minimal request to verify the key works
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      await model.generateContent('hi');
      return true;
    } catch {
      return false;
    }
  }
}
