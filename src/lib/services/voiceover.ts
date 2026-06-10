// =============================================================================
// Voiceover Service - Real TTS using z-ai-web-dev-sdk
// Generates natural-sounding speech audio for video narration
// Falls back to placeholder audio only if TTS is unavailable
// =============================================================================

import { writeFile, mkdir, readFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let voiceoverInstance: VoiceoverService | null = null;

export class VoiceoverService {
  private ttsAvailable: boolean | null = null;

  /**
   * Check if the TTS SDK is available
   */
  async isTtsAvailable(): Promise<boolean> {
    if (this.ttsAvailable !== null) return this.ttsAvailable;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();
      // Test with a tiny text
      await zai.audio.tts.create({
        input: 'Test',
        voice: 'kazi',
        speed: 1.0,
        response_format: 'wav',
        stream: false,
      });
      this.ttsAvailable = true;
      console.log('[VoiceoverService] TTS SDK available - real voiceover enabled');
    } catch (error) {
      this.ttsAvailable = false;
      console.warn('[VoiceoverService] TTS SDK not available, will use placeholder audio:', error instanceof Error ? error.message : error);
    }

    return this.ttsAvailable;
  }

  /**
   * Generate voiceover audio from text using real TTS
   * Splits long text into chunks (max 1024 chars per TTS request)
   * Concatenates chunks using ffmpeg
   */
  async generate(text: string, language: string, speed: number = 1.0): Promise<Buffer> {
    console.log(`[VoiceoverService] Generating voiceover for ${text.length} chars, lang=${language}, speed=${speed}`);

    // Clamp speed to TTS API limits
    const ttsSpeed = Math.max(0.5, Math.min(2.0, speed));

    const available = await this.isTtsAvailable();

    if (available) {
      try {
        return await this.generateRealTTS(text, language, ttsSpeed);
      } catch (error) {
        console.warn('[VoiceoverService] Real TTS failed, falling back to placeholder:', error instanceof Error ? error.message : error);
        return this.generatePlaceholder(text, language, speed);
      }
    }

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
    return `/api/upload/${filename}`;
  }

  /**
   * Generate real TTS audio using z-ai-web-dev-sdk
   * Handles text > 1024 chars by splitting into chunks and concatenating
   */
  private async generateRealTTS(text: string, language: string, speed: number): Promise<Buffer> {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    // Choose voice based on language
    const voice = language === 'ar' ? 'kazi' : 'kazi'; // kazi is clear and standard

    // Split text into chunks of max 1000 chars (leaving margin for 1024 limit)
    const chunks = this.splitTextIntoChunks(text, 1000);
    console.log(`[VoiceoverService] TTS: splitting into ${chunks.length} chunks`);

    if (chunks.length === 1) {
      // Simple case: single chunk, generate directly
      const response = await zai.audio.tts.create({
        input: chunks[0],
        voice,
        speed,
        response_format: 'wav',
        stream: false,
      });

      const arrayBuffer = await response.arrayBuffer();
      const wavBuffer = Buffer.from(new Uint8Array(arrayBuffer));

      // Convert WAV to MP3 for smaller file size
      return this.convertWavToMp3(wavBuffer);
    }

    // Multiple chunks: generate each, then concatenate with ffmpeg
    const tempDir = path.join(UPLOAD_DIR, `tts-temp-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const chunkPaths: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(tempDir, `chunk-${i}.wav`);

        const response = await zai.audio.tts.create({
          input: chunks[i],
          voice,
          speed,
          response_format: 'wav',
          stream: false,
        });

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(new Uint8Array(arrayBuffer));
        await writeFile(chunkPath, buffer);
        chunkPaths.push(chunkPath);

        console.log(`[VoiceoverService] TTS chunk ${i + 1}/${chunks.length} generated (${buffer.length} bytes)`);
      }

      // Concatenate all WAV chunks into one MP3 using ffmpeg
      return await this.concatenateAudioChunks(chunkPaths);
    } finally {
      // Clean up temp files
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Split text into chunks respecting sentence boundaries
   */
  private splitTextIntoChunks(text: string, maxLength: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

    return chunks;
  }

  /**
   * Convert WAV buffer to MP3 using ffmpeg for smaller file size
   */
  private async convertWavToMp3(wavBuffer: Buffer): Promise<Buffer> {
    const tempDir = path.join(UPLOAD_DIR, `tts-convert-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const wavPath = path.join(tempDir, 'input.wav');
      const mp3Path = path.join(tempDir, 'output.mp3');

      await writeFile(wavPath, wavBuffer);

      await execFileAsync('ffmpeg', [
        '-i', wavPath,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-y',
        mp3Path,
      ], { timeout: 30000 });

      const mp3Buffer = await readFile(mp3Path);
      return mp3Buffer;
    } catch (error) {
      // If ffmpeg conversion fails, return the original WAV
      console.warn('[VoiceoverService] WAV to MP3 conversion failed, using raw WAV:', error instanceof Error ? error.message : error);
      return wavBuffer;
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Concatenate multiple WAV audio chunks into one MP3
   */
  private async concatenateAudioChunks(chunkPaths: string[]): Promise<Buffer> {
    const tempDir = path.join(UPLOAD_DIR, `tts-concat-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      // Create concat list file
      const concatContent = chunkPaths.map(p => `file '${p}'`).join('\n');
      const concatFilePath = path.join(tempDir, 'concat.txt');
      await writeFile(concatFilePath, concatContent);

      const outputPath = path.join(tempDir, 'output.mp3');

      await execFileAsync('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-y',
        outputPath,
      ], { timeout: 60000 });

      const outputBuffer = await readFile(outputPath);
      console.log(`[VoiceoverService] Concatenated ${chunkPaths.length} chunks into ${outputBuffer.length} bytes MP3`);
      return outputBuffer;
    } catch (error) {
      // If concatenation fails, return the first chunk as-is
      console.warn('[VoiceoverService] Audio concatenation failed:', error instanceof Error ? error.message : error);
      if (chunkPaths.length > 0) {
        return readFile(chunkPaths[0]);
      }
      throw error;
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Generate a placeholder audio buffer (fallback when TTS unavailable)
   * Creates a minimal valid MP3 file (silent) with duration matching the text
   */
  private generatePlaceholder(text: string, _language: string, speed: number): Buffer {
    const durationSeconds = this.estimateDuration(text, _language, speed);

    // Minimal valid MP3 frame header (MPEG1, Layer 3, 128kbps, 44100Hz)
    const frameDuration = 0.026;
    const frameCount = Math.ceil(durationSeconds / frameDuration);

    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

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
