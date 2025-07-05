'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { toolsTable } from '@/db/schema';
import type { Tool } from '@/types/tool';

/**
 * Fetches all tools associated with a specific MCP server UUID.
 * @param serverUuid The UUID of the MCP server.
 * @returns A promise resolving to an array of Tool objects.
 */
export async function getToolsForServer(serverUuid: string): Promise<Tool[]> {
  if (!serverUuid) {
    return [];
  }
  try {
    const tools = await db.query.toolsTable.findMany({
      where: eq(toolsTable.mcp_server_uuid, serverUuid),
      orderBy: (tools, { asc }) => [asc(tools.name)], // Order alphabetically by name
    });
    // Ensure the return type matches the expected Tool interface
    return tools as Tool[];
  } catch (error) {
    console.error(`[Action Error] Failed to fetch tools for server ${serverUuid}:`, error);
    return []; // Return empty array on error
  }
}
