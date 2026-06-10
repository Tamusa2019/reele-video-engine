// =============================================================================
// Video Render Service - Dual-engine video rendering
// Primary: Remotion (browser-based, higher quality)
// Fallback: FFmpeg (browser-free, reliable in Docker/HF Spaces)
// =============================================================================

import type { SceneJSON, RemotionConfig, SceneData } from '@/lib/types';
import { PLATFORM_DIMENSIONS } from '@/lib/types';
import { UPLOAD_DIR } from '@/lib/config';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getFfmpegRenderer } from './ffmpeg-renderer';

let videoRenderInstance: VideoRenderService | null = null;

// Render method: 'auto' tries Remotion first, falls back to ffmpeg
// 'ffmpeg' forces ffmpeg-only, 'remotion' forces Remotion-only
const RENDER_METHOD = process.env.RENDER_METHOD || 'auto';

// Render job tracking
interface RenderJob {
  jobId: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  startedAt: number;
  config: RemotionConfig;
  projectId?: string;
  renderMethod?: 'remotion' | 'ffmpeg';
}

// In-memory job store (for MVP; use DB/BullMQ for production)
const renderJobs = new Map<string, RenderJob>();

// Also persist completed/failed jobs to UPLOAD_DIR so they survive restarts
const JOBS_FILE = path.join(UPLOAD_DIR, 'render-jobs.json');

/**
 * Load persisted jobs from disk (survives process restart)
 */
async function loadPersistedJobs(): Promise<void> {
  try {
    if (existsSync(JOBS_FILE)) {
      const data = await readFile(JOBS_FILE, 'utf-8');
      const jobs: RenderJob[] = JSON.parse(data);
      for (const job of jobs) {
        // Only restore completed or failed jobs (active jobs are gone after restart)
        if (job.status === 'completed' || job.status === 'failed') {
          renderJobs.set(job.jobId, job);
        }
      }
      console.log(`[VideoRender] Restored ${renderJobs.size} persisted jobs from disk`);
    }
  } catch (error) {
    console.warn('[VideoRender] Could not load persisted jobs:', error);
  }
}

/**
 * Persist current jobs to disk
 */
async function persistJobs(): Promise<void> {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const jobs = Array.from(renderJobs.values()).filter(
      (j) => j.status === 'completed' || j.status === 'failed'
    );
    await writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
  } catch (error) {
    console.warn('[VideoRender] Could not persist jobs:', error);
  }
}

