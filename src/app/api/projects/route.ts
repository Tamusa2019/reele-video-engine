// =============================================================================
// Projects API - List and Create projects
// GET /api/projects - List all projects
// POST /api/projects - Create a new project
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { z } from 'zod';

const createProjectSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500, 'Topic too long'),
  audience: z.string().min(1, 'Audience is required').max(200, 'Audience too long'),
  platform: z.enum(['facebook_reels', 'instagram_reels', 'tiktok', 'youtube_shorts']),
  language: z.enum(['en', 'ar']),
  duration: z.number().min(5, 'Duration must be at least 5 seconds').max(180, 'Duration must be under 180 seconds'),
  cta: z.string().max(200).optional(),
  brandKitId: z.string().optional(),
  templateId: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;
    const platform = searchParams.get('platform') || undefined;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (platform) where.platform = platform;

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          brandKit: true,
          template: true,
          _count: { select: { assets: true, scenes: true } },
        },
      }),
      db.project.count({ where }),
    ]);

    return successResponse({
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createProjectSchema.parse(body);
    const userId = await getDefaultUserId();

    // Check user credits
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.credits <= 0) {
      return errorResponse('Insufficient credits', 402);
    }

    // Create the project
    const project = await db.project.create({
      data: {
        title: validated.topic.substring(0, 100),
        topic: validated.topic,
        audience: validated.audience,
        platform: validated.platform,
        language: validated.language,
        duration: validated.duration,
        cta: validated.cta,
        status: 'draft',
        brandKitId: validated.brandKitId,
        templateId: validated.templateId,
        userId,
      },
      include: {
        brandKit: true,
        template: true,
      },
    });

    // Deduct credit
    await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 1 } },
    });

    // Record usage
    await db.usageRecord.create({
      data: {
        userId,
        action: 'create_project',
        creditsUsed: 1,
        metadata: JSON.stringify({ projectId: project.id, platform: validated.platform }),
      },
    });

    return successResponse(project, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map(e => e.message).join(', '), 422);
    }
    return serverErrorResponse(error);
  }
}
