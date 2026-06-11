// =============================================================================
// Image Generation Service - Multi-source image generation
// Primary: z-ai-generate CLI (high quality, reliable)
// Secondary: Pollinations.ai (free, no API key needed)
// Fallback: FFmpeg gradient placeholder (always works)
// =============================================================================

import type { SceneData } from '@/lib/types';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Valid sizes for image generation
type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';

const VERTICAL_SIZE: ImageSize = '768x1344';
const HORIZONTAL_SIZE: ImageSize = '1344x768';
const SQUARE_SIZE: ImageSize = '1024x1024';

let imageGenInstance: ImageGenerationService | null = null;

export class ImageGenerationService {
  /**
   * Generate an image from a text prompt using multiple sources
   * Tries: z-ai-generate CLI → Pollinations.ai → FFmpeg gradient placeholder
   */
  async generateFromPrompt(
    prompt: string,
    orientation: 'vertical' | 'horizontal' | 'square' = 'vertical',
    projectId?: string
  ): Promise<string> {
    console.log(`[ImageGen] Generating image for prompt: "${prompt.substring(0, 80)}..."`);

    const size: ImageSize = orientation === 'vertical'
      ? VERTICAL_SIZE
      : orientation === 'horizontal'
        ? HORIZONTAL_SIZE
        : SQUARE_SIZE;

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = projectId
      ? `scene-${projectId}-${timestamp}-${randomSuffix}.png`
      : `scene-${timestamp}-${randomSuffix}.png`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const enhancedPrompt = `Professional, high-quality ${orientation} video frame: ${prompt}. Style: modern, clean, vibrant colors, suitable for social media short-form video. No text overlays, no watermarks.`;

    // Strategy 1: Try z-ai-generate CLI (highest quality, works in HF Spaces)
    try {
      const cliResult = await this.generateViaCLI(enhancedPrompt, size, filepath);
      if (cliResult) {
        console.log(`[ImageGen] Image generated via z-ai-generate CLI: ${filename}`);
        return `/api/upload/${filename}`;
      }
    } catch (error) {
      console.warn('[ImageGen] z-ai-generate CLI failed:', error instanceof Error ? error.message : error);
    }

    // Strategy 2: Try Pollinations.ai (free, no API key)
    try {
      const pollinationsResult = await this.generateViaPollinations(enhancedPrompt, size, filepath);
      if (pollinationsResult) {
        console.log(`[ImageGen] Image generated via Pollinations.ai: ${filename}`);
        return `/api/upload/${filename}`;
      }
    } catch (error) {
      console.warn('[ImageGen] Pollinations.ai failed:', error instanceof Error ? error.message : error);
    }

    // Strategy 3: FFmpeg gradient placeholder (always works)
    console.log('[ImageGen] All AI sources failed, creating gradient placeholder');
    return this.generateAttractivePlaceholder(prompt, orientation, projectId);
  }

