// =============================================================================
// Video Render Service - Real Remotion-based video rendering
// Uses @remotion/bundler + @remotion/renderer to produce actual MP4 files
// =============================================================================

import type { SceneJSON, RemotionConfig, SceneData } from '@/lib/types';
import { PLATFORM_DIMENSIONS } from '@/lib/types';
import { UPLOAD_DIR } from '@/lib/config';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

let videoRenderInstance: VideoRenderService | null = null;

// Render job tracking
interface RenderJob {
  jobId: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  startedAt: number;
  config: RemotionConfig;
}

// In-memory job store (for MVP; use DB/BullMQ for production)
const renderJobs = new Map<string, RenderJob>();

export class VideoRenderService {
  /**
   * Generate a Remotion-compatible configuration from Scene JSON
   */
  generateRemotionConfig(sceneJSON: SceneJSON): RemotionConfig {
    const dimensions = PLATFORM_DIMENSIONS[sceneJSON.platform] || { width: 1080, height: 1920 };
    const fps = 30;
    const durationInFrames = Math.ceil(sceneJSON.duration * fps);

    const config: RemotionConfig = {
      compositionId: `Reele-${sceneJSON.platform}-${Date.now()}`,
      durationInFrames,
      fps,
      width: dimensions.width,
      height: dimensions.height,
      scenes: sceneJSON.scenes,
      branding: sceneJSON.branding,
      voiceoverUrl: undefined,
      subtitleUrl: undefined,
      outputFormat: 'mp4',
    };

    return config;
  }

