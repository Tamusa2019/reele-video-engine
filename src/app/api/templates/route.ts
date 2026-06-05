// =============================================================================
// Templates API - Get available templates
// GET /api/templates - List all active templates
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, serverErrorResponse } from '@/lib/api-utils';
import { seedTemplates } from '@/lib/seed';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const supportsRtl = searchParams.get('supportsRtl');

    const where: Record<string, unknown> = { isActive: true };
    if (type) where.type = type;
    if (supportsRtl !== null && supportsRtl !== undefined) {
      where.supportsRtl = supportsRtl === 'true';
    }

    let templates = await db.template.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { projects: true } },
      },
    });

    // If no templates exist, seed them
    if (templates.length === 0) {
      await seedTemplates();
      templates = await db.template.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { projects: true } },
        },
      });
    }

    // Parse config JSON for each template
    const parsedTemplates = templates.map(t => ({
      ...t,
      config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
    }));

    return successResponse(parsedTemplates);
  } catch (error) {
    return serverErrorResponse(error);
  }
}
