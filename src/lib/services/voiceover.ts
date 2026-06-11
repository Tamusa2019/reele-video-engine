// =============================================================================
// Voiceover Service - Real TTS with multiple fallback strategies
// Primary: z-ai-web-dev-sdk TTS (high quality)
// Secondary: edge-tts via Python (free Microsoft TTS, no API key needed)
// Tertiary: Silent placeholder audio (always works)
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
  private edgeTtsAvailable: boolean | null = null;

  /**
   * Check if the z-ai-web-dev-sdk TTS is available
   */
  async isTtsAvailable(): Promise<boolean> {
    if (this.ttsAvailable !== null) return this.ttsAvailable;

    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      await ZAI.create();
      this.ttsAvailable = true;
      console.log('[VoiceoverService] z-ai TTS SDK available');
    } catch (error) {
      this.ttsAvailable = false;
      console.warn('[VoiceoverService] z-ai TTS SDK not available:', error instanceof Error ? error.message : error);
    }

    return this.ttsAvailable;
  }

  /**
   * Check if edge-tts Python package is available
   * edge-tts is a free Microsoft Edge TTS service - no API key needed
   */
  async isEdgeTtsAvailable(): Promise<boolean> {
    if (this.edgeTtsAvailable !== null) return this.edgeTtsAvailable;

    try {
      await execFileAsync('python3', ['-c', 'import edge_tts; print("edge-tts available")'], { timeout: 5000 });
      this.edgeTtsAvailable = true;
      console.log('[VoiceoverService] edge-tts Python package available');
    } catch {
      // Try installing edge-tts via pip
      try {
        console.log('[VoiceoverService] edge-tts not found, attempting pip install...');
        await execFileAsync('pip3', ['install', 'edge-tts', '--break-system-packages'], { timeout: 60000 });
        this.edgeTtsAvailable = true;
        console.log('[VoiceoverService] edge-tts installed successfully');
      } catch (installError) {
        this.edgeTtsAvailable = false;
        console.warn('[VoiceoverService] edge-tts not available and could not install:', installError instanceof Error ? installError.message : installError);
      }
    }

    return this.edgeTtsAvailable;
  }

  /**
   * Generate voiceover audio from text using multiple TTS strategies
   */
  async generate(text: string, language: string, speed: number = 1.0): Promise<Buffer> {
    console.log(`[VoiceoverService] Generating voiceover for ${text.length} chars, lang=${language}, speed=${speed}`);

    const ttsSpeed = Math.max(0.5, Math.min(2.0, speed));

    // Strategy 1: Try z-ai-web-dev-sdk TTS
    const zaiAvailable = await this.isTtsAvailable();
    if (zaiAvailable) {
      try {
        const result = await this.generateRealTTS(text, language, ttsSpeed);
        if (result.length > 1000) {
          console.log(`[VoiceoverService] z-ai TTS generated ${result.length} bytes`);
          return result;
        }
        console.warn('[VoiceoverService] z-ai TTS returned too small result, trying next strategy');
      } catch (error) {
        console.warn('[VoiceoverService] z-ai TTS failed:', error instanceof Error ? error.message : error);
      }
    }

    // Strategy 2: Try edge-tts (free Microsoft TTS via Python)
    const edgeAvailable = await this.isEdgeTtsAvailable();
    if (edgeAvailable) {
      try {
        const result = await this.generateViaEdgeTts(text, language, ttsSpeed);
        if (result.length > 1000) {
          console.log(`[VoiceoverService] edge-tts generated ${result.length} bytes`);
          return result;
        }
        console.warn('[VoiceoverService] edge-tts returned too small result');
      } catch (error) {
        console.warn('[VoiceoverService] edge-tts failed:', error instanceof Error ? error.message : error);
      }
    }

    // Strategy 3: Silent placeholder
    console.log('[VoiceoverService] All TTS strategies failed, using silent placeholder');
    return this.generatePlaceholderAudio(text, language, speed);
  }

  /**
   * Generate and save voiceover to a file
   */
  async generateAndSave(
    text: string,
    language: string,
    speed: number = 1.0,
    projectId?: string
  ): Promise<string> {
    const audioBuffer = await this.generate(text, language, speed);

    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const filename = projectId
      ? `voiceover-${projectId}-${timestamp}.mp3`
      : `voiceover-${timestamp}.mp3`;
    const filepath = path.join(UPLOAD_DIR, filename);

    await writeFile(filepath, audioBuffer);

    return `/api/upload/${filename}`;
  }

  /**
   * Generate real TTS audio using z-ai-web-dev-sdk
   */
  private async generateRealTTS(text: string, language: string, speed: number): Promise<Buffer> {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const voice = 'kazi';
    const chunks = this.splitTextIntoChunks(text, 1000);
    console.log(`[VoiceoverService] z-ai TTS: splitting into ${chunks.length} chunks`);

    if (chunks.length === 1) {
      const response = await zai.audio.tts.create({
        input: chunks[0],
        voice,
        speed,
        response_format: 'wav',
        stream: false,
      });

      const arrayBuffer = await response.arrayBuffer();
      const wavBuffer = Buffer.from(new Uint8Array(arrayBuffer));
      return this.convertWavToMp3(wavBuffer);
    }

    // Multiple chunks
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

        console.log(`[VoiceoverService] z-ai TTS chunk ${i + 1}/${chunks.length} generated (${buffer.length} bytes)`);
      }

      return await this.concatenateAudioChunks(chunkPaths);
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Generate voiceover using edge-tts (free Microsoft TTS via Python)
   * Works without any API key - perfect for HF Spaces
   */
  private async generateViaEdgeTts(text: string, language: string, speed: number): Promise<Buffer> {
    const tempDir = path.join(UPLOAD_DIR, `tts-edge-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const outputPath = path.join(tempDir, 'output.mp3');

      // Choose voice based on language
      const voiceMap: Record<string, string> = {
        'en': 'en-US-AriaNeural',
        'ar': 'ar-SA-HamedNeural',
      };
      const voice = voiceMap[language] || 'en-US-AriaNeural';

      // Convert speed from 0.5-2.0 range to edge-tts rate format (+0% to +100%)
      const ratePercent = Math.round((speed - 1.0) * 100);
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      // Split text if too long (edge-tts has limits)
      const chunks = this.splitTextIntoChunks(text, 2000);

      if (chunks.length === 1) {
        // Single chunk - generate directly
        const pythonScript = `
import asyncio, edge_tts, sys

async def main():
    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    output = sys.argv[4]
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output)

asyncio.run(main())
`;
        await execFileAsync('python3', ['-c', pythonScript, text, voice, rateStr, outputPath], {
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } else {
        // Multiple chunks - generate each and concatenate
        const chunkPaths: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkPath = path.join(tempDir, `chunk-${i}.mp3`);
          const pythonScript = `
import asyncio, edge_tts, sys

async def main():
    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    output = sys.argv[4]
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output)

