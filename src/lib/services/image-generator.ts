// =============================================================================
// Image Generation Service - Uses Pollinations.ai (free, no API key needed)
// Falls back to PNG placeholders when generation fails (ffmpeg-based)
// =============================================================================

import type { SceneData } from '@/lib/types';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';

// Valid sizes for Pollinations.ai
type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';

const VERTICAL_SIZE: ImageSize = '768x1344';
const HORIZONTAL_SIZE: ImageSize = '1344x768';
const SQUARE_SIZE: ImageSize = '1024x1024';

let imageGenInstance: ImageGenerationService | null = null;

export class ImageGenerationService {
  /**
   * Generate an image from a text prompt using Pollinations.ai
   * Pollinations is free, requires no API key, and works from any server
   */
  async generateFromPrompt(
    prompt: string,
    orientation: 'vertical' | 'horizontal' | 'square' = 'vertical',
    projectId?: string
  ): Promise<string> {
    console.log(`[ImageGen] Generating image for prompt: "${prompt.substring(0, 80)}..."`);

    try {
      const size: ImageSize = orientation === 'vertical'
        ? VERTICAL_SIZE
        : orientation === 'horizontal'
          ? HORIZONTAL_SIZE
          : SQUARE_SIZE;

      const [width, height] = size.split('x').map(Number);

      // Pollinations.ai URL-based image generation (free, no API key)
      const encodedPrompt = encodeURIComponent(
        `Professional, high-quality ${orientation} video frame: ${prompt}. Style: modern, clean, vibrant colors, suitable for social media short-form video. No text overlays, no watermarks.`
      );

      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

      console.log(`[ImageGen] Fetching from Pollinations.ai...`);

      // Fetch the image
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`Pollinations API returned ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error('Generated image too small, likely an error');
      }

      // Ensure upload directory exists
      await mkdir(UPLOAD_DIR, { recursive: true });

      // Save the generated image
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const filename = projectId
        ? `scene-${projectId}-${timestamp}-${randomSuffix}.png`
        : `scene-${timestamp}-${randomSuffix}.png`;
      const filepath = path.join(UPLOAD_DIR, filename);

      await writeFile(filepath, buffer);
      console.log(`[ImageGen] Image saved: ${filename} (${buffer.length} bytes)`);
      return `/api/upload/${filename}`;
    } catch (error) {
      console.warn('[ImageGen] Image generation failed:', error instanceof Error ? error.message : error);
      return this.generatePlaceholderImage(prompt, projectId);
    }
  }

  /**
   * Generate images for ALL scenes using Pollinations.ai
   * Every scene gets a real AI-generated background image
   * Falls back to gradient placeholder if generation fails
   */
  async generateSceneImages(
    scenes: SceneData[],
    projectId?: string
  ): Promise<Map<number, string>> {
    const imageMap = new Map<number, string>();

    console.log(`[ImageGen] Generating AI images for ALL ${scenes.length} scenes`);

    // Generate one at a time with delay to avoid rate limiting
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const prompt = scene.imageUrl || this.buildScenePrompt(scene);

      try {
        const imageUrl = await this.generateFromPrompt(
          prompt,
          'vertical',
          projectId
        );
        imageMap.set(i, imageUrl);
        console.log(`[ImageGen] Scene ${i + 1}/${scenes.length} (${scene.type}) - AI image generated`);

        // Add delay between requests to respect rate limits
        if (i < scenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.warn(`[ImageGen] Failed to generate image for scene ${i} (${scene.type}):`, error instanceof Error ? error.message : error);
        const placeholderUrl = await this.generatePlaceholderImage(prompt, projectId);
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
   * Generate a placeholder image when AI generation fails
   * Creates a minimal PNG file (not SVG — ffmpeg can't read SVG)
   */
  private async generatePlaceholderImage(prompt: string, projectId?: string): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const filename = projectId
      ? `placeholder-${projectId}-${timestamp}.png`
      : `placeholder-${timestamp}.png`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Try to create a placeholder using ffmpeg (much more compatible than SVG)
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // Create a gradient background image using ffmpeg
      const shortPrompt = prompt.substring(0, 40).replace(/'/g, '').replace(/:/g, '');
      await execFileAsync('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=0x1A2B5F:s=1080x1920:d=1,format=yuv420p`,
        '-vf', `drawtext=font=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf:text='${shortPrompt}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.5:shadowx=2:shadowy=2`,
        '-frames:v', '1',
        '-y',
        filepath,
      ], { timeout: 10000 });

      return `/api/upload/${filename}`;
    } catch {
      // ffmpeg not available or failed — create a minimal valid PNG manually
      // This is a 1x1 pixel blue PNG as an absolute fallback
      const MINIMAL_PNG = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      await writeFile(filepath, MINIMAL_PNG);
      return `/api/upload/${filename}`;
    }
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
