// =============================================================================
// Credits API - Get user credits
// GET /api/credits - Get current user's credit balance
// =============================================================================

import { successResponse, serverErrorResponse, getDefaultUserId } from '@/lib/api-utils';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const userId = await getDefaultUserId();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!user) {
      return successResponse({
        credits: 0,
        plan: 'free',
      });
    }

    // Get recent credit usage
    const recentUsage = await db.usageRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        creditsUsed: true,
        createdAt: true,
        metadata: true,
      },
    });

    // Get total credits used
    const totalUsed = await db.usageRecord.aggregate({
      where: { userId },
      _sum: { creditsUsed: true },
    });

    return successResponse({
      ...user,
      totalCreditsUsed: totalUsed._sum.creditsUsed || 0,
      recentUsage: recentUsage.map(r => ({
        ...r,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      })),
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
