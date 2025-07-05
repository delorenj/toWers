import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join, normalize, resolve } from 'path';

import { getDocByUuid } from '@/app/actions/library';
import { ErrorResponses } from '@/lib/api-errors';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    // Check authentication
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    // Extract uuid from params and projectUuid from query
    const { uuid } = await params;
    const { searchParams } = new URL(request.url);
    const projectUuid = searchParams.get('projectUuid');

    // Get the document using the authenticated user's ID and project UUID
    // This ensures users can only access documents within their own project
    const doc = await getDocByUuid(session.user.id, uuid, projectUuid || undefined);
    if (!doc) {
      return ErrorResponses.notFound();
    }

    // Sanitize and validate the file path
    // Use same uploads directory as in library.ts
    const uploadsDir = resolve(process.env.UPLOADS_DIR || '/home/pluggedin/uploads');
    const requestedPath = normalize(join(uploadsDir, doc.file_path));
    
    // Ensure the resolved path is within the uploads directory (case-insensitive on Windows)
    const normalizedUploadsDir = uploadsDir.toLowerCase();
    const normalizedRequestedPath = requestedPath.toLowerCase();
    
    if (process.platform === 'win32' ? 
        !normalizedRequestedPath.startsWith(normalizedUploadsDir) : 
        !requestedPath.startsWith(uploadsDir)) {
      console.error('Path traversal attempt detected:', doc.file_path);
      return ErrorResponses.forbidden();
    }
    
    // Read the file
    try {
      const fileBuffer = await readFile(requestedPath);
      
      // Sanitize filename to prevent header injection
      const sanitizedFilename = doc.file_name
        .replace(/[\r\n]/g, '') // Remove line breaks
        .replace(/"/g, '\\"')   // Escape quotes
        .replace(/[^\x20-\x7E]/g, ''); // Remove non-printable chars
      
      // Set appropriate headers
      const headers = new Headers();
      headers.set('Content-Type', doc.mime_type);
      headers.set('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      headers.set('Content-Length', doc.file_size.toString());

      return new NextResponse(fileBuffer, {
        status: 200,
        headers,
      });
    } catch (fileError) {
      console.error('File read error:', fileError);
      return ErrorResponses.notFound();
    }
  } catch (error) {
    console.error('Download error:', error);
    return ErrorResponses.serverError();
  }
} 