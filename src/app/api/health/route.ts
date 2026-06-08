// =============================================================================
// Health API - System health check
// GET /api/health - Check system health
// =============================================================================

import { successResponse, serverErrorResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;

    // Get basic stats
    const projectCount = await db.project.count();
    const templateCount = await db.template.count();
    const userCount = await db.user.count();

    return successResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      stats: {
        projects: projectCount,
        templates: templateCount,
        users: userCount,
      },
      version: '1.0.0',
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
