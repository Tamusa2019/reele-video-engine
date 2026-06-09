// =============================================================================
// Render Status API - Poll render job progress
// GET /api/render-status?jobId=xxx
// =============================================================================

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api-utils';
import { getVideoRenderService } from '@/lib/services/video-renderer';

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId');

  if (!jobId) {
    return errorResponse('jobId query parameter is required', 400);
  }

  const renderService = getVideoRenderService();
  const status = await renderService.getRenderStatus(jobId);

  return successResponse(status);
}
