// =============================================================================
// Project Detail API - Get and Delete a specific project
// GET /api/projects/[id] - Get project details
// DELETE /api/projects/[id] - Delete a project
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, notFoundResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getDefaultUserId();

    const project = await db.project.findFirst({
      where: { id, userId },
      include: {
        brandKit: true,
        template: true,
        scenes: { orderBy: { sceneIndex: 'asc' } },
        assets: { orderBy: { createdAt: 'desc' } },
        analytics: true,
      },
    });

    if (!project) {
      return notFoundResponse('Project');
    }

    return successResponse(project);
  } catch (error) {
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
    const project = await db.project.findFirst({
      where: { id, userId },
    });

    if (!project) {
      return notFoundResponse('Project');
    }

    // Delete project (cascades to scenes, assets, analytics)
    await db.project.delete({
      where: { id },
    });

    // Record usage
    await db.usageRecord.create({
      data: {
        userId,
        action: 'delete_project',
        creditsUsed: 0,
        metadata: JSON.stringify({ projectId: id }),
      },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
