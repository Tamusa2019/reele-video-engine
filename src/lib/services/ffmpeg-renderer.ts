// =============================================================================
// FFmpeg Video Renderer - Browser-free video rendering fallback
// Uses ffmpeg directly to create videos from scene images + text + audio
// Much more reliable in Docker/HF Spaces environments than browser-based rendering
// =============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, unlink, stat, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';
import type { RemotionConfig, SceneData } from '@/lib/types';

const execFileAsync = promisify(execFile);

let ffmpegRendererInstance: FfmpegRenderer | null = null;

export class FfmpegRenderer {
  private ffmpegPath: string;
  private fontPath: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    // Default font paths for Docker container
    this.fontPath =
      process.env.FONT_PATH ||
      this.findFont();
  }

  /**
   * Find an available font on the system
   */
  private findFont(): string {
    const fontPaths = [
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
      '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    ];
    for (const fp of fontPaths) {
      if (existsSync(fp)) return fp;
    }
    // Fall back to fontconfig name (ffmpeg will try to resolve it)
    return 'DejaVu Sans';
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.ffmpegPath, ['-version'], { timeout: 5000 });
      return true;
    } catch {
      console.warn('[FfmpegRenderer] ffmpeg not found - video fallback disabled');
      return false;
    }
  }

  /**
   * Render a video using ffmpeg from scene configuration
   */
  async renderVideo(
    config: RemotionConfig,
    jobId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const outputPath = path.join(UPLOAD_DIR, `video-${jobId}.mp4`);
    const tempDir = path.join(UPLOAD_DIR, `render-temp-${jobId}`);

    await mkdir(tempDir, { recursive: true });

    try {
      onProgress?.(5);

      // Step 1: Prepare scene images (download if external, create blanks if missing)
      const sceneImages = await this.prepareSceneImages(config, tempDir);
      onProgress?.(15);

      // Step 2: Create individual scene clips
      const clipPaths: string[] = [];
      for (let i = 0; i < config.scenes.length; i++) {
        const scene = config.scenes[i];
        const imagePath = sceneImages[i];
        const clipPath = path.join(tempDir, `scene-${i}.mp4`);
        const duration = scene.end - scene.start;

        await this.createSceneClip(
          imagePath,
          duration,
          scene,
          config,
          clipPath
        );

        clipPaths.push(clipPath);
        onProgress?.(15 + Math.floor(((i + 1) / config.scenes.length) * 40));
      }

      onProgress?.(55);

      // Step 3: Concatenate all scene clips
      const concatVideoPath = path.join(tempDir, 'concat.mp4');
      await this.concatenateClips(clipPaths, concatVideoPath);
      onProgress?.(70);

      // Step 4: Add audio if available
      if (config.voiceoverUrl) {
        const audioPath = this.urlToFilePath(config.voiceoverUrl);
        if (audioPath && existsSync(audioPath)) {
          await this.addAudio(concatVideoPath, audioPath, outputPath);
        } else {
          // No audio file found, just copy the video
          const { copyFile } = await import('fs/promises');
          await copyFile(concatVideoPath, outputPath);
        }
      } else {
        // No voiceover, just copy the video
        const { copyFile } = await import('fs/promises');
        await copyFile(concatVideoPath, outputPath);
      }

      onProgress?.(90);

      // Step 5: Verify output
      if (!existsSync(outputPath)) {
        throw new Error('FFmpeg render completed but output file not found');
      }

      const outputStat = await stat(outputPath);
      if (outputStat.size < 1000) {
        throw new Error('FFmpeg output file is too small, likely corrupt');
      }

      onProgress?.(100);
      console.log(
        `[FfmpegRenderer] Render complete! Output: ${outputPath} (${Math.round(outputStat.size / 1024 / 1024)}MB)`
      );

      return outputPath;
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
   * Prepare scene images - convert URLs to file paths, create blanks for missing images
   */
  private async prepareSceneImages(
    config: RemotionConfig,
    tempDir: string
  ): Promise<string[]> {
    const images: string[] = [];

    for (let i = 0; i < config.scenes.length; i++) {
      const scene = config.scenes[i];
      let imagePath = this.imageUrlToFilePath(scene.imageUrl);

      // If the image doesn't exist or is SVG, create a blank background
      if (
        !imagePath ||
        !existsSync(imagePath) ||
        imagePath.toLowerCase().endsWith('.svg')
      ) {
        imagePath = await this.createBlankImage(
          scene,
          config,
          tempDir,
          i
        );
      }

      images.push(imagePath);
    }

    return images;
  }

  /**
   * Convert a URL path to a filesystem path
   */
  private urlToFilePath(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('/api/upload/')) {
      return path.join(UPLOAD_DIR, url.replace('/api/upload/', ''));
    }
    if (url.startsWith('/upload/')) {
      return path.join(UPLOAD_DIR, url.replace('/upload/', ''));
    }
    // External URL or absolute path
    if (url.startsWith('http')) return null;
    return url;
  }

  /**
   * Convert an image URL to a filesystem path
   */
  private imageUrlToFilePath(imageUrl: string | undefined): string | null {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('/api/upload/')) {
      return path.join(UPLOAD_DIR, imageUrl.replace('/api/upload/', ''));
    }
    if (imageUrl.startsWith('/upload/')) {
      return path.join(UPLOAD_DIR, imageUrl.replace('/upload/', ''));
    }
    // External URL — we can't use it directly with ffmpeg
    if (imageUrl.startsWith('http')) return null;
    return imageUrl;
  }

  /**
   * Create a gradient background image matching the HTML design
   * Navy dark gradient with accent color touches
   */
  private async createBlankImage(
    scene: SceneData,
    config: RemotionConfig,
    tempDir: string,
    index: number
  ): Promise<string> {
    const outputPath = path.join(tempDir, `blank-${index}.png`);

    // Create a gradient background matching the HTML navy-dark design
    // Use a two-tone gradient from dark navy to lighter navy
    const args = [
      '-f', 'lavfi',
      '-i', `gradients=s=${config.width}x${config.height}:c0=0x0F1A3E:c1=0x1A2B5F:duration=1:direction=diagonal`,
      '-frames:v', '1',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(this.ffmpegPath, args, { timeout: 10000 });
    } catch {
      // Fallback to solid color if gradients filter not available
      const fallbackArgs = [
        '-f', 'lavfi',
        '-i', `color=c=0x0F1A3E:s=${config.width}x${config.height}:d=1`,
        '-frames:v', '1',
        '-y',
        outputPath,
      ];
      await execFileAsync(this.ffmpegPath, fallbackArgs, { timeout: 10000 });
    }

    return outputPath;
  }

  /**
   * Create a video clip for a single scene
   */
  private async createSceneClip(
    imagePath: string,
    duration: number,
    scene: SceneData,
    config: RemotionConfig,
    outputPath: string
  ): Promise<void> {
    // Build video filter chain
    const filters: string[] = [];

    // Scale image to target resolution with padding
    filters.push(
      `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease`
    );
    filters.push(
      `pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:color=black`
    );
    filters.push('setsar=1');
    filters.push(`fps=${config.fps}`);

    // Add text overlay if the scene has text
    if (scene.text && scene.text.trim().length > 0) {
      const textFilter = this.createTextFilter(scene, config);
      if (textFilter) {
        filters.push(textFilter);
      }
    }

    // Scene type badge (for hook scenes)
    if (scene.type === 'hook') {
      const badgeFilter = this.createBadgeFilter(scene, config);
      if (badgeFilter) {
        filters.push(badgeFilter);
      }
    }

    const filterChain = filters.join(',');

    const args = [
      '-loop', '1',
      '-t', duration.toString(),
      '-i', imagePath,
      '-vf', filterChain,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'slow',
      '-crf', '18',
      '-b:v', '2M',
      '-r', config.fps.toString(),
      '-y',
      outputPath,
    ];

    console.log(`[FfmpegRenderer] Creating clip for scene "${scene.type}" (${duration}s)`);

    try {
      const { stdout, stderr } = await execFileAsync(this.ffmpegPath, args, {
        timeout: 120000, // 2 minute timeout per scene
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error: any) {
      // If drawtext fails (e.g., font not found), retry without text overlay
      if (filterChain.includes('drawtext') && error.message?.includes('Error')) {
        console.warn(
          `[FfmpegRenderer] Text overlay failed, retrying without text for scene "${scene.type}"`
        );
        const simpleFilters = filters.filter((f) => !f.includes('drawtext')).join(',');
        const retryArgs = [
          '-loop', '1',
          '-t', duration.toString(),
          '-i', imagePath,
          '-vf', simpleFilters,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'slow',
          '-crf', '18',
          '-b:v', '2M',
          '-r', config.fps.toString(),
          '-y',
          outputPath,
        ];
        await execFileAsync(this.ffmpegPath, retryArgs, {
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Create ffmpeg drawtext filter for scene text overlay
   * Matches the HTML design: centered white text with shadow on dark overlay
   */
  private createTextFilter(scene: SceneData, config: RemotionConfig): string | null {
    try {
      // Split text into lines of ~25 characters each for better readability
      const lines = this.wrapText(scene.text, 25);
      const escapedLines = lines.map((line) => this.escapeFfmpegText(line));

      // Position text in the center of the video (slightly below center)
      const fontSize = scene.type === 'hook' ? 56 : scene.type === 'cta' ? 48 : 42;
      const lineSpacing = fontSize * 1.4;
      const totalTextHeight = lines.length * lineSpacing;

      // Y position: centered vertically (slightly below center for readability)
      const baseY = Math.floor((config.height - totalTextHeight) / 2 + config.height * 0.15);

      // Build drawtext filters for each line
      const drawtextFilters: string[] = [];

      const fontSpec = this.fontPath.includes('/')
        ? `fontfile=${this.fontPath}`
        : `font=${this.fontPath}`;

      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;

        // Text line with shadow and background
        const textFilter =
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3:box=1:boxcolor=black@0.4:boxborderw=12`;

        drawtextFilters.push(textFilter);
      }

      return drawtextFilters.join(',');
    } catch (error) {
      console.warn('[FfmpegRenderer] Failed to create text filter:', error);
      return null;
    }
  }

  /**
   * Create a badge filter for hook scenes
   */
  private createBadgeFilter(scene: SceneData, config: RemotionConfig): string | null {
    try {
      const fontSpec = this.fontPath.includes('/')
        ? `fontfile=${this.fontPath}`
        : `font=${this.fontPath}`;

      return (
        `drawtext=${fontSpec}:text='HOOK':fontsize=24:fontcolor=white:` +
        `x=(w-text_w)/2:y=${120}:box=1:boxcolor=${config.branding.accentColor || '#FF6B35'}@1:boxborderw=8`
      );
    } catch {
      return null;
    }
  }

  /**
   * Concatenate multiple video clips into one
   */
  private async concatenateClips(
    clipPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (clipPaths.length === 0) {
      throw new Error('No clips to concatenate');
    }

    // If only one clip, just copy it
    if (clipPaths.length === 1) {
      const { copyFile } = await import('fs/promises');
      await copyFile(clipPaths[0], outputPath);
      return;
    }

    // Create concat file
    const concatContent = clipPaths
      .map((p) => `file '${p}'`)
      .join('\n');
    const concatFilePath = path.join(path.dirname(outputPath), 'concat.txt');

    await writeFile(concatFilePath, concatContent);

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFilePath,
      '-c', 'copy',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(this.ffmpegPath, args, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      // If concat copy fails (different codecs), re-encode
      console.warn(
        '[FfmpegRenderer] Concat copy failed, re-encoding...'
      );
      const reencodeArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'slow',
        '-crf', '18',
        '-b:v', '2M',
        '-y',
        outputPath,
      ];
      await execFileAsync(this.ffmpegPath, reencodeArgs, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    // Clean up concat file
    try {
      await unlink(concatFilePath);
    } catch {
      // Ignore
    }
  }

  /**
   * Add audio track to a video
   */
  private async addAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    const args = [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(this.ffmpegPath, args, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      // If audio merge fails, just use the video without audio
      console.warn('[FfmpegRenderer] Audio merge failed, using video without audio:', error);
      const { copyFile } = await import('fs/promises');
      await copyFile(videoPath, outputPath);
    }
  }

  /**
   * Wrap text into lines of approximately maxChars per line
   */
  private wrapText(text: string, maxChars: number = 28): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Limit to 4 lines to avoid overflow
    if (lines.length > 4) {
      return lines.slice(0, 4);
    }

    return lines;
  }

  /**
   * Escape text for ffmpeg drawtext filter
   */
  private escapeFfmpegText(text: string): string {
    return text
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "\\\\'")
      .replace(/:/g, '\\\\:')
      .replace(/%/g, '%%')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/\n/g, ' ')
      .trim();
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 26, g: 43, b: 95 }; // Default: #1A2B5F
  }

  /**
   * Convert RGB to hex string
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
}

/** Convenience function */
export function getFfmpegRenderer(): FfmpegRenderer {
  if (!ffmpegRendererInstance) {
    ffmpegRendererInstance = new FfmpegRenderer();
  }
  return ffmpegRendererInstance;
}
