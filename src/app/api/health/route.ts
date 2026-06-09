// =============================================================================
// Health API - System health check with environment diagnostics
// GET /api/health - Check system health and LLM provider configuration
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

    // Check LLM provider configuration
    const llmProviders = {
      groq: process.env.GROQ_API_KEY
        ? `configured (${process.env.GROQ_API_KEY.substring(0, 8)}...)`
        : 'not set — get free key at https://console.groq.com/keys',
      gemini: process.env.GEMINI_API_KEY
        ? `configured (${process.env.GEMINI_API_KEY.substring(0, 8)}...)`
        : 'not set — get free key at https://aistudio.google.com/apikey',
    };

    const preferred = process.env.LLM_PROVIDER || 'auto (tries groq → gemini)';

    const envCheck = {
      LLM_PROVIDER: preferred,
      GROQ_API_KEY: llmProviders.groq,
      GEMINI_API_KEY: llmProviders.gemini,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'not set',
    };

    return successResponse({
      status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      stats,
      llm: envCheck,
      version: '1.0.0',
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
