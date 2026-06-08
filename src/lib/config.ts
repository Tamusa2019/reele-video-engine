// =============================================================================
// Application Configuration - Environment-aware paths and settings
// Centralizes all path configuration so deployment works anywhere
// =============================================================================

import path from 'path';
import { mkdirSync } from 'fs';

/**
 * Base directory for the application.
 * In production: process.cwd() (where the app runs)
 * In development: same, but resolves to the project root
 */
const APP_ROOT = process.cwd();

/**
 * Upload directory for generated assets (images, voiceovers, etc.)
 * - Local/Render: uses filesystem path
 * - Vercel: uses /tmp (ephemeral, resets on each cold start)
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(APP_ROOT, 'upload');

/**
 * Database directory (for SQLite)
 * - Local/Render: uses filesystem path
 * - Vercel: SQLite is NOT supported (use Vercel Postgres instead)
 */
export const DB_DIR = process.env.DB_DIR || path.join(APP_ROOT, 'db');

/**
 * Public assets directory
 */
export const PUBLIC_DIR = path.join(APP_ROOT, 'public');

/**
 * App environment
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_VERCEL = !!process.env.VERCEL;
export const IS_RENDER = !!process.env.RENDER;

/**
 * Ensure upload directory exists at startup
 */
export function ensureDirectories() {
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    if (!IS_VERCEL) {
      mkdirSync(DB_DIR, { recursive: true });
    }
    console.log(`[Config] UPLOAD_DIR: ${UPLOAD_DIR}`);
    console.log(`[Config] DB_DIR: ${DB_DIR}`);
    console.log(`[Config] Environment: ${IS_PRODUCTION ? 'production' : 'development'}${IS_VERCEL ? ' (Vercel)' : ''}${IS_RENDER ? ' (Render)' : ''}`);
  } catch (error) {
    console.warn('[Config] Could not create directories:', error);
  }
}

/**
 * Get the DATABASE_URL based on environment
 * - If explicitly set, use it as-is
 * - Otherwise, construct a local SQLite path
 */
export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Default: local SQLite
  return `file:${path.join(DB_DIR, 'custom.db')}`;
}
