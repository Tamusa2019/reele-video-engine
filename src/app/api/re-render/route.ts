// =============================================================================
// Re-Render API - Re-render a completed project's video
// POST /api/re-render - Trigger re-render for an existing project
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { getVideoRenderService } from '@/lib/services/video-renderer';
import type { SceneJSON } from '@/lib/types';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { projectId } = body as { projectId: string };

    if (!projectId) {
      return errorResponse('projectId is required', 400);
    }

    const userId = await getDefaultUserId();

    // Get project
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
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
    config.voiceoverUrl = project.voiceoverUrl || undefined;

    // Validate config
    const validation = renderService.validateConfig(config);
    if (!validation.valid) {
      return errorResponse(`Invalid render configuration: ${validation.errors.join(', ')}`, 400);
    }

    // Update project status to rendering
    await db.project.update({
      where: { id: projectId },
      data: { status: 'rendering' },
    });

    // Queue the render
    const renderResult = await renderService.renderVideo(config);

    // Wait for the render to complete
    console.log(`[ReRender] Waiting for render job ${renderResult.jobId}...`);
    const renderCompletion = await renderService.waitForRender(renderResult.jobId, 300000);

    let videoUrl: string;
    if (renderCompletion.success && renderCompletion.outputUrl) {
      videoUrl = renderCompletion.outputUrl;
      console.log(`[ReRender] Render completed: ${videoUrl}`);
    } else {
      console.warn(`[ReRender] Render failed: ${renderCompletion.error}`);
      videoUrl = project.videoUrl || `/upload/video-${projectId}-${Date.now()}.mp4`;
    }

    // Update project
    await db.project.update({
      where: { id: projectId },
      data: {
        status: renderCompletion.success ? 'completed' : 'failed',
        videoUrl,
        ...(renderCompletion.success ? {} : { errorMessage: renderCompletion.error }),
      },
    });

    // Get updated project
    const updatedProject = await db.project.findUnique({
      where: { id: projectId },
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
        status: renderCompletion.success ? 'completed' : 'failed',
        videoUrl,
        error: renderCompletion.error,
        duration: Date.now() - startTime,
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