// Load persisted jobs on startup
loadPersistedJobs().catch(() => {});

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
   * Render a video from a Remotion configuration
   * This runs the render in a background-like fashion and returns a job ID
   */
  async renderVideo(config: RemotionConfig, projectId?: string): Promise<{ jobId: string; status: string; estimatedTime: number }> {
    console.log(`[VideoRender] Starting render for composition: ${config.compositionId}`);
    console.log(`[VideoRender] Duration: ${config.durationInFrames / config.fps}s, Resolution: ${config.width}x${config.height}`);
    console.log(`[VideoRender] Render method: ${RENDER_METHOD}`);

    // Generate a job ID
    const jobId = `render-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Estimate rendering time
    const durationSeconds = config.durationInFrames / config.fps;
    const estimatedTime = Math.ceil(durationSeconds * 3);

    // Create job entry
    const job: RenderJob = {
      jobId,
      status: 'queued',
      progress: 0,
      startedAt: Date.now(),
      config,
      projectId,
    };
    renderJobs.set(jobId, job);

    // Start the actual render asynchronously
    this.executeRender(jobId, config).catch((err) => {
      console.error(`[VideoRender] Render job ${jobId} failed:`, err);
      const j = renderJobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = err instanceof Error ? err.message : String(err);
        persistJobs().catch(() => {});
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
   * Execute the actual render - tries the configured method with fallback
   */
  private async executeRender(jobId: string, config: RemotionConfig): Promise<void> {
    const job = renderJobs.get(jobId);
    if (!job) return;

    job.status = 'rendering';
    job.progress = 5;

    // Determine render method
    if (RENDER_METHOD === 'ffmpeg') {
      // Force ffmpeg only
      await this.executeFfmpegRender(jobId, config);
    } else if (RENDER_METHOD === 'remotion') {
      // Force Remotion only
      await this.executeRemotionRender(jobId, config);
    } else {
      // Auto: try Remotion first, fall back to ffmpeg
      try {
        await this.executeRemotionRender(jobId, config);
      } catch (remotionError) {
        console.warn(`[VideoRender] Remotion render failed, trying ffmpeg fallback:`, remotionError);
        const j = renderJobs.get(jobId);
        if (j && j.status !== 'completed') {
          // Reset job for ffmpeg attempt
          j.status = 'rendering';
          j.progress = 5;
          j.error = undefined;
          try {
            await this.executeFfmpegRender(jobId, config);
          } catch (ffmpegError) {
            console.error(`[VideoRender] FFmpeg fallback also failed:`, ffmpegError);
            throw new Error(
              `Both renderers failed. Remotion: ${remotionError instanceof Error ? remotionError.message : String(remotionError)}. FFmpeg: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`
            );
          }
        }
      }
    }
  }

  /**
   * Execute Remotion-based render (with proper browser configuration)
   */
  private async executeRemotionRender(jobId: string, config: RemotionConfig): Promise<void> {
    const job = renderJobs.get(jobId);
    if (!job) return;

    job.renderMethod = 'remotion';

    // Dynamic imports to avoid loading Remotion at module level
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

    if (!existsSync(entryPoint)) {
      throw new Error(`Remotion entry point not found: ${entryPoint}`);
    }

    const bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (override: any) => override,
      onProgress: (progress: number) => {
        job.progress = 10 + Math.floor(progress * 30);
      },
    });

    console.log(`[VideoRender] Bundle created at: ${bundleLocation}`);
    job.progress = 40;

    // ===== CRITICAL FIX: Browser executable + chromium options =====
    // Detect browser executable from environment
    const browserExecutable =
      process.env.REMOTION_CHROME_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH ||
      undefined;

    // Chromium options for Docker environments
    // Note: Remotion v4 ChromiumOptions doesn't have 'args' —
    // --no-sandbox is handled automatically in headless-shell mode
    const chromiumOptions = {
      ignoreCertificateErrors: true,
      disableWebSecurity: true,
      enableMultiProcessOnLinux: true,
    };

    // Use headless-shell mode (designed for Docker/server environments)
    const chromeMode = 'headless-shell' as const;

    if (browserExecutable) {
      console.log(`[VideoRender] Using browser: ${browserExecutable}`);
    }

    // Step 3: Select the composition (with browser executable!)
    console.log('[VideoRender] Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'ReeleVideo',
      inputProps: compositionProps,
      ...(browserExecutable ? { browserExecutable } : {}),
      chromiumOptions,
      chromeMode,
    });

    // Override composition settings from our config
    composition.durationInFrames = config.durationInFrames;
    composition.fps = config.fps;
    composition.width = config.width;
    composition.height = config.height;

    console.log(`[VideoRender] Composition: ${composition.id}, ${composition.durationInFrames} frames @ ${composition.fps}fps`);
    job.progress = 45;

    // Step 4: Render the video (with browser executable!)
    const outputPath = path.join(UPLOAD_DIR, `video-${jobId}.mp4`);
    console.log(`[VideoRender] Rendering to: ${outputPath}`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: compositionProps,
      onProgress: ({ progress }: { progress: number }) => {
        job.progress = 45 + Math.floor(progress * 50);
        if (Math.floor(progress * 10) !== Math.floor((progress - 0.01) * 10)) {
          console.log(`[VideoRender] Progress: ${Math.round(progress * 100)}%`);
        }
      },
      concurrency: 1,
      scale: 1,
      verbose: false,
      encode: true,
      enforceAudioTrack: true,
      // ===== CRITICAL FIX: Pass browser executable + chromium options + chromeMode =====
      ...(browserExecutable ? { browserExecutable } : {}),
      chromiumOptions,
      chromeMode,
    });

    // Step 5: Verify output
    if (!existsSync(outputPath)) {
      throw new Error(`Render completed but output file not found: ${outputPath}`);
    }

    const stats = await import('fs/promises').then((m) => m.stat(outputPath));
    console.log(`[VideoRender] Remotion render complete! Output: ${outputPath} (${Math.round(stats.size / 1024 / 1024)}MB)`);

    // Mark as completed
    job.status = 'completed';
    job.progress = 100;
    job.outputUrl = `/api/upload/video-${jobId}.mp4`;

    await this.onRenderComplete(job, config);
  }

  /**
   * Execute FFmpeg-based render (browser-free, reliable in Docker)
   */
  private async executeFfmpegRender(jobId: string, config: RemotionConfig): Promise<void> {
    const job = renderJobs.get(jobId);
    if (!job) return;

    job.renderMethod = 'ffmpeg';

    const ffmpegRenderer = getFfmpegRenderer();
    const isAvailable = await ffmpegRenderer.isAvailable();

    if (!isAvailable) {
      throw new Error('FFmpeg is not available on this system. Install ffmpeg or use Remotion rendering.');
    }

    console.log('[VideoRender] Using FFmpeg renderer (no browser needed)');

    const outputPath = await ffmpegRenderer.renderVideo(config, jobId, (progress: number) => {
      job.progress = progress;
    });

    // Verify output
    if (!existsSync(outputPath)) {
      throw new Error(`FFmpeg render completed but output file not found: ${outputPath}`);
    }

    const stats = await import('fs/promises').then((m) => m.stat(outputPath));
    console.log(`[VideoRender] FFmpeg render complete! Output: ${outputPath} (${Math.round(stats.size / 1024 / 1024)}MB)`);

    // Mark as completed
    job.status = 'completed';
    job.progress = 100;
    job.outputUrl = `/api/upload/video-${jobId}.mp4`;

    await this.onRenderComplete(job, config);
  }

  /**
   * Called when a render completes successfully (shared by both renderers)
   */
  private async onRenderComplete(job: RenderJob, config: RemotionConfig): Promise<void> {
    // Persist the completed job
    await persistJobs();

    // Update the project in the database if projectId was provided
    if (job.projectId) {
      try {
        const { db } = await import('@/lib/db');
        await db.project.update({
          where: { id: job.projectId },
          data: {
            status: 'completed',
            videoUrl: job.outputUrl,
          },
        });

        // Create video asset record (FIX: type should be 'video', not 'image')
        await db.asset.create({
          data: {
            projectId: job.projectId,
            type: 'video',
            url: job.outputUrl,
            fileName: job.outputUrl!.split('/').pop(),
            mimeType: 'video/mp4',
            metadata: JSON.stringify({
              jobId: job.jobId,
              renderMethod: job.renderMethod || 'unknown',
              duration: config.durationInFrames / config.fps,
              resolution: `${config.width}x${config.height}`,
              fps: config.fps,
            }),
          },
        });

        console.log(`[VideoRender] Project ${job.projectId} updated with video: ${job.outputUrl}`);
      } catch (dbError) {
        console.error(`[VideoRender] Failed to update project ${job.projectId} in DB:`, dbError);
        // Don't fail the render - the video file exists, just the DB update failed
      }
    }

    // Clean up props file if it exists
    try {
      const propsFilePath = path.join(UPLOAD_DIR, 'render-props', `${job.jobId}-props.json`);
      if (existsSync(propsFilePath)) {
        const { unlink } = await import('fs/promises');
        await unlink(propsFilePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get the render status for a job
   * Also checks if the video file actually exists for completed jobs
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
      // Check if the video file exists even though we don't have the job
      // This handles the case where the process restarted
      const possiblePath = path.join(UPLOAD_DIR, `video-${jobId}.mp4`);
      if (existsSync(possiblePath)) {
        return {
          jobId,
          status: 'completed',
          progress: 100,
          outputUrl: `/api/upload/video-${jobId}.mp4`,
        };
      }

      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: `Job ${jobId} not found. The render job may have been lost due to a server restart. Please try re-rendering.`,
      };
    }

    // For completed jobs, verify the file still exists
    if (job.status === 'completed' && job.outputUrl) {
      const filename = job.outputUrl.replace('/api/upload/', '');
      const filePath = path.join(UPLOAD_DIR, filename);
      if (!existsSync(filePath)) {
        // File was deleted or lost
        job.status = 'failed';
        job.error = 'Video file was lost. Please re-render.';
        await persistJobs();
      }
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
   */
  async waitForRender(jobId: string, timeoutMs: number = 300000): Promise<{
    success: boolean;
    outputUrl?: string;
    error?: string;
    duration: number;
  }> {
    const startTime = Date.now();
    const pollInterval = 2000;

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

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
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
   */
  generateCompositionCode(config: RemotionConfig): string {
    const sceneComponents = config.scenes.map((scene, index) => {
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
