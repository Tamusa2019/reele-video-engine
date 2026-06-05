// =============================================================================
// API Response Helper Utilities
// =============================================================================

import { NextResponse } from 'next/server';
import type { ApiResponse } from '@/lib/types';

/**
 * Create a success API response
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create an error API response
 */
export function errorResponse(error: string, status: number = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Create a not found API response
 */
export function notFoundResponse(resource: string = 'Resource'): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error: `${resource} not found` },
    { status: 404 }
  );
}

/**
 * Create an internal server error API response
 */
export function serverErrorResponse(error: unknown): NextResponse<ApiResponse> {
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error('[API Error]', message);
  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}

/**
 * Get the default user ID for demo/development
 * In production, this would come from auth
 */
export async function getDefaultUserId(): Promise<string> {
  const { db } = await import('@/lib/db');

  // Try to find an existing user
  let user = await db.user.findFirst();

  if (!user) {
    // Create a default user if none exists
    user = await db.user.create({
      data: {
        email: 'demo@reele.app',
        name: 'Demo User',
        role: 'user',
        credits: 50,
        plan: 'pro',
      },
    });
  }

  return user.id;
}
