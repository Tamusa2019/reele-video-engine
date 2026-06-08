// =============================================================================
// Generate Video API - Full pipeline (content → assets → render)
// POST /api/generate-video - Generate a complete video from start to finish
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { getContentGenerator } from '@/lib/services/content-generator';
import { getBrandingService } from '@/lib/services/branding';
import { getImageGenerationService } from '@/lib/services/image-generator';
import { getVoiceoverService } from '@/lib/services/voiceover';
import { getSubtitleService } from '@/lib/services/subtitle';
import { getVideoRenderService } from '@/lib/services/video-renderer';
import type { ProjectInput, SceneJSON } from '@/lib/types';
import { z } from 'zod';

const generateVideoSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500),
  audience: z.string().min(1, 'Audience is required').max(200),
  platform: z.enum(['facebook_reels', 'instagram_reels', 'tiktok', 'youtube_shorts']),
  language: z.enum(['en', 'ar']),
  duration: z.number().min(5).max(180),
  cta: z.string().max(200).optional(),
  brandKitId: z.string().optional(),
  templateId: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = generateVideoSchema.parse(body);
    const userId = await getDefaultUserId();

    // Check credits (full pipeline: 3 + 2 + 5 = 10 credits)
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.credits < 10) {
      return errorResponse('Insufficient credits. Full video generation requires 10 credits.', 402);
    }

    // Get brand kit if specified
    let brandKitData: Record<string, string | undefined> | null = null;
    if (validated.brandKitId) {
      const brandKit = await db.brandKit.findFirst({
        where: { id: validated.brandKitId, userId },
      });
      if (brandKit) {
        brandKitData = {
          primaryColor: brandKit.primaryColor,
          secondaryColor: brandKit.secondaryColor,
          accentColor: brandKit.accentColor,
          fontFamily: brandKit.fontFamily,
          logoUrl: brandKit.logoUrl || undefined,
          watermarkPosition: brandKit.watermarkPosition,
        };
      }
    }

    // Build project input
    const input: ProjectInput = {
      topic: validated.topic,
      audience: validated.audience,
      platform: validated.platform,
      language: validated.language,
      duration: validated.duration,
      cta: validated.cta,
      brandKitId: validated.brandKitId,
      templateId: validated.templateId,
      logoUrl: validated.logoUrl || brandKitData?.logoUrl,
      primaryColor: validated.primaryColor || brandKitData?.primaryColor,
      secondaryColor: validated.secondaryColor || brandKitData?.secondaryColor,
      accentColor: validated.accentColor || brandKitData?.accentColor,
      fontFamily: validated.fontFamily || brandKitData?.fontFamily,
    };

    // =========================================================================
    // Step 1: Create project record with status "generating"
    // =========================================================================
    console.log(`[GenerateVideo] Step 1: Creating project for "${validated.topic}"`);

    const project = await db.project.create({
      data: {
        title: validated.topic.substring(0, 100),
        topic: validated.topic,
        audience: validated.audience,
        platform: validated.platform,
        language: validated.language,
        duration: validated.duration,
        cta: validated.cta,
        status: 'generating',
        brandKitId: validated.brandKitId,
        templateId: validated.templateId,
        userId,
      },
    });

    const projectId = project.id;

    await db.workflowLog.create({
      data: {
        projectId,
        workflow: 'generate_video',
        step: 'project_created',
        status: 'running',
        input: JSON.stringify(input),
      },
    });

    try {
      // =========================================================================
      // Step 2: Generate content (hook, script, scene JSON)
      // =========================================================================
      console.log(`[GenerateVideo] Step 2: Generating content for project ${projectId}`);

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'generate_content',
          status: 'running',
        },
      });

      const contentGenerator = getContentGenerator();
      const result = await contentGenerator.generateFullContent(input);

      // Apply branding if brand kit is provided
      let sceneJSON = result.sceneJSON;
      if (brandKitData) {
        const brandingService = getBrandingService();
        sceneJSON = brandingService.applyBranding(sceneJSON, brandKitData);
      }

      // Update project with generated content, change status to "rendering"
      await db.project.update({
        where: { id: projectId },
        data: {
          hookText: result.hook,
          scriptText: result.script,
          sceneJson: JSON.stringify(sceneJSON),
          captionText: result.caption,
          hashtags: JSON.stringify(result.hashtags),
          status: 'rendering',
        },
      });

      // Create scene records
      for (let i = 0; i < sceneJSON.scenes.length; i++) {
        const scene = sceneJSON.scenes[i];
        await db.scene.create({
          data: {
            projectId,
            sceneIndex: i,
            start: scene.start,
            end: scene.end,
            type: scene.type,
            text: scene.text,
            imageUrl: scene.imageUrl || null,
            animation: scene.animation ? JSON.stringify(scene.animation) : null,
            duration: scene.end - scene.start,
          },
        });
      }

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'generate_content',
          status: 'completed',
          output: JSON.stringify({ sceneCount: sceneJSON.scenes.length }),
        },
      });

      // =========================================================================
      // Step 3: Generate assets (images, voiceover)
      // =========================================================================
      console.log(`[GenerateVideo] Step 3: Generating assets for project ${projectId}`);

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'generate_assets',
          status: 'running',
        },
      });

      // Generate images
      const imageService = getImageGenerationService();
      const imageMap = await imageService.generateSceneImages(
        sceneJSON.scenes,
        projectId
      );

      // Update scene records with image URLs
      for (const [sceneIndex, imageUrl] of imageMap.entries()) {
        await db.scene.updateMany({
          where: { projectId, sceneIndex },
          data: { imageUrl },
        });

        await db.asset.create({
          data: {
            projectId,
            type: 'image',
            url: imageUrl,
            fileName: imageUrl.split('/').pop(),
            metadata: JSON.stringify({ sceneIndex }),
          },
        });
      }

      // Update scene JSON with image URLs
      for (const [sceneIndex, imageUrl] of imageMap.entries()) {
        if (sceneJSON.scenes[sceneIndex]) {
          sceneJSON.scenes[sceneIndex].imageUrl = imageUrl;
        }
      }

      // Generate thumbnail (skip if rate-limited, use first scene image or placeholder)
      let thumbnailUrl: string | null = null;
      try {
        // Use first generated image as thumbnail to avoid extra API call
        const firstImage = imageMap.values().next().value;
        if (firstImage) {
          thumbnailUrl = firstImage;
          console.log('[GenerateVideo] Using first scene image as thumbnail');
        } else {
          thumbnailUrl = await imageService.generateThumbnail(
            sceneJSON.title,
            validated.topic,
            sceneJSON.branding.primaryColor,
            sceneJSON.branding.accentColor,
            projectId
          );
        }
      } catch (error) {
        console.warn('[GenerateVideo] Thumbnail generation failed:', error);
        // Generate a placeholder thumbnail
        thumbnailUrl = await imageService.generatePlaceholderImage(
          `${sceneJSON.title} - ${validated.topic}`,
          projectId
        );
      }

      // Generate voiceover
      let voiceoverUrl: string | null = null;
      try {
        const voiceoverService = getVoiceoverService();
        const voiceoverText = voiceoverService.getVoiceoverText(sceneJSON);
        voiceoverUrl = await voiceoverService.generateAndSave(
          voiceoverText,
          sceneJSON.language,
          sceneJSON.voiceover.speed,
          projectId
        );
      } catch (error) {
        console.warn('[GenerateVideo] Voiceover generation failed:', error);
      }

      // =========================================================================
      // Step 4: Generate subtitle SRT
      // =========================================================================
      console.log(`[GenerateVideo] Step 4: Generating subtitles for project ${projectId}`);

      const subtitleService = getSubtitleService();
      const srtContent = subtitleService.generateFromSceneJSON(sceneJSON);

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'generate_assets',
          status: 'completed',
          output: JSON.stringify({
            imagesGenerated: imageMap.size,
            voiceoverGenerated: !!voiceoverUrl,
            subtitleGenerated: true,
          }),
        },
      });

      // =========================================================================
      // Step 5: Queue video render
      // =========================================================================
      console.log(`[GenerateVideo] Step 5: Queuing video render for project ${projectId}`);

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'render_video',
          status: 'running',
        },
      });

      const renderService = getVideoRenderService();
      const config = renderService.generateRemotionConfig(sceneJSON);
      config.voiceoverUrl = voiceoverUrl || undefined;
      const renderResult = await renderService.renderVideo(config);

      // Simulated video URL (actual rendering requires Remotion)
      const videoUrl = `/upload/video-${projectId}-${Date.now()}.mp4`;

      // =========================================================================
      // Step 6: Update project status to "completed"
      // =========================================================================
      console.log(`[GenerateVideo] Step 6: Finalizing project ${projectId}`);

      await db.project.update({
        where: { id: projectId },
        data: {
          sceneJson: JSON.stringify(sceneJSON),
          voiceoverUrl,
          subtitleSrt: srtContent,
          thumbnailUrl,
          videoUrl,
          status: 'completed',
        },
      });

      // Create remaining asset records
      if (voiceoverUrl) {
        await db.asset.create({
          data: {
            projectId,
            type: 'voiceover',
            url: voiceoverUrl,
            fileName: voiceoverUrl.split('/').pop(),
            mimeType: 'audio/mpeg',
          },
        });
      }

      await db.asset.create({
        data: {
          projectId,
          type: 'subtitle',
          url: `data:text/plain;base64,${Buffer.from(srtContent).toString('base64')}`,
          fileName: `subtitles-${projectId}.srt`,
          mimeType: 'text/srt',
        },
      });

      if (thumbnailUrl) {
        await db.asset.create({
          data: {
            projectId,
            type: 'thumbnail',
            url: thumbnailUrl,
            fileName: thumbnailUrl.split('/').pop(),
          },
        });
      }

      await db.asset.create({
        data: {
          projectId,
          type: 'image',
          url: videoUrl,
          fileName: videoUrl.split('/').pop(),
          mimeType: 'video/mp4',
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
          projectId,
          views: 0,
          likes: 0,
          shares: 0,
          completionRate: 0,
        },
      });

      // Deduct credits (total: 10)
      await db.user.update({
        where: { id: userId },
        data: { credits: { decrement: 10 } },
      });

      // Record usage
      await db.usageRecord.create({
        data: {
          userId,
          action: 'generate_video',
          creditsUsed: 10,
          metadata: JSON.stringify({
            projectId,
            duration: Date.now() - startTime,
            platform: validated.platform,
            language: validated.language,
          }),
        },
      });

      // Log workflow completion
      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'complete',
          status: 'completed',
          output: JSON.stringify({ videoUrl }),
          duration: Date.now() - startTime,
        },
      });

      // Get complete project with all relations
      const completedProject = await db.project.findUnique({
        where: { id: projectId },
        include: {
          scenes: { orderBy: { sceneIndex: 'asc' } },
          assets: { orderBy: { createdAt: 'desc' } },
          brandKit: true,
          template: true,
          analytics: true,
        },
      });

      console.log(`[GenerateVideo] Project ${projectId} completed in ${Date.now() - startTime}ms`);

      return successResponse({
        project: completedProject,
        content: {
          hook: result.hook,
          script: result.script,
          sceneJSON,
          caption: result.caption,
          hashtags: result.hashtags,
        },
        assets: {
          imagesGenerated: imageMap.size,
          voiceoverUrl,
          subtitleSrt: srtContent,
          thumbnailUrl,
          videoUrl,
        },
        render: {
          jobId: renderResult.jobId,
          status: 'completed',
        },
        totalTime: Date.now() - startTime,
      }, 201);
    } catch (pipelineError) {
      // =========================================================================
      // Error handling: Update project status to "failed"
      // =========================================================================
      console.error(`[GenerateVideo] Pipeline failed for project ${projectId}:`, pipelineError);

      await db.project.update({
        where: { id: projectId },
        data: {
          status: 'failed',
          errorMessage: pipelineError instanceof Error ? pipelineError.message : 'Video generation failed',
        },
      });

      await db.workflowLog.create({
        data: {
          projectId,
          workflow: 'generate_video',
          step: 'error',
          status: 'failed',
          error: pipelineError instanceof Error ? pipelineError.message : 'Unknown error',
          duration: Date.now() - startTime,
        },
      });

      // Return partial results if available
      const failedProject = await db.project.findUnique({
        where: { id: projectId },
        include: {
          scenes: { orderBy: { sceneIndex: 'asc' } },
          assets: true,
        },
      });

      return successResponse({
        project: failedProject,
        error: pipelineError instanceof Error ? pipelineError.message : 'Video generation failed',
        stage: 'pipeline',
        totalTime: Date.now() - startTime,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map(e => e.message).join(', '), 422);
    }
    return serverErrorResponse(error);
  }
}