asyncio.run(main())
`;
          await execFileAsync('python3', ['-c', pythonScript, chunks[i], voice, rateStr, chunkPath], {
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
          });
          chunkPaths.push(chunkPath);
        }

        // Concatenate chunks
        if (chunkPaths.length > 0) {
          const concatContent = chunkPaths.map(p => `file '${p}'`).join('\n');
          const concatFilePath = path.join(tempDir, 'concat.txt');
          await writeFile(concatFilePath, concatContent);

          await execFileAsync('ffmpeg', [
            '-f', 'concat', '-safe', '0', '-i', concatFilePath,
            '-c:a', 'libmp3lame', '-b:a', '128k', '-y', outputPath,
          ], { timeout: 60000 });
        }
      }

      if (existsSync(outputPath)) {
        const buffer = await readFile(outputPath);
        console.log(`[VoiceoverService] edge-tts generated ${buffer.length} bytes MP3`);
        return buffer;
      }

      throw new Error('edge-tts output file not found');
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {}
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
   * Convert WAV buffer to MP3 using ffmpeg
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
      console.warn('[VoiceoverService] WAV to MP3 conversion failed, using raw WAV:', error instanceof Error ? error.message : error);
      return wavBuffer;
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Concatenate multiple audio chunks into one MP3
   */
  private async concatenateAudioChunks(chunkPaths: string[]): Promise<Buffer> {
    const tempDir = path.join(UPLOAD_DIR, `tts-concat-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
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
      console.warn('[VoiceoverService] Audio concatenation failed:', error instanceof Error ? error.message : error);
      if (chunkPaths.length > 0) {
        return readFile(chunkPaths[0]);
      }
      throw error;
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Generate placeholder audio when TTS is unavailable
   * Uses ffmpeg to create proper silent MP3
   */
  private async generatePlaceholderAudio(text: string, language: string, speed: number): Promise<Buffer> {
    const durationSeconds = this.estimateDuration(text, language, speed);

    const tempDir = path.join(UPLOAD_DIR, `tts-placeholder-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const outputPath = path.join(tempDir, 'silence.mp3');

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
      console.log(`[VoiceoverService] Generated ${durationSeconds}s silent placeholder audio (${audioBuffer.length} bytes)`);
      return audioBuffer;
    } catch (error) {
      console.warn('[VoiceoverService] ffmpeg silent audio generation failed:', error instanceof Error ? error.message : error);
      return this.generateMinimalSilentWav(durationSeconds);
    } finally {
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Generate a minimal valid WAV file with silence
   */
  private generateMinimalSilentWav(durationSeconds: number): Buffer {
    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = sampleRate * durationSeconds;
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);

    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

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
    return Math.max(5, Math.ceil(durationMinutes * 60));
  }
}

/** Convenience function */
export function getVoiceoverService(): VoiceoverService {
  if (!voiceoverInstance) {
    voiceoverInstance = new VoiceoverService();
  }
  return voiceoverInstance;
}
