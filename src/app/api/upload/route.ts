// =============================================================================
// Upload API - File upload for logos, images, etc.
// POST /api/upload - Upload a file
// =============================================================================

import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-utils';
import { z } from 'zod';

const UPLOAD_DIR = '/home/z/my-project/upload';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'general'; // logo, image, audio, video, general

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return errorResponse(`Invalid file type: ${file.type}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`, 400);
    }

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate safe filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(sanitizedName);
    const baseName = path.basename(sanitizedName, ext);
    const filename = `${category}-${baseName}-${timestamp}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Return relative URL
    const url = `/upload/${filename}`;

    return successResponse({
      url,
      filename,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
      category,
    }, 201);
  } catch (error) {
    return serverErrorResponse(error);
  }
}
