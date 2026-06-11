// =============================================================================
// FFmpeg Video Renderer - Browser-free video rendering fallback
// Uses ffmpeg directly to create videos from scene images + text + audio
// Professional scene styling matching the Remotion composition design
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

// Scene-type color schemes matching the HTML/Remotion design
const SCENE_COLORS: Record<string, { c0: string; c1: string; accent: string }> = {
  hook:        { c0: '0x0B1026', c1: '0x2D1B69', accent: '0xA855F7' },  // Dark to purple
  problem:     { c0: '0x0F1A3E', c1: '0x1A2B5F', accent: '0x22D3EE' },  // Navy gradient
  solution:    { c0: '0x0B1026', c1: '0x1A3A5F', accent: '0x4ADE80' },  // Navy to teal
  proof:       { c0: '0x0F0A1A', c1: '0x2D1B69', accent: '0xFFD700' },  // Dark to purple-gold
  cta:         { c0: '0x0F1A3E', c1: '0x4A1942', accent: '0xEC4899' },  // Navy to pink
  transition:  { c0: '0x0B1026', c1: '0x1A2B5F', accent: '0xA855F7' },  // Standard navy
};

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

      // Step 2: Create individual scene clips with professional styling
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
          clipPath,
          i,
          config.scenes.length
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

      // If the image doesn't exist or is SVG, create a gradient background
      if (
        !imagePath ||
        !existsSync(imagePath) ||
        imagePath.toLowerCase().endsWith('.svg')
      ) {
        imagePath = await this.createGradientBackground(
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
   * Create a gradient background image based on scene type
   * Matches the HTML design with navy-dark gradients and accent color touches
   */
  private async createGradientBackground(
    scene: SceneData,
    config: RemotionConfig,
    tempDir: string,
    index: number
  ): Promise<string> {
    const outputPath = path.join(tempDir, `blank-${index}.png`);
    const colors = SCENE_COLORS[scene.type] || SCENE_COLORS.transition;

    // Try gradients filter first (produces nice diagonal gradients)
    try {
      await execFileAsync(this.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `gradients=s=${config.width}x${config.height}:c0=${colors.c0}:c1=${colors.c1}:duration=1:direction=diagonal`,
        '-frames:v', '1',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ], { timeout: 10000 });
      return outputPath;
    } catch {
      // gradients filter not available, try solid color
    }

    // Fallback: solid color background
    try {
      await execFileAsync(this.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `color=c=${colors.c0}:s=${config.width}x${config.height}:d=1`,
        '-frames:v', '1',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ], { timeout: 10000 });
      return outputPath;
    } catch {
      // Even solid color failed, create minimal PNG
    }

    // Last resort: write minimal valid PNG
    const MINIMAL_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await writeFile(outputPath, MINIMAL_PNG);
    return outputPath;
  }

  /**
   * Create a video clip for a single scene with professional styling
   */
  private async createSceneClip(
    imagePath: string,
    duration: number,
    scene: SceneData,
    config: RemotionConfig,
    outputPath: string,
    sceneIndex: number,
    totalScenes: number
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

    // Add scene-type-specific overlays
    const styledFilters = this.createStyledTextFilters(scene, config, sceneIndex, totalScenes);
    for (const f of styledFilters) {
      filters.push(f);
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
      await execFileAsync(this.ffmpegPath, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error: any) {
      // If styled text overlay fails, retry with simpler approach
      if (filterChain.includes('drawtext') && error.message?.includes('Error')) {
        console.warn(
          `[FfmpegRenderer] Styled text overlay failed, retrying with simple text for scene "${scene.type}"`
        );
        const simpleFilters = filters.filter((f) => !f.includes('drawtext')).join(',');

        // Add a simple centered text as fallback
        if (scene.text && scene.text.trim().length > 0) {
          const simpleText = this.createSimpleTextFilter(scene, config);
          if (simpleText) {
            const retryChain = simpleFilters + (simpleFilters ? ',' : '') + simpleText;
            const retryArgs = [
              '-loop', '1',
              '-t', duration.toString(),
              '-i', imagePath,
              '-vf', retryChain,
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
            return;
          }
        }

        // Even simple text failed, render without any text
        const noTextArgs = [
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
        await execFileAsync(this.ffmpegPath, noTextArgs, {
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Create styled text filters based on scene type
   * Matches the Remotion composition design: progress bar, slide counter,
   * emoji for hooks, number circles for facts, CTA buttons
   */
  private createStyledTextFilters(
    scene: SceneData,
    config: RemotionConfig,
    sceneIndex: number,
    totalScenes: number
  ): string[] {
    const filters: string[] = [];
    const fontSpec = this.fontPath.includes('/')
      ? `fontfile=${this.fontPath}`
      : `font=${this.fontPath}`;
    const colors = SCENE_COLORS[scene.type] || SCENE_COLORS.transition;

    // 1. Progress bar at top (matching Remotion design)
    const progressWidth = Math.floor(((sceneIndex + 1) / totalScenes) * config.width);
    filters.push(
      `drawbox=x=0:y=0:w=${progressWidth}:h=3:color=0xEC4899@1:t=fill`
    );

    // 2. Slide counter (top-left, matching Remotion design)
    const counterText = this.escapeFfmpegText(`${sceneIndex + 1} / ${totalScenes}`);
    filters.push(
      `drawtext=${fontSpec}:text='${counterText}':fontsize=22:fontcolor=0xA855F7@0.9:x=28:y=22`
    );

    // 3. Scene-type-specific text overlays
    if (!scene.text || scene.text.trim().length === 0) return filters;

    const lines = this.wrapText(scene.text, 25);
    const escapedLines = lines.map((line) => this.escapeFfmpegText(line));

    if (scene.type === 'hook') {
      // Hook scene: large title with shadow, slightly above center
      const fontSize = 52;
      const lineSpacing = fontSize * 1.35;
      const totalHeight = lines.length * lineSpacing;
      const baseY = Math.floor((config.height - totalHeight) / 2 - config.height * 0.05);

      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;
        filters.push(
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3:box=1:boxcolor=black@0.35:boxborderw=14`
        );
      }

      // Hook badge at top center
      const badgeText = this.escapeFfmpegText('HOOK');
      filters.push(
        `drawtext=${fontSpec}:text='${badgeText}':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=120:box=1:boxcolor=${colors.accent}@1:boxborderw=8`
      );

    } else if (['problem', 'solution', 'proof'].includes(scene.type)) {
      // Fact/numbered scene: number circle + title + description
      const factNumber = sceneIndex + 1;
      const circleY = Math.floor(config.height * 0.28);

      // Number circle (simulated with drawtext in a colored box)
      const numText = this.escapeFfmpegText(`${factNumber}`);
      filters.push(
        `drawtext=${fontSpec}:text='${numText}':fontsize=38:fontcolor=${colors.accent}:x=(w-text_w)/2:y=${circleY}:box=1:boxcolor=${colors.accent}@0.15:boxborderw=20`
      );

      // Title text below the number
      const fontSize = 38;
      const lineSpacing = fontSize * 1.35;
      const totalHeight = lines.length * lineSpacing;
      const baseY = circleY + 100;

      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;
        filters.push(
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3:box=1:boxcolor=black@0.35:boxborderw=12`
        );
      }

    } else if (scene.type === 'cta') {
      // CTA scene: title + social buttons + follow text
      const fontSize = 42;
      const lineSpacing = fontSize * 1.3;
      const totalHeight = lines.length * lineSpacing;
      const baseY = Math.floor((config.height - totalHeight) / 2 - config.height * 0.1);

      // Title
      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;
        filters.push(
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3:box=1:boxcolor=black@0.35:boxborderw=14`
        );
      }

      // Social buttons (Like, Share, Save)
      const buttonY = baseY + totalHeight + 60;
      const buttonLabels = ['Like', 'Share', 'Save'];
      const buttonEmojis = ['❤️', '🔗', '🔖'];
      const buttonSpacing = Math.floor(config.width / 4);

      for (let i = 0; i < buttonLabels.length; i++) {
        const bx = buttonSpacing * (i + 1) - 40;
        const bt = this.escapeFfmpegText(`${buttonEmojis[i]} ${buttonLabels[i]}`);
        filters.push(
          `drawtext=${fontSpec}:text='${bt}':fontsize=22:fontcolor=white:x=${bx}:y=${buttonY}:box=1:boxcolor=white@0.08:boxborderw=12`
        );
      }

      // Follow text
      const followY = buttonY + 70;
      const followText = this.escapeFfmpegText('Follow for more!');
      filters.push(
        `drawtext=${fontSpec}:text='${followText}':fontsize=24:fontcolor=${colors.accent}:x=(w-text_w)/2:y=${followY}`
      );

    } else {
      // Transition or other: simple centered text
      const fontSize = 36;
      const lineSpacing = fontSize * 1.35;
      const totalHeight = lines.length * lineSpacing;
      const baseY = Math.floor((config.height - totalHeight) / 2);

      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;
        filters.push(
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3`
        );
      }
    }

    return filters;
  }

  /**
   * Create a simple centered text filter as fallback
   */
  private createSimpleTextFilter(scene: SceneData, config: RemotionConfig): string | null {
    try {
      const fontSpec = this.fontPath.includes('/')
        ? `fontfile=${this.fontPath}`
        : `font=${this.fontPath}`;

      const lines = this.wrapText(scene.text, 25);
      const escapedLines = lines.map((line) => this.escapeFfmpegText(line));

      const fontSize = scene.type === 'hook' ? 48 : 36;
      const lineSpacing = fontSize * 1.4;
      const totalTextHeight = lines.length * lineSpacing;
      const baseY = Math.floor((config.height - totalTextHeight) / 2 + config.height * 0.15);

      const drawtextFilters: string[] = [];
      for (let i = 0; i < escapedLines.length; i++) {
        const y = baseY + i * lineSpacing;
        drawtextFilters.push(
          `drawtext=${fontSpec}:text='${escapedLines[i]}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3:box=1:boxcolor=black@0.4:boxborderw=12`
        );
      }

      return drawtextFilters.join(',');
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

    // Try fast copy first, fall back to re-encode
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
    } catch {
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
   * Tries direct merge → re-encode audio first → copy video without audio
   */
  private async addAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    // Strategy 1: Direct merge (fastest)
    try {
      await execFileAsync(this.ffmpegPath, [
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-y',
        outputPath,
      ], {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return;
    } catch {
      console.warn('[FfmpegRenderer] Direct audio merge failed, trying re-encode...');
    }

    // Strategy 2: Re-encode audio first, then merge
    try {
      const tempDir = path.dirname(videoPath);
      const reencodedAudio = path.join(tempDir, 'reencoded-audio.mp3');

      await execFileAsync(this.ffmpegPath, [
        '-i', audioPath,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-y',
        reencodedAudio,
      ], { timeout: 30000 });

      await execFileAsync(this.ffmpegPath, [
        '-i', videoPath,
        '-i', reencodedAudio,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-y',
        outputPath,
      ], {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Clean up re-encoded audio
      try { await unlink(reencodedAudio); } catch {}
      return;
    } catch {
      console.warn('[FfmpegRenderer] Re-encoded audio merge also failed');
    }

    // Strategy 3: Use video without audio (better than no output)
    console.warn('[FfmpegRenderer] All audio merge attempts failed, using video without audio');
    const { copyFile } = await import('fs/promises');
    await copyFile(videoPath, outputPath);
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
}

/** Convenience function */
export function getFfmpegRenderer(): FfmpegRenderer {
  if (!ffmpegRendererInstance) {
    ffmpegRendererInstance = new FfmpegRenderer();
  }
  return ffmpegRendererInstance;
}
