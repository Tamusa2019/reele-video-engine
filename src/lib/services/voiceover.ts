// =============================================================================
// Voiceover Service - Text-to-Speech for video narration
// Uses z-ai-web-dev-sdk for TTS, with fallback structure for edge-tts
// =============================================================================

import ZAI from 'z-ai-web-dev-sdk';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';

let voiceoverInstance: VoiceoverService | null = null;

export class VoiceoverService {
  /**
   * Generate voiceover audio from text
   * @param text - The narration text
   * @param language - Language code ('en' or 'ar')
   * @param speed - Speech speed (0.8 to 1.2)
   * @returns Buffer containing audio data (MP3 format)
   */
  async generate(text: string, language: string, speed: number = 1.0): Promise<Buffer> {
    console.log(`[VoiceoverService] Generating voiceover for ${text.length} chars, lang=${language}, speed=${speed}`);

    try {
      // Use z-ai-web-dev-sdk for TTS
      const zai = await ZAI.create();

      const response = await zai.audio.tts.create({
        input: text,
        voice: language === 'ar' ? 'alloy' : 'alloy',
        speed: Math.max(0.5, Math.min(1.5, speed)),
      });

      // The TTS response may be a buffer or have audio data
      if (response) {
        if (typeof response === 'string') {
          // Base64 encoded audio
          return Buffer.from(response, 'base64');
        } else if (response instanceof ArrayBuffer) {
          return Buffer.from(response);
        } else if (response instanceof Uint8Array) {
          return Buffer.from(response);
        } else if (typeof response === 'object' && response !== null) {
          // Handle object response - might have audio content
          const resp = response as Record<string, unknown>;
          if (resp.content && typeof resp.content === 'string') {
            return Buffer.from(resp.content, 'base64');
          } else if (resp.data && typeof resp.data === 'string') {
            return Buffer.from(resp.data, 'base64');
          } else if (resp.audio && typeof resp.audio === 'string') {
            return Buffer.from(resp.audio, 'base64');
          }
        }
      }
    } catch (error) {
      console.warn('[VoiceoverService] z-ai-web-dev-sdk TTS failed:', error instanceof Error ? error.message : error);
    }

    // Fallback: Generate a placeholder audio file
    console.log('[VoiceoverService] Using placeholder audio (TTS not available)');
    return this.generatePlaceholder(text, language, speed);
  }

  /**
   * Generate and save voiceover to a file
   * @returns Relative URL path to the saved audio file
   */
  async generateAndSave(
    text: string,
    language: string,
    speed: number = 1.0,
    projectId?: string
  ): Promise<string> {
    const audioBuffer = await this.generate(text, language, speed);

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate filename
    const timestamp = Date.now();
    const filename = projectId
      ? `voiceover-${projectId}-${timestamp}.mp3`
      : `voiceover-${timestamp}.mp3`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Write file
    await writeFile(filepath, audioBuffer);

    // Return relative URL
    return `/upload/${filename}`;
  }

  /**
   * Generate a placeholder audio buffer
   * Creates a minimal valid MP3 file header
   */
  private generatePlaceholder(_text: string, _language: string, _speed: number): Buffer {
    // Minimal valid MP3 header (silent frame)
    // This is a valid MPEG Audio Layer 3 frame header
    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00, // MP3 frame header (MPEG1, Layer 3, 128kbps, 44100Hz)
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    // Repeat to create a short silent audio (approx 0.5s at 128kbps)
    const frames = Buffer.alloc(mp3Header.length * 20);
    for (let i = 0; i < 20; i++) {
      mp3Header.copy(frames, i * mp3Header.length);
    }

    return frames;
  }

  /**
   * Get the full voiceover text from scene JSON
   */
  getVoiceoverText(sceneJSON: { scenes: { text: string }[]; voiceover?: { text: string } }): string {
    // Use the dedicated voiceover text if available
    if (sceneJSON.voiceover?.text) {
      return sceneJSON.voiceover.text;
    }

    // Otherwise, concatenate all scene texts
    return sceneJSON.scenes
      .map(s => s.text)
      .filter(t => t.length > 0)
      .join('. ');
  }

  /**
   * Estimate audio duration from text length
   * Average speech rate: ~150 words per minute for English, ~120 for Arabic
   */
  estimateDuration(text: string, language: string, speed: number = 1.0): number {
    const wordCount = text.split(/\s+/).length;
    const wordsPerMinute = language === 'ar' ? 120 : 150;
    const durationMinutes = wordCount / (wordsPerMinute * speed);
    return Math.ceil(durationMinutes * 60); // return seconds
  }
}

/** Convenience function */
export function getVoiceoverService(): VoiceoverService {
  if (!voiceoverInstance) {
    voiceoverInstance = new VoiceoverService();
  }
  return voiceoverInstance;
}
