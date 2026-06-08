// =============================================================================
// Generate Assets API - Generate images and voiceover from scene JSON
// POST /api/generate-assets - Generate visual and audio assets
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { getImageGenerationService } from '@/lib/services/image-generator';
import { getVoiceoverService } from '@/lib/services/voiceover';
import { getSubtitleService } from '@/lib/services/subtitle';
import type { SceneJSON, SceneData } from '@/lib/types';
import { z } from 'zod';

const generateAssetsSchema = z.object({
  projectId: z.string().min(1),
  generateImages: z.boolean().optional().default(true),
  generateVoiceover: z.boolean().optional().default(true),
  generateSubtitles: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = generateAssetsSchema.parse(body);
    const userId = await getDefaultUserId();

    // Check credits
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < 2) {
      return errorResponse('Insufficient credits. Asset generation requires 2 credits.', 402);
    }

    // Get project with scenes
    const project = await db.project.findFirst({
      where: { id: validated.projectId, userId },
      include: { scenes: { orderBy: { sceneIndex: 'asc' } } },
    });

    if (!project) {
      return notFoundResponse('Project');
    }

    if (!project.sceneJson) {
      return errorResponse('Project has no scene JSON. Generate content first.', 400);
    }

    // Parse scene JSON
    const sceneJSON: SceneJSON = JSON.parse(project.sceneJson);

    // Update project status
    await db.project.update({
      where: { id: validated.projectId },
      data: { status: 'rendering' },
    });

    // Log workflow start
    await db.workflowLog.create({
      data: {
        projectId: validated.projectId,
        workflow: 'generate_assets',
        step: 'start',
        status: 'running',
        input: JSON.stringify(validated),
      },
    });

    const results: Record<string, unknown> = {};

    // Generate images
    if (validated.generateImages) {
      console.log(`[GenerateAssets] Generating images for project ${validated.projectId}`);
      const imageService = getImageGenerationService();
      const imageMap = await imageService.generateSceneImages(
        sceneJSON.scenes,
        validated.projectId
      );

      // Update scene records with image URLs
      for (const [sceneIndex, imageUrl] of imageMap.entries()) {
        await db.scene.updateMany({
          where: {
            projectId: validated.projectId,
            sceneIndex,
          },
          data: { imageUrl },
        });

        // Create asset record
        await db.asset.create({
          data: {
            projectId: validated.projectId,
            type: 'image',
            url: imageUrl,
            fileName: imageUrl.split('/').pop(),
            metadata: JSON.stringify({ sceneIndex }),
          },
        });
      }

      results.imagesGenerated = imageMap.size;

      // Update scene JSON with image URLs
      for (const [sceneIndex, imageUrl] of imageMap.entries()) {
        if (sceneJSON.scenes[sceneIndex]) {
          sceneJSON.scenes[sceneIndex].imageUrl = imageUrl;
        }
      }

      // Generate thumbnail
      try {
        const thumbnailUrl = await imageService.generateThumbnail(
          sceneJSON.title,
          project.topic,
          sceneJSON.branding.primaryColor,
          sceneJSON.branding.accentColor,
          validated.projectId
        );

        await db.project.update({
          where: { id: validated.projectId },
          data: { thumbnailUrl },
        });

        await db.asset.create({
          data: {
            projectId: validated.projectId,
            type: 'thumbnail',
            url: thumbnailUrl,
            fileName: thumbnailUrl.split('/').pop(),
          },
        });

        results.thumbnailUrl = thumbnailUrl;
      } catch (error) {
        console.warn('[GenerateAssets] Thumbnail generation failed:', error);
      }
    }

    // Generate voiceover
    if (validated.generateVoiceover) {
      console.log(`[GenerateAssets] Generating voiceover for project ${validated.projectId}`);
      const voiceoverService = getVoiceoverService();
      const voiceoverText = voiceoverService.getVoiceoverText(sceneJSON);
      const voiceoverUrl = await voiceoverService.generateAndSave(
        voiceoverText,
        sceneJSON.language,
        sceneJSON.voiceover.speed,
        validated.projectId
      );

      await db.project.update({
        where: { id: validated.projectId },
        data: { voiceoverUrl },
      });

      await db.asset.create({
        data: {
          projectId: validated.projectId,
          type: 'voiceover',
          url: voiceoverUrl,
          fileName: voiceoverUrl.split('/').pop(),
          mimeType: 'audio/mpeg',
        },
      });

      results.voiceoverUrl = voiceoverUrl;
    }

    // Generate subtitles
    if (validated.generateSubtitles) {
      console.log(`[GenerateAssets] Generating subtitles for project ${validated.projectId}`);
      const subtitleService = getSubtitleService();
      const srtContent = subtitleService.generateFromSceneJSON(sceneJSON);

      await db.project.update({
        where: { id: validated.projectId },
        data: { subtitleSrt: srtContent },
      });

      await db.asset.create({
        data: {
          projectId: validated.projectId,
          type: 'subtitle',
          url: `data:text/plain;base64,${Buffer.from(srtContent).toString('base64')}`,
          fileName: `subtitles-${validated.projectId}.srt`,
          mimeType: 'text/srt',
          metadata: JSON.stringify({ format: 'srt' }),
        },
      });

      results.subtitleGenerated = true;
    }

    // Update scene JSON with new data
    await db.project.update({
      where: { id: validated.projectId },
      data: {
        sceneJson: JSON.stringify(sceneJSON),
        status: 'draft', // Ready for rendering
      },
    });

    // Deduct credits
    await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 2 } },
    });

    // Record usage
    await db.usageRecord.create({
      data: {
        userId,
        action: 'generate_assets',
        creditsUsed: 2,
        metadata: JSON.stringify({
          projectId: validated.projectId,
          duration: Date.now() - startTime,
          ...results,
        }),
      },
    });

    // Log workflow completion
    await db.workflowLog.create({
      data: {
        projectId: validated.projectId,
        workflow: 'generate_assets',
        step: 'complete',
        status: 'completed',
        output: JSON.stringify(results),
        duration: Date.now() - startTime,
      },
    });

    // Get updated project
    const updatedProject = await db.project.findUnique({
      where: { id: validated.projectId },
      include: {
        scenes: { orderBy: { sceneIndex: 'asc' } },
        assets: { orderBy: { createdAt: 'desc' } },
      },
    });

    return successResponse({
      project: updatedProject,
      results,
    });
  } catch (error) {
    try {
      await db.workflowLog.create({
        data: {
          workflow: 'generate_assets',
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
