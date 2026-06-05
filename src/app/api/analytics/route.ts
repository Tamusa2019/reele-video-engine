// =============================================================================
// Analytics API - Get usage analytics
// GET /api/analytics - Get usage analytics for the user
// =============================================================================

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, all

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default: // 30d
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get project stats
    const totalProjects = await db.project.count({
      where: { userId, createdAt: { gte: startDate } },
    });

    const completedProjects = await db.project.count({
      where: { userId, status: 'completed', createdAt: { gte: startDate } },
    });

    const failedProjects = await db.project.count({
      where: { userId, status: 'failed', createdAt: { gte: startDate } },
    });

    // Get projects by platform
    const projectsByPlatform = await db.project.groupBy({
      by: ['platform'],
      where: { userId, createdAt: { gte: startDate } },
      _count: { id: true },
    });

    // Get projects by status
    const projectsByStatus = await db.project.groupBy({
      by: ['status'],
      where: { userId, createdAt: { gte: startDate } },
      _count: { id: true },
    });

    // Get credit usage by action
    const creditsByAction = await db.usageRecord.groupBy({
      by: ['action'],
      where: { userId, createdAt: { gte: startDate } },
      _sum: { creditsUsed: true },
      _count: { id: true },
    });

    // Get total credits used in period
    const totalCreditsUsed = await db.usageRecord.aggregate({
      where: { userId, createdAt: { gte: startDate } },
      _sum: { creditsUsed: true },
    });

    // Get video analytics aggregated
    const videoAnalytics = await db.videoAnalytics.findMany({
      where: {
        project: { userId, createdAt: { gte: startDate } },
      },
      select: {
        views: true,
        likes: true,
        shares: true,
        completionRate: true,
      },
    });

    const aggregatedAnalytics = {
      totalViews: videoAnalytics.reduce((sum, a) => sum + a.views, 0),
      totalLikes: videoAnalytics.reduce((sum, a) => sum + a.likes, 0),
      totalShares: videoAnalytics.reduce((sum, a) => sum + a.shares, 0),
      avgCompletionRate: videoAnalytics.length > 0
        ? videoAnalytics.reduce((sum, a) => sum + a.completionRate, 0) / videoAnalytics.length
        : 0,
    };

    // Get recent projects
    const recentProjects = await db.project.findMany({
      where: { userId, createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        platform: true,
        status: true,
        createdAt: true,
        thumbnailUrl: true,
      },
    });

    // Get workflow logs for error tracking
    const failedWorkflows = await db.workflowLog.count({
      where: {
        status: 'failed',
        createdAt: { gte: startDate },
        projectId: { not: null },
      },
    });

    // Get average generation time
    const workflowLogs = await db.workflowLog.findMany({
      where: {
        workflow: 'generate_video',
        status: 'completed',
        duration: { not: null },
        createdAt: { gte: startDate },
      },
      select: { duration: true },
    });

    const avgGenerationTime = workflowLogs.length > 0
      ? Math.round(workflowLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / workflowLogs.length)
      : 0;

    return successResponse({
      period,
      projects: {
        total: totalProjects,
        completed: completedProjects,
        failed: failedProjects,
        successRate: totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0,
        byPlatform: projectsByPlatform.map(p => ({
          platform: p.platform,
          count: p._count.id,
        })),
        byStatus: projectsByStatus.map(s => ({
          status: s.status,
          count: s._count.id,
        })),
      },
      credits: {
        totalUsed: totalCreditsUsed._sum.creditsUsed || 0,
        byAction: creditsByAction.map(a => ({
          action: a.action,
          creditsUsed: a._sum.creditsUsed || 0,
          count: a._count.id,
        })),
      },
      videoAnalytics: aggregatedAnalytics,
      workflows: {
        failedCount: failedWorkflows,
        avgGenerationTimeMs: avgGenerationTime,
      },
      recentProjects,
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