  /**
   * Render a video from a Remotion configuration using actual Remotion rendering
   * This runs the render in a background-like fashion and returns a job ID
   */
  async renderVideo(config: RemotionConfig): Promise<{ jobId: string; status: string; estimatedTime: number }> {
    console.log(`[VideoRender] Starting render for composition: ${config.compositionId}`);
    console.log(`[VideoRender] Duration: ${config.durationInFrames / config.fps}s, Resolution: ${config.width}x${config.height}`);

    // Generate a job ID
    const jobId = `render-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Estimate rendering time (roughly 2x real-time for Remotion)
    const durationSeconds = config.durationInFrames / config.fps;
    const estimatedTime = Math.ceil(durationSeconds * 3);

    // Create job entry
    const job: RenderJob = {
      jobId,
      status: 'queued',
      progress: 0,
      startedAt: Date.now(),
      config,
    };
    renderJobs.set(jobId, job);

    // Start the actual render asynchronously
    this.executeRender(jobId, config).catch((err) => {
      console.error(`[VideoRender] Render job ${jobId} failed:`, err);
      const j = renderJobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = err instanceof Error ? err.message : String(err);
      }
    });

    console.log(`[VideoRender] Job ${jobId} queued. Estimated time: ${estimatedTime}s`);

    return {
      jobId,
      status: 'queued',
      estimatedTime,
    };
  }

  /**
   * Execute the actual Remotion render
   */
  private async executeRender(jobId: string, config: RemotionConfig): Promise<void> {
    const job = renderJobs.get(jobId);
    if (!job) return;

    job.status = 'rendering';
    job.progress = 5;

    try {
      // Dynamic imports to avoid loading Remotion at module level
      // (Remotion requires browser/webpack which may not be available during SSR)
      const { bundle } = await import('@remotion/bundler');
      const { renderMedia, selectComposition } = await import('@remotion/renderer');

      // Step 1: Create a temporary composition props file
      await mkdir(UPLOAD_DIR, { recursive: true });
      const propsDir = path.join(UPLOAD_DIR, 'render-props');
      await mkdir(propsDir, { recursive: true });

      const propsFilePath = path.join(propsDir, `${jobId}-props.json`);
      const compositionProps = {
        scenes: config.scenes,
        branding: config.branding,
        voiceoverUrl: config.voiceoverUrl || undefined,
        subtitleUrl: config.subtitleUrl || undefined,
        title: config.compositionId,
      };

      await writeFile(propsFilePath, JSON.stringify(compositionProps, null, 2));
      console.log(`[VideoRender] Props file written: ${propsFilePath}`);

      job.progress = 10;

      // Step 2: Bundle the Remotion project
      console.log('[VideoRender] Bundling Remotion project...');
      const entryPoint = path.join(process.cwd(), 'src', 'remotion', 'index.ts');

      // Check if entry point exists
      if (!existsSync(entryPoint)) {
        throw new Error(`Remotion entry point not found: ${entryPoint}`);
      }

      const bundleLocation = await bundle({
        entryPoint,
        // Use webpack for bundling (Remotion's default)
        webpackOverride: (override) => override,
        onProgress: (progress) => {
          // Bundle progress (0 to 1)
          job.progress = 10 + Math.floor(progress * 30);
        },
      });

      console.log(`[VideoRender] Bundle created at: ${bundleLocation}`);
      job.progress = 40;

      // Step 3: Select the composition
      console.log('[VideoRender] Selecting composition...');
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'ReeleVideo',
        inputProps: compositionProps,
      });

      // Override composition settings from our config
      composition.durationInFrames = config.durationInFrames;
      composition.fps = config.fps;
      composition.width = config.width;
      composition.height = config.height;

      console.log(`[VideoRender] Composition: ${composition.id}, ${composition.durationInFrames} frames @ ${composition.fps}fps`);
      job.progress = 45;

      // Step 4: Render the video
      const outputPath = path.join(UPLOAD_DIR, `video-${jobId}.mp4`);
      console.log(`[VideoRender] Rendering to: ${outputPath}`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: compositionProps,
        onProgress: ({ progress }) => {
          // Render progress (0 to 1)
          job.progress = 45 + Math.floor(progress * 50);
          if (Math.floor(progress * 10) !== Math.floor((progress - 0.01) * 10)) {
            console.log(`[VideoRender] Progress: ${Math.round(progress * 100)}%`);
          }
        },
        // Optimizations for server rendering
        concurrency: 1,
        scale: 1,
        verbose: false,
        // H264 encoding settings for social media
        encode: true,
        enforceAudioTrack: true,
      });

      // Step 5: Verify output
      if (!existsSync(outputPath)) {
        throw new Error(`Render completed but output file not found: ${outputPath}`);
      }

      const stats = await import('fs/promises').then(m => m.stat(outputPath));
      console.log(`[VideoRender] Render complete! Output: ${outputPath} (${Math.round(stats.size / 1024 / 1024)}MB)`);

      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = `/api/upload/video-${jobId}.mp4`;

      // Clean up props file
      try {
        const { unlink } = await import('fs/promises');
        await unlink(propsFilePath);
      } catch {
        // Ignore cleanup errors
      }

    } catch (error) {
      console.error(`[VideoRender] Render failed for job ${jobId}:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.progress = Math.max(job.progress, 0);
    }
  }

  /**
   * Get the render status for a job
   */
  async getRenderStatus(jobId: string): Promise<{
    jobId: string;
    status: 'queued' | 'rendering' | 'completed' | 'failed';
    progress: number;
    outputUrl?: string;
    error?: string;
  }> {
    const job = renderJobs.get(jobId);

    if (!job) {
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: `Job ${jobId} not found`,
      };
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      error: job.error,
    };
  }

  /**
   * Wait for a render job to complete (polling)
   * Used by the API when we want synchronous render completion
   */
  async waitForRender(jobId: string, timeoutMs: number = 300000): Promise<{
    success: boolean;
    outputUrl?: string;
    error?: string;
    duration: number;
  }> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getRenderStatus(jobId);

      if (status.status === 'completed') {
        return {
          success: true,
          outputUrl: status.outputUrl,
          duration: Date.now() - startTime,
        };
      }

      if (status.status === 'failed') {
        return {
          success: false,
          error: status.error,
          duration: Date.now() - startTime,
        };
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      error: `Render timed out after ${timeoutMs / 1000}s`,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Calculate scene frame ranges from timing data
   */
  getSceneFrameRanges(scenes: SceneData[], fps: number = 30): Array<{
    sceneIndex: number;
    startFrame: number;
    endFrame: number;
    type: string;
  }> {
    return scenes.map((scene, index) => ({
      sceneIndex: index,
      startFrame: Math.floor(scene.start * fps),
      endFrame: Math.ceil(scene.end * fps),
      type: scene.type,
    }));
  }

  /**
   * Validate a Remotion config before rendering
   */
  validateConfig(config: RemotionConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.durationInFrames <= 0) {
      errors.push('Duration in frames must be positive');
    }

    if (config.fps <= 0 || config.fps > 120) {
      errors.push('FPS must be between 1 and 120');
    }

    if (config.width <= 0 || config.height <= 0) {
      errors.push('Width and height must be positive');
    }

    if (!config.scenes || config.scenes.length === 0) {
      errors.push('At least one scene is required');
    }

    // Check scene timing continuity
    if (config.scenes.length > 0) {
      let lastEnd = 0;
      for (let i = 0; i < config.scenes.length; i++) {
        const scene = config.scenes[i];
        if (scene.start < lastEnd - 0.1) {
          errors.push(`Scene ${i} overlaps with previous scene`);
        }
        if (scene.end <= scene.start) {
          errors.push(`Scene ${i} has invalid timing (end <= start)`);
        }
        lastEnd = scene.end;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a Remotion composition component code from config
   * This creates the React component that Remotion will render
   */
  generateCompositionCode(config: RemotionConfig): string {
    const sceneComponents = config.scenes.map((scene, index) => {
      const animationType = scene.animation?.type || 'fadeIn';
      const animationDuration = scene.animation?.duration || 0.5;
      const easing = scene.animation?.easing || 'easeInOut';

      return `
      {/* Scene ${index + 1}: ${scene.type} */}
      <AbsoluteFill
        style={{
          backgroundColor: '${config.branding.primaryColor}',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        ${scene.imageUrl ? `<Img src="${scene.imageUrl}" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} />` : ''}
        <div style={{
          color: '${config.branding.secondaryColor}',
          fontFamily: '${config.branding.fontFamily}',
          fontSize: ${scene.type === 'hook' ? 48 : 36},
          fontWeight: ${scene.type === 'cta' ? 700 : 500},
          textAlign: 'center',
          padding: '40px',
          zIndex: 10,
        }}>
          ${scene.text}
        </div>
        ${config.branding.logoUrl ? `<Img src="${config.branding.logoUrl}" style={{ position: 'absolute', ${config.branding.watermarkPosition === 'top-right' ? 'top: 20, right: 20' : 'bottom: 20, right: 20'}, width: 80, height: 80, opacity: 0.8 }} />` : ''}
      </AbsoluteFill>`;
    }).join('\n');

    return `
// Auto-generated Remotion Composition for Reele Video Engine
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';

export const ReeleComposition: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      ${sceneComponents}
    </AbsoluteFill>
  );
};
`;
  }
}

/** Convenience function */
export function getVideoRenderService(): VideoRenderService {
  if (!videoRenderInstance) {
    videoRenderInstance = new VideoRenderService();
  }
  return videoRenderInstance;
}
