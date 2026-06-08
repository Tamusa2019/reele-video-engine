// =============================================================================
// Video Render Service - Prepare rendering instructions from scene JSON
// Generates Remotion-compatible configuration for video rendering
// =============================================================================

import type { SceneJSON, RemotionConfig, SceneData } from '@/lib/types';
import { PLATFORM_DIMENSIONS } from '@/lib/types';

let videoRenderInstance: VideoRenderService | null = null;

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
      voiceoverUrl: undefined, // Will be set when voiceover is generated
      subtitleUrl: undefined, // Will be set when subtitles are generated
      outputFormat: 'mp4',
    };

    return config;
  }

  /**
   * Render a video from a Remotion configuration
   * For now, this generates the config and queues a render job
   * Actual rendering requires Remotion to be set up
   */
  async renderVideo(config: RemotionConfig): Promise<{ jobId: string; status: string; estimatedTime: number }> {
    console.log(`[VideoRender] Starting render for composition: ${config.compositionId}`);
    console.log(`[VideoRender] Duration: ${config.durationInFrames / config.fps}s, Resolution: ${config.width}x${config.height}`);

    // Generate a job ID
    const jobId = `render-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Estimate rendering time (roughly 2x real-time for Remotion)
    const durationSeconds = config.durationInFrames / config.fps;
    const estimatedTime = Math.ceil(durationSeconds * 2);

    // In a production environment, this would:
    // 1. Queue the render job in a job system (BullMQ, etc.)
    // 2. Start a Remotion rendering process
    // 3. Return the job ID for status tracking

    console.log(`[VideoRender] Job ${jobId} queued. Estimated time: ${estimatedTime}s`);

    // For now, return a stub response
    // The actual rendering will be implemented when Remotion is integrated
    return {
      jobId,
      status: 'queued',
      estimatedTime,
    };
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
    // Stub: In production, this would check the actual render job status
    return {
      jobId,
      status: 'queued',
      progress: 0,
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
}

/** Convenience function */
export function getVideoRenderService(): VideoRenderService {
  if (!videoRenderInstance) {
    videoRenderInstance = new VideoRenderService();
  }
  return videoRenderInstance;
}
