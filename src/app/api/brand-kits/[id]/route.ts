// =============================================================================
// Brand Kit Detail API - Get, Update, Delete a brand kit
// GET /api/brand-kits/[id] - Get brand kit details
// PUT /api/brand-kits/[id] - Update a brand kit
// DELETE /api/brand-kits/[id] - Delete a brand kit
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, notFoundResponse, errorResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { z } from 'zod';

const updateBrandKitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(100).optional(),
  watermarkUrl: z.string().url().optional().or(z.literal('')).optional(),
  watermarkPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    const brandKit = await db.brandKit.findFirst({
      where: { id, userId },
      include: {
        projects: { select: { id: true, title: true, status: true } },
      },
    });

    if (!brandKit) {
      return notFoundResponse('Brand kit');
    }

    return successResponse(brandKit);
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();
    const body = await request.json();
    const validated = updateBrandKitSchema.parse(body);

    // Verify ownership
    const existing = await db.brandKit.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse('Brand kit');
    }

    const updated = await db.brandKit.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map(e => e.message).join(', '), 422);
    }
    return serverErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    // Verify ownership
    const existing = await db.brandKit.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return notFoundResponse('Brand kit');
    }

    // Unlink from projects before deleting
    await db.project.updateMany({
      where: { brandKitId: id },
      data: { brandKitId: null },
    });

    await db.brandKit.delete({
      where: { id },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
