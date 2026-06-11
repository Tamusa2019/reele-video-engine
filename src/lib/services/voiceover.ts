// =============================================================================
// Voiceover Service - Real TTS using z-ai-web-dev-sdk
// Generates natural-sounding speech audio for video narration
// Falls back to proper silent audio (via ffmpeg) when TTS is unavailable
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
   * Check if the TTS SDK is available (without making an API call)
   * Just checks if the module can be imported — saves quota/credits
   */
  async isTtsAvailable(): Promise<boolean> {
    if (this.ttsAvailable !== null) return this.ttsAvailable;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      // Just try to create the client — don't make a test API call
      await ZAI.create();
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
        return this.generatePlaceholderAudio(text, language, speed);
      }
    }

    return this.generatePlaceholderAudio(text, language, speed);
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
    const voice = 'kazi'; // kazi is clear and standard

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
   * Generate placeholder audio when TTS is unavailable
   * Uses ffmpeg to create a proper silent MP3 file (not corrupt raw bytes)
   * This ensures the video always has an audio track for proper playback
   */
  private async generatePlaceholderAudio(text: string, language: string, speed: number): Promise<Buffer> {
    const durationSeconds = this.estimateDuration(text, language, speed);

    const tempDir = path.join(UPLOAD_DIR, `tts-placeholder-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const outputPath = path.join(tempDir, 'silence.mp3');

      // Use ffmpeg to generate proper silent MP3 via lavfi anullsrc
      // This creates a valid, non-corrupt audio file
      await execFileAsync('ffmpeg', [
        '-f', 'lavfi',
        '-i', `anullsrc=r=44100:cl=stereo`,
        '-t', durationSeconds.toString(),
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-y',
        outputPath,
      ], { timeout: 30000 });

      const audioBuffer = await readFile(outputPath);
      console.log(`[VoiceoverService] Generated ${durationSeconds}s silent placeholder audio via ffmpeg (${audioBuffer.length} bytes)`);
      return audioBuffer;
    } catch (error) {
      // ffmpeg not available — create a minimal valid WAV file programmatically
      console.warn('[VoiceoverService] ffmpeg silent audio generation failed, creating WAV programmatically:', error instanceof Error ? error.message : error);
      return this.generateMinimalSilentWav(durationSeconds);
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
   * Generate a minimal valid WAV file with silence programmatically
   * This is the absolute last resort when ffmpeg is not available
   * Produces a valid WAV with proper headers that any player can decode
   */
  private generateMinimalSilentWav(durationSeconds: number): Buffer {
    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = sampleRate * durationSeconds;
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);

    // WAV file structure: RIFF header + fmt chunk + data chunk
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4); // File size - 8
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Sub-chunk size
    buffer.writeUInt16LE(1, 20); // Audio format (PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // Byte rate
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // Block align
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // Data is all zeros (silence) - Buffer.alloc already fills with 0

    console.log(`[VoiceoverService] Generated ${durationSeconds}s silent WAV programmatically (${buffer.length} bytes)`);
    return buffer;
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
    return Math.max(5, Math.ceil(durationMinutes * 60)); // Minimum 5 seconds
  }
}

/** Convenience function */
export function getVoiceoverService(): VoiceoverService {
  if (!voiceoverInstance) {
    voiceoverInstance = new VoiceoverService();
  }
  return voiceoverInstance;
}
