// =============================================================================
// Upload File Server - Serves generated images, voiceovers, and videos
// GET /api/upload/:path - Returns a file from the UPLOAD_DIR
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.srt': 'text/plain',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    // Security: prevent directory traversal
    if (filePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fullPath = path.join(UPLOAD_DIR, filePath);

    // Security: ensure the resolved path is within UPLOAD_DIR
    const resolvedPath = path.resolve(fullPath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Check if file exists
    if (!existsSync(resolvedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read the file
    const fileBuffer = await readFile(resolvedPath);
    const fileStat = await stat(resolvedPath);

    // Determine MIME type from extension
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('[Upload] Error serving file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
