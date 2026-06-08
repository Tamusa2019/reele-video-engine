// =============================================================================
// Seed API - Seed the database with default data
// POST /api/seed - Run database seeding
// =============================================================================

import { successResponse, serverErrorResponse } from '@/lib/api-utils';
import { seedAll } from '@/lib/seed';

export async function POST() {
  try {
    await seedAll();
    return successResponse({ message: 'Database seeded successfully' });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
