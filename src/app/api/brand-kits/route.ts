// =============================================================================
// Brand Kits API - List and Create brand kits
// GET /api/brand-kits - List all brand kits
// POST /api/brand-kits - Create a new brand kit
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { z } from 'zod';

const createBrandKitSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(100).optional(),
  watermarkUrl: z.string().url().optional().or(z.literal('')),
  watermarkPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional(),
});

export async function GET() {
  try {
    const userId = await getDefaultUserId();

    const brandKits = await db.brandKit.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { projects: true } },
      },
    });

    return successResponse(brandKits);
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createBrandKitSchema.parse(body);
    const userId = await getDefaultUserId();

    const brandKit = await db.brandKit.create({
      data: {
        name: validated.name,
        logoUrl: validated.logoUrl || null,
        primaryColor: validated.primaryColor || '#1A2B5F',
        secondaryColor: validated.secondaryColor || '#FFFFFF',
        accentColor: validated.accentColor || '#FF6B35',
        fontFamily: validated.fontFamily || 'Inter',
        watermarkUrl: validated.watermarkUrl || null,
        watermarkPosition: validated.watermarkPosition || 'bottom-right',
        userId,
      },
    });

    return successResponse(brandKit, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map(e => e.message).join(', '), 422);
    }
    return serverErrorResponse(error);
  }
}
