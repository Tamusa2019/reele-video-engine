// =============================================================================
// Voiceover Service - Text-to-Speech for video narration
// Uses placeholder audio for MVP (can be upgraded to Google Cloud TTS later)
// =============================================================================

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';

let voiceoverInstance: VoiceoverService | null = null;

export class VoiceoverService {
  /**
   * Generate voiceover audio from text
   * Currently generates a silent placeholder MP3
   * TODO: Integrate Google Cloud Text-to-Speech for real voiceover
   */
  async generate(text: string, language: string, speed: number = 1.0): Promise<Buffer> {
    console.log(`[VoiceoverService] Generating voiceover for ${text.length} chars, lang=${language}, speed=${speed}`);

    // For MVP, generate a placeholder audio file
    // Duration is estimated from text length for proper subtitle sync
    console.log('[VoiceoverService] Using placeholder audio (TTS not yet integrated)');
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
   * Creates a minimal valid MP3 file (silent) with duration matching the text
   */
  private generatePlaceholder(text: string, _language: string, speed: number): Buffer {
    // Estimate duration from text length
    const durationSeconds = this.estimateDuration(text, _language, speed);

    // Minimal valid MP3 frame header (MPEG1, Layer 3, 128kbps, 44100Hz)
    // Each frame is ~26ms at 128kbps/44100Hz
    const frameDuration = 0.026; // seconds per frame
    const frameCount = Math.ceil(durationSeconds / frameDuration);

    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    // Create silent audio matching the estimated duration
    const frames = Buffer.alloc(mp3Header.length * frameCount);
    for (let i = 0; i < frameCount; i++) {
      mp3Header.copy(frames, i * mp3Header.length);
    }

    console.log(`[VoiceoverService] Generated ${durationSeconds}s placeholder audio (${frameCount} frames)`);
    return frames;
  }

  /**
   * Get the full voiceover text from scene JSON
   */
  getVoiceoverText(sceneJSON: { scenes: { text: string }[]; voiceover?: { text: string } }): string {
    if (sceneJSON.voiceover?.text) {
      return sceneJSON.voiceover.text;
    }

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
    return Math.ceil(durationMinutes * 60);
  }
}

/** Convenience function */
export function getVoiceoverService(): VoiceoverService {
  if (!voiceoverInstance) {
    voiceoverInstance = new VoiceoverService();
  }
  return voiceoverInstance;
}