  /**
   * Generate image using z-ai-generate CLI tool
   * This is the highest quality option available in HF Spaces
   */
  private async generateViaCLI(
    prompt: string,
    size: ImageSize,
    outputPath: string
  ): Promise<boolean> {
    try {
      // Check if z-ai-generate is available
      await execFileAsync('which', ['z-ai-generate'], { timeout: 3000 });
    } catch {
      console.log('[ImageGen] z-ai-generate CLI not found, skipping');
      return false;
    }

    try {
      await execFileAsync('z-ai-generate', [
        '-p', prompt,
        '-o', outputPath,
        '-s', size,
      ], { timeout: 60000 });

      // Verify the output file exists and is valid
      if (existsSync(outputPath)) {
        const { stat } = await import('fs/promises');
        const fileStat = await stat(outputPath);
        if (fileStat.size > 5000) {
          return true;
        }
        // File too small, probably corrupt
        console.warn(`[ImageGen] z-ai-generate output too small (${fileStat.size} bytes), discarding`);
        try {
          const { unlink } = await import('fs/promises');
          await unlink(outputPath);
        } catch {}
        return false;
      }
      return false;
    } catch (error) {
      console.warn('[ImageGen] z-ai-generate CLI error:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Generate image using Pollinations.ai (free, no API key needed)
   */
  private async generateViaPollinations(
    prompt: string,
    size: ImageSize,
    outputPath: string
  ): Promise<boolean> {
    const [width, height] = size.split('x').map(Number);
    const encodedPrompt = encodeURIComponent(prompt);

    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

    console.log('[ImageGen] Fetching from Pollinations.ai...');

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[ImageGen] Pollinations API returned ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 1000) {
      console.warn(`[ImageGen] Pollinations response too small (${buffer.length} bytes)`);
      return false;
    }

    await writeFile(outputPath, buffer);
    return true;
  }

  /**
   * Generate images for ALL scenes using multi-source approach
   */
  async generateSceneImages(
    scenes: SceneData[],
    projectId?: string
  ): Promise<Map<number, string>> {
    const imageMap = new Map<number, string>();

    console.log(`[ImageGen] Generating AI images for ALL ${scenes.length} scenes`);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const prompt = scene.imageUrl || this.buildScenePrompt(scene);

      try {
        const imageUrl = await this.generateFromPrompt(prompt, 'vertical', projectId);
        imageMap.set(i, imageUrl);
        console.log(`[ImageGen] Scene ${i + 1}/${scenes.length} (${scene.type}) - image generated`);

        // Delay between requests to respect rate limits
        if (i < scenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.warn(`[ImageGen] Failed to generate image for scene ${i} (${scene.type}):`, error instanceof Error ? error.message : error);
        const placeholderUrl = await this.generateAttractivePlaceholder(prompt, 'vertical', projectId);
        imageMap.set(i, placeholderUrl);
      }
    }

    console.log(`[ImageGen] Generated ${imageMap.size} scene images total`);
    return imageMap;
  }

  /**
   * Build a descriptive image prompt from scene data when no imageUrl is provided
   */
  private buildScenePrompt(scene: SceneData): string {
    const typeDescriptions: Record<string, string> = {
      hook: `Attention-grabbing opening scene for "${scene.text}"`,
      problem: `Dramatic visualization of the problem: ${scene.text}`,
      solution: `Inspiring visualization of the solution: ${scene.text}`,
      proof: `Scientific evidence visualization: ${scene.text}`,
      cta: `Call-to-action engaging scene: ${scene.text}`,
      transition: `Smooth transition scene: ${scene.text}`,
    };
    return typeDescriptions[scene.type] || `Video scene: ${scene.text}`;
  }

  /**
   * Generate an attractive gradient placeholder when all AI generation fails
   * Creates a proper PNG using ffmpeg with gradient + scene text overlay
   * Always produces a valid, displayable image
   */
  private async generateAttractivePlaceholder(
    prompt: string,
    orientation: 'vertical' | 'horizontal' | 'square' = 'vertical',
    projectId?: string
  ): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = projectId
      ? `placeholder-${projectId}-${timestamp}-${randomSuffix}.png`
      : `placeholder-${timestamp}-${randomSuffix}.png`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const [width, height] = orientation === 'vertical' ? [1080, 1920]
      : orientation === 'horizontal' ? [1920, 1080] : [1080, 1080];

    // Get scene-type-specific color scheme
    const colors = this.getColorScheme(prompt);

    // Strategy 1: ffmpeg gradient with text overlay
    try {
      const shortText = prompt.substring(0, 50).replace(/'/g, '').replace(/:/g, '').replace(/\n/g, ' ');

      // Try gradients filter first (produces nice diagonal gradients)
      try {
        await execFileAsync('ffmpeg', [
          '-f', 'lavfi',
          '-i', `gradients=s=${width}x${height}:c0=${colors.c0}:c1=${colors.c1}:duration=1:direction=diagonal`,
          '-vf', `drawtext=font=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf:text='${shortText}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.6:shadowx=2:shadowy=2:box=1:boxcolor=black@0.35:boxborderw=16`,
          '-frames:v', '1',
          '-pix_fmt', 'yuv420p',
          '-y',
          filepath,
        ], { timeout: 15000 });

        if (existsSync(filepath)) {
          const { stat } = await import('fs/promises');
          const s = await stat(filepath);
          if (s.size > 1000) {
            return `/api/upload/${filename}`;
          }
        }
      } catch {
        // gradients filter may not be available, try solid color
      }

      // Fallback: solid color background with text
      await execFileAsync('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=${colors.c0}:s=${width}x${height}:d=1,format=yuv420p`,
        '-vf', `drawtext=font=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf:text='${shortText}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.6:shadowx=2:shadowy=2:box=1:boxcolor=black@0.35:boxborderw=16`,
        '-frames:v', '1',
        '-pix_fmt', 'yuv420p',
        '-y',
        filepath,
      ], { timeout: 15000 });

      if (existsSync(filepath)) {
        const { stat } = await import('fs/promises');
        const s = await stat(filepath);
        if (s.size > 1000) {
          return `/api/upload/${filename}`;
        }
      }
    } catch (error) {
      console.warn('[ImageGen] FFmpeg placeholder generation failed:', error instanceof Error ? error.message : error);
    }

    // Strategy 2: Python3 to create a valid PNG (absolute fallback)
    try {
      const placeholder = await this.generatePngViaPython(width, height, colors);
      await writeFile(filepath, placeholder);
      if (existsSync(filepath)) {
        return `/api/upload/${filename}`;
      }
    } catch (error) {
      console.warn('[ImageGen] Python3 PNG generation failed:', error instanceof Error ? error.message : error);
    }

    // Strategy 3: Minimal 1x1 PNG as absolute last resort
    const MINIMAL_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await writeFile(filepath, MINIMAL_PNG);
    return `/api/upload/${filename}`;
  }

  /**
   * Get a color scheme based on the scene prompt content
   * Returns hex color codes for gradient generation
   */
  private getColorScheme(prompt: string): { c0: string; c1: string } {
    const lower = prompt.toLowerCase();

    // Science/chemistry themes - deep blue to teal
    if (lower.includes('science') || lower.includes('chemistry') || lower.includes('molecule')) {
      return { c0: '0x0B1026', c1: '0x16425B' };
    }
    // Nature/ocean themes - dark blue to ocean blue
    if (lower.includes('ocean') || lower.includes('sea') || lower.includes('water') || lower.includes('nature')) {
      return { c0: '0x0B1026', c1: '0x0E4D64' };
    }
    // Food themes - dark to warm brown
    if (lower.includes('food') || lower.includes('eat') || lower.includes('cook')) {
      return { c0: '0x1A0F0A', c1: '0x4A2C17' };
    }
    // Tech/AI themes - dark to purple
    if (lower.includes('tech') || lower.includes('ai') || lower.includes('robot')) {
      return { c0: '0x0F0A1A', c1: '0x2D1B69' };
    }
    // Health/body themes - dark to green
    if (lower.includes('health') || lower.includes('body') || lower.includes('fitness')) {
      return { c0: '0x0A1A0F', c1: '0x1B4D2E' };
    }
    // Default - navy gradient (matching HTML design)
    return { c0: '0x0F1A3E', c1: '0x1A2B5F' };
  }

  /**
   * Generate a valid PNG file using Python3 as absolute fallback
   * Creates a simple solid-color image with proper PNG format
   */
  private async generatePngViaPython(
    width: number,
    height: number,
    colors: { c0: string; c1: string }
  ): Promise<Buffer> {
    // Scale down for Python generation (it's just a fallback)
    const w = Math.min(width, 270);
    const h = Math.min(height, 480);

    const c0r = parseInt(colors.c0.replace('0x', '').substring(0, 2), 16);
    const c0g = parseInt(colors.c0.replace('0x', '').substring(2, 4), 16);
    const c0b = parseInt(colors.c0.replace('0x', '').substring(4, 6), 16);

    const pythonScript = `
import struct, zlib
w, h = ${w}, ${h}
r, g, b = ${c0r}, ${c0g}, ${c0b}
raw = b''
for y in range(h):
    raw += b'\\x00'
    for x in range(w):
        raw += struct.pack('BBB', r, g, b)
def png_chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
idat = zlib.compress(raw)
import sys
sys.stdout.buffer.write(b'\\x89PNG\\r\\n\\x1a\\n' + png_chunk(b'IHDR', ihdr) + png_chunk(b'IDAT', idat) + png_chunk(b'IEND', b''))
`;

    const { stdout } = await execFileAsync('python3', ['-c', pythonScript], {
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer',
    });

    return Buffer.from(stdout);
  }

  /**
   * Generate a thumbnail image for a project
   */
  async generateThumbnail(
    title: string,
    topic: string,
    primaryColor: string = '#1A2B5F',
    accentColor: string = '#FF6B35',
    projectId?: string
  ): Promise<string> {
    const prompt = `Eye-catching thumbnail for a video titled "${title}" about ${topic}. Bold, vibrant, click-worthy design with ${primaryColor} and ${accentColor} color scheme. Professional, social media optimized, no text (text will be overlaid).`;

    return this.generateFromPrompt(prompt, 'vertical', projectId);
  }
}

/** Convenience function */
export function getImageGenerationService(): ImageGenerationService {
  if (!imageGenInstance) {
    imageGenInstance = new ImageGenerationService();
  }
  return imageGenInstance;
}
