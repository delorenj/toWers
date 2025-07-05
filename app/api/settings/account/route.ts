import { eq } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';

import { db } from '@/db';
import { accounts, apiKeysTable, customMcpServersTable,mcpServersTable, profilesTable, projectsTable, sessions, users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function DELETE(_req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user exists before attempting deletion
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!userExists) {
      // If user doesn't exist, clear their session
      await db.delete(sessions).where(eq(sessions.userId, session.user.id));
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Start a transaction to ensure all deletions succeed or none do
    await db.transaction(async (tx) => {
      // Get user's projects to find associated profiles
      const userProjects = await tx
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.user_id, session.user.id));

      // Delete associated data for each project
      for (const project of userProjects) {
        // Get profiles associated with this project
        const projectProfiles = await tx
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.project_uuid, project.uuid));

        // Delete MCP servers for each profile
        for (const profile of projectProfiles) {
          await tx
            .delete(mcpServersTable)
            .where(eq(mcpServersTable.profile_uuid, profile.uuid));

          await tx
            .delete(customMcpServersTable)
            .where(eq(customMcpServersTable.profile_uuid, profile.uuid));
        }

        // Delete API keys
        await tx
          .delete(apiKeysTable)
          .where(eq(apiKeysTable.project_uuid, project.uuid));

        // Delete profiles
        await tx
          .delete(profilesTable)
          .where(eq(profilesTable.project_uuid, project.uuid));
      }

      // Delete projects
      await tx
        .delete(projectsTable)
        .where(eq(projectsTable.user_id, session.user.id));

      // Delete auth-related data
      await tx
        .delete(accounts)
        .where(eq(accounts.userId, session.user.id));

      await tx
        .delete(sessions)
        .where(eq(sessions.userId, session.user.id));

      // Try to delete avatar file if it exists
      if (session.user.image?.startsWith('/avatars/')) {
        try {
          const avatarPath = join(process.cwd(), 'public', session.user.image);
          await unlink(avatarPath);
        } catch (error) {
          // Log but don't fail the deletion if avatar deletion fails
          console.error('Failed to delete avatar file:', error);
        }
      }

      // Finally, delete the user
      await tx
        .delete(users)
        .where(eq(users.id, session.user.id));
    });

    // Clear the session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('next-auth.session-token');
    response.cookies.delete('__Secure-next-auth.session-token');
    return response;
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account. Please try again later.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getAuthSession();
    
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    
    // Return user account information
    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    });
  } catch (error) {
    console.error('Error fetching account information:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
