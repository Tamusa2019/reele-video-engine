// =============================================================================
// Generate Content API - Generate AI content for a project
// POST /api/generate-content - Generate hook, script, scene JSON, caption, hashtags
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { getContentGenerator } from '@/lib/services/content-generator';
import { getBrandingService } from '@/lib/services/branding';
import type { ProjectInput } from '@/lib/types';
import { z } from 'zod';

const generateContentSchema = z.object({
  topic: z.string().min(1).max(500),
  audience: z.string().min(1).max(200),
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
  projectId: z.string().optional(), // If provided, update existing project
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = generateContentSchema.parse(body);
    const userId = await getDefaultUserId();

    // Check credits (skip if CREDITS_DISABLED=true for testing)
    const CREDITS_DISABLED = process.env.CREDITS_DISABLED === 'true';
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!CREDITS_DISABLED && (!user || user.credits < 3)) {
      return errorResponse('Insufficient credits. Content generation requires 3 credits.', 402);
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

    // Create or update project
    let projectId = validated.projectId;
    if (projectId) {
      // Update existing project
      await db.project.update({
        where: { id: projectId },
        data: { status: 'generating', updatedAt: new Date() },
      });
    } else {
      // Create new project
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
      projectId = project.id;
    }

    // Log workflow start
    await db.workflowLog.create({
      data: {
        projectId,
        workflow: 'generate_content',
        step: 'start',
        status: 'running',
        input: JSON.stringify(input),
      },
    });

    // Generate content using AI
    const contentGenerator = getContentGenerator();
    const result = await contentGenerator.generateFullContent(input);

    // Apply branding if brand kit is provided
    let sceneJSON = result.sceneJSON;
    if (brandKitData) {
      const brandingService = getBrandingService();
      sceneJSON = brandingService.applyBranding(sceneJSON, brandKitData);
    }

    // Update project with generated content
    await db.project.update({
      where: { id: projectId },
      data: {
        hookText: result.hook,
        scriptText: result.script,
        sceneJson: JSON.stringify(sceneJSON),
        captionText: result.caption,
        hashtags: JSON.stringify(result.hashtags),
        status: 'draft', // Ready for next step
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

    // Deduct credits (skip if CREDITS_DISABLED=true for testing)
    if (!CREDITS_DISABLED) {
    await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 3 } },
    });
    }

    // Record usage
    await db.usageRecord.create({
      data: {
        userId,
        action: 'generate_content',
        creditsUsed: 3,
        metadata: JSON.stringify({ projectId, duration: Date.now() - startTime }),
      },
    });

    // Log workflow completion
    await db.workflowLog.create({
      data: {
        projectId,
        workflow: 'generate_content',
        step: 'complete',
        status: 'completed',
        output: JSON.stringify({ sceneCount: sceneJSON.scenes.length }),
        duration: Date.now() - startTime,
      },
    });

    // Get the complete project with relations
    const updatedProject = await db.project.findUnique({
      where: { id: projectId },
      include: {
        scenes: { orderBy: { sceneIndex: 'asc' } },
        brandKit: true,
        template: true,
      },
    });

    return successResponse({
      project: updatedProject,
      content: {
        hook: result.hook,
        script: result.script,
        sceneJSON,
        caption: result.caption,
        hashtags: result.hashtags,
      },
    });
  } catch (error) {
    // Log workflow failure
    try {
      await db.workflowLog.create({
        data: {
          workflow: 'generate_content',
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
