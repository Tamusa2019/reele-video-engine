// =============================================================================
// Image Generation Service - AI-powered scene image generation
// Uses z-ai-web-dev-sdk for image generation
// =============================================================================

import ZAI from 'z-ai-web-dev-sdk';
import type { SceneData } from '@/lib/types';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';

// Valid sizes from z-ai-web-dev-sdk
type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';

// Map general size descriptions to valid SDK sizes
const VERTICAL_SIZE: ImageSize = '768x1344'; // Closest to 9:16 ratio
const HORIZONTAL_SIZE: ImageSize = '1344x768'; // Closest to 16:9 ratio
const SQUARE_SIZE: ImageSize = '1024x1024';

let imageGenInstance: ImageGenerationService | null = null;

export class ImageGenerationService {
  /**
   * Generate an image from a text prompt
   * @param prompt - Image generation prompt
   * @param orientation - 'vertical', 'horizontal', or 'square'
   * @returns URL path to the generated image
   */
  async generateFromPrompt(
    prompt: string,
    orientation: 'vertical' | 'horizontal' | 'square' = 'vertical',
    projectId?: string
  ): Promise<string> {
    console.log(`[ImageGen] Generating image for prompt: "${prompt.substring(0, 80)}..."`);

    try {
      const zai = await ZAI.create();

      const size: ImageSize = orientation === 'vertical'
        ? VERTICAL_SIZE
        : orientation === 'horizontal'
          ? HORIZONTAL_SIZE
          : SQUARE_SIZE;

      const response = await zai.images.generations.create({
        prompt: `Professional, high-quality ${orientation} video frame: ${prompt}. Style: modern, clean, vibrant colors, suitable for social media short-form video. No text overlays, no watermarks.`,
        size,
      });

      if (response.data && response.data.length > 0) {
        const imageData = response.data[0];

        // Ensure upload directory exists
        await mkdir(UPLOAD_DIR, { recursive: true });

        // Save the generated image
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const filename = projectId
          ? `scene-${projectId}-${timestamp}-${randomSuffix}.png`
          : `scene-${timestamp}-${randomSuffix}.png`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // The SDK returns base64 data
        if (imageData.base64) {
          const buffer = Buffer.from(imageData.base64, 'base64');
          await writeFile(filepath, buffer);
          console.log(`[ImageGen] Image saved: ${filename}`);
          return `/upload/${filename}`;
        }

        throw new Error('No base64 image data returned from API');
      }

      throw new Error('No image data returned from API');
    } catch (error) {
      console.warn('[ImageGen] AI image generation failed:', error instanceof Error ? error.message : error);
      // Return a placeholder gradient image path
      return this.generatePlaceholderImage(prompt, projectId);
    }
  }

  /**
   * Generate images for key scenes only (to avoid rate limits and speed up pipeline)
   * Only generates images for the most visually important scenes: hook, solution, and cta
   * @param scenes - Array of scene data
   * @returns Map of scene index to image URL
   */
  async generateSceneImages(
    scenes: SceneData[],
    projectId?: string
  ): Promise<Map<number, string>> {
    const imageMap = new Map<number, string>();

    // Only generate images for key scene types to avoid rate limits
    const KEY_SCENE_TYPES = ['hook', 'solution', 'cta'];
    const sceneIndices = scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => {
        // Only generate for key scenes that have an image prompt
        const isKeyScene = KEY_SCENE_TYPES.includes(scene.type);
        const hasPrompt = scene.imageUrl && scene.imageUrl.trim().length > 0;
        return isKeyScene && hasPrompt;
      });

    console.log(`[ImageGen] Generating images for ${sceneIndices.length} key scenes (out of ${scenes.length} total)`);

    // Generate one at a time with delay to avoid rate limits
    for (let i = 0; i < sceneIndices.length; i++) {
      const { scene, index } = sceneIndices[i];
      try {
        const imageUrl = await this.generateFromPrompt(
          scene.imageUrl!,
          'vertical',
          projectId
        );
        imageMap.set(index, imageUrl);
        // Add 2 second delay between requests to avoid rate limiting
        if (i < sceneIndices.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`[ImageGen] Failed to generate image for scene ${index}:`, error);
        // Use placeholder - don't block the pipeline
        const placeholderUrl = await this.generatePlaceholderImage(scene.imageUrl || 'scene', projectId);
        imageMap.set(index, placeholderUrl);
      }
    }

    // For non-key scenes, generate placeholders quickly
    for (let i = 0; i < scenes.length; i++) {
      if (!imageMap.has(i) && scenes[i].imageUrl && scenes[i].imageUrl.trim().length > 0) {
        const placeholderUrl = await this.generatePlaceholderImage(scenes[i].imageUrl!, projectId);
        imageMap.set(i, placeholderUrl);
      }
    }

    console.log(`[ImageGen] Generated ${imageMap.size} scene images (3 AI + rest placeholders)`);
    return imageMap;
  }

  /**
   * Generate a placeholder image when AI generation fails
   * Creates an SVG-based placeholder
   */
  private async generatePlaceholderImage(prompt: string, projectId?: string): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const filename = projectId
      ? `placeholder-${projectId}-${timestamp}.svg`
      : `placeholder-${timestamp}.svg`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Create a gradient SVG placeholder
    const shortPrompt = prompt.substring(0, 50).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1A2B5F;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FF6B35;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <text x="540" y="960" font-family="Arial, sans-serif" font-size="36" fill="white" text-anchor="middle" opacity="0.8">${shortPrompt}</text>
  <text x="540" y="1020" font-family="Arial, sans-serif" font-size="24" fill="white" text-anchor="middle" opacity="0.5">AI Generated Placeholder</text>
</svg>`;

    await writeFile(filepath, svg);
    return `/upload/${filename}`;
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
