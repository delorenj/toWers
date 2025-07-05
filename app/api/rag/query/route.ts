import { NextRequest, NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { authenticateApiKey } from '@/app/api/auth';
import { ragService } from '@/lib/rag-service';

// Input validation schema with security limits
const RagQuerySchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query too long') // Prevent abuse with overly long queries
    .transform((query) => {
      // Use sanitize-html to remove all unsafe content
      const sanitized = sanitizeHtml(query, {
        allowedTags: [], // Disallow all HTML tags
        allowedAttributes: {}, // Disallow all attributes
        allowedSchemes: [], // Disallow all URL schemes (javascript:, data:, etc.)
        disallowedTagsMode: 'discard' // Remove disallowed tags completely
      });
      
      return sanitized.trim();
    })
    .refine(
      (query) => {
        // Whitelist approach: only allow alphanumeric, spaces, and common punctuation
        const allowedPattern = /^[a-zA-Z0-9\s\-_.,!?'"():;@#$%&*+=\/[\]{}|~`\u0080-\uFFFF]+$/;
        return allowedPattern.test(query);
      },
      'Query contains invalid characters'
    ),
  // Removed ragIdentifier to prevent unauthorized access - always use authenticated user's project
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate the request body
    const body = await request.json();
    const { query } = RagQuerySchema.parse(body);

    // Authentication check using database-stored API keys only
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Always use the authenticated user's project UUID for security
    const actualRagIdentifier = auth.activeProfile.project_uuid;

    // Log the RAG query for security monitoring
    await logAuditEvent({
      profileUuid: auth.activeProfile.uuid,
      type: 'MCP_REQUEST',
      action: 'RAG_QUERY',
      metadata: {
        queryLength: query.length,
        projectUuid: actualRagIdentifier,
        endpoint: '/api/rag/query'
      }
    });

    // Query the RAG service for a response
    const ragResult = await ragService.queryForResponse(actualRagIdentifier, query);

    if (!ragResult.success) {
      return NextResponse.json(
        { error: ragResult.error || 'Failed to query RAG service' },
        { status: 500 }
      );
    }

    // Limit response size for security (prevent data exfiltration)
    const MAX_RESPONSE_SIZE = 10000; // 10KB limit
    let responseText = ragResult.response || 'No response generated';
    
    if (responseText.length > MAX_RESPONSE_SIZE) {
      responseText = responseText.substring(0, MAX_RESPONSE_SIZE) + '\n\n[Response truncated for security]';
    }

    // Return the RAG response as a plain string (as specified in the architecture)
    return new NextResponse(responseText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });

  } catch (error) {
    console.error('Error in RAG query API:', error);
    
    // Handle validation errors - don't expose detailed schema information
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input format' },
        { status: 400 }
      );
    }

    // Handle other errors - don't expose internal details
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 500 }
    );
  }
} 