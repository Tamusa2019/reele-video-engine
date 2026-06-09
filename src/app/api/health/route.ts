// =============================================================================
// Health API - System health check with environment diagnostics
// GET /api/health - Check system health and env var configuration
// =============================================================================

import { successResponse, serverErrorResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Check database connection
    let databaseStatus = 'connected';
    let stats = { projects: 0, templates: 0, users: 0 };
    try {
      await db.$queryRaw`SELECT 1`;
      const projectCount = await db.project.count();
      const templateCount = await db.template.count();
      const userCount = await db.user.count();
      stats = { projects: projectCount, templates: templateCount, users: userCount };
    } catch {
      databaseStatus = 'error';
    }

    // Check environment variables (diagnostic — helps debug deployment issues)
    const envCheck = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY
        ? `SET (${process.env.GEMINI_API_KEY.substring(0, 8)}...)`
        : '❌ NOT SET',
      DATABASE_URL: process.env.DATABASE_URL
        ? 'SET'
        : '❌ NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'not set',
    };

    return successResponse({
      status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      stats,
      env: envCheck,
      version: '1.0.0',
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
