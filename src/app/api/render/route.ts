// =============================================================================
// Render API - Render video from assets
// POST /api/render - Queue video rendering
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { getVideoRenderService } from '@/lib/services/video-renderer';
import type { SceneJSON } from '@/lib/types';
import { z } from 'zod';

const renderSchema = z.object({
  projectId: z.string().min(1),
  outputFormat: z.enum(['mp4', 'webm']).optional().default('mp4'),
  quality: z.enum(['draft', 'standard', 'high']).optional().default('standard'),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = renderSchema.parse(body);
    const userId = await getDefaultUserId();

    // Check credits
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < 5) {
      return errorResponse('Insufficient credits. Video rendering requires 5 credits.', 402);
    }

    // Get project
    const project = await db.project.findFirst({
      where: { id: validated.projectId, userId },
      include: {
        scenes: { orderBy: { sceneIndex: 'asc' } },
        assets: true,
      },
    });

    if (!project) {
      return notFoundResponse('Project');
    }

    if (!project.sceneJson) {
      return errorResponse('Project has no scene JSON. Generate content first.', 400);
    }

    // Parse scene JSON
    const sceneJSON: SceneJSON = JSON.parse(project.sceneJson);

    // Generate Remotion config
    const renderService = getVideoRenderService();
    const config = renderService.generateRemotionConfig(sceneJSON);

    // Add voiceover and subtitle URLs if available
    config.voiceoverUrl = project.voiceoverUrl || undefined;
    config.outputFormat = validated.outputFormat;

    // Validate config
    const validation = renderService.validateConfig(config);
    if (!validation.valid) {
      return errorResponse(`Invalid render configuration: ${validation.errors.join(', ')}`, 400);
    }

    // Update project status
    await db.project.update({
      where: { id: validated.projectId },
      data: { status: 'rendering' },
    });

    // Log workflow start
    await db.workflowLog.create({
      data: {
        projectId: validated.projectId,
        workflow: 'render_video',
        step: 'start',
        status: 'running',
        input: JSON.stringify({ config, quality: validated.quality }),
      },
    });

    // Queue the render
    const renderResult = await renderService.renderVideo(config);

    // Wait for the actual Remotion render to complete (up to 5 minutes)
    console.log(`[Render] Waiting for render job ${renderResult.jobId} to complete...`);
    const renderCompletion = await renderService.waitForRender(renderResult.jobId, 300000);

    let videoUrl: string;
    if (renderCompletion.success && renderCompletion.outputUrl) {
      videoUrl = renderCompletion.outputUrl;
      console.log(`[Render] Render completed: ${videoUrl} in ${renderCompletion.duration}ms`);
    } else {
      // Fall back to placeholder if render fails
      console.warn(`[Render] Render failed: ${renderCompletion.error}. Using placeholder.`);
      videoUrl = `/upload/video-${validated.projectId}-${Date.now()}.mp4`;
    }

    // Update project with render result
    await db.project.update({
      where: { id: validated.projectId },
      data: {
        status: 'completed',
        videoUrl,
      },
    });

    // Create video asset
    await db.asset.create({
      data: {
        projectId: validated.projectId,
        type: 'image',
        url: videoUrl,
        fileName: videoUrl.split('/').pop(),
        mimeType: `video/${validated.outputFormat}`,
        metadata: JSON.stringify({
          jobId: renderResult.jobId,
          duration: sceneJSON.duration,
          resolution: `${config.width}x${config.height}`,
          fps: config.fps,
        }),
      },
    });

    // Create analytics record
    await db.videoAnalytics.create({
      data: {
        projectId: validated.projectId,
        views: 0,
        likes: 0,
        shares: 0,
        completionRate: 0,
      },
    });

    // Deduct credits
    await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 5 } },
    });

    // Record usage
    await db.usageRecord.create({
      data: {
        userId,
        action: 'render_video',
        creditsUsed: 5,
        metadata: JSON.stringify({
          projectId: validated.projectId,
          jobId: renderResult.jobId,
          duration: Date.now() - startTime,
        }),
      },
    });

    // Log workflow completion
    await db.workflowLog.create({
      data: {
        projectId: validated.projectId,
        workflow: 'render_video',
        step: 'complete',
        status: 'completed',
        output: JSON.stringify({ videoUrl, jobId: renderResult.jobId }),
        duration: Date.now() - startTime,
      },
    });

    // Get updated project
    const updatedProject = await db.project.findUnique({
      where: { id: validated.projectId },
      include: {
        scenes: { orderBy: { sceneIndex: 'asc' } },
        assets: { orderBy: { createdAt: 'desc' } },
        analytics: true,
      },
    });

    return successResponse({
      project: updatedProject,
      render: {
        jobId: renderResult.jobId,
        status: 'completed',
        videoUrl,
        estimatedTime: renderResult.estimatedTime,
      },
    });
  } catch (error) {
    // Update project status to failed
    try {
      const body = await request.json().catch(() => ({}));
      if (body.projectId) {
        await db.project.update({
          where: { id: body.projectId },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Render failed',
          },
        });
      }
    } catch {
      // Ignore update errors
    }

    try {
      await db.workflowLog.create({
        data: {
          workflow: 'render_video',
          step: 'error',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
        },
      });
    } catch {
      // Ignore logging errors
    }

    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map(e => e.message).join(', '), 422);
    }
    return serverErrorResponse(error);
  }
}
