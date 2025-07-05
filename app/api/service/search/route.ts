
import { addDays } from 'date-fns';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { db } from '@/db';
import { McpServerSource, profilesTable, projectsTable, searchCacheTable, sharedMcpServersTable, users } from '@/db/schema'; // Added profilesTable, projectsTable, users
import type { PaginatedSearchResult, SearchIndex } from '@/types/search';
import {
  fetchAwesomeMcpServersList,
  getGitHubRepoAsMcpServer,
  getRepoPackageJson,
  searchGitHubRepos,
} from '@/utils/github';
import { getNpmPackageAsMcpServer, searchNpmPackages } from '@/utils/npm';
import {
  fetchSmitheryServerDetails,
  getMcpServerFromSmitheryServer,
  updateMcpServerWithDetails,
} from '@/utils/smithery';

// Cache TTL in minutes for each source
const CACHE_TTL: Record<McpServerSource, number> = {
  [McpServerSource.SMITHERY]: 60, // 1 hour
  [McpServerSource.NPM]: 360, // 6 hours
  [McpServerSource.GITHUB]: 1440, // 24 hours
  [McpServerSource.PLUGGEDIN]: 1440, // 24 hours
  [McpServerSource.COMMUNITY]: 60, // 1 hour - community content may change frequently
};

// Add inline type definition for SmitherySearchResponse
type SmitheryServer = {
  qualifiedName: string;
  displayName: string;
  description: string;
  homepage: string;
  useCount: number;
  isDeployed: boolean;
  createdAt: string;
};

type SmitheryPagination = {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
};

type SmitherySearchResponse = {
  servers: SmitheryServer[];
  pagination: SmitheryPagination;
};

/**
 * Search for MCP servers
 * Default source: all sources
 * 
 * @param request NextRequest object
 * @returns NextResponse with search results
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || '';
  const source = (url.searchParams.get('source') as McpServerSource) || null;
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');

  try {
    let results: SearchIndex = {};

    // If source is specified, only search that source
    if (source) {
      // Check cache first
      const cachedResults = await checkCache(source, query);
      
      if (cachedResults) {
        // Enrich cached results with metrics
        const enrichedResults = await enrichWithMetrics(cachedResults);
        // Paginate enriched results
        const paginatedResults = paginateResults(enrichedResults, offset, pageSize);
        return NextResponse.json(paginatedResults);
      }
      
      // If not in cache, fetch data from source
      switch (source) {
        case McpServerSource.SMITHERY:
          results = await searchSmithery(query);
          break;
        case McpServerSource.NPM:
          results = await searchNpm(query);
          break;
        case McpServerSource.GITHUB:
          results = await searchGitHub(query);
          break;
        case McpServerSource.COMMUNITY:
          results = await searchCommunity(query);
          break;
        default:
          // Return empty results for unsupported sources
          return NextResponse.json({
            results: {},
            total: 0,
            offset,
            pageSize,
            hasMore: false,
          } as PaginatedSearchResult);
      }
      
      // Enrich results with metrics before caching
      results = await enrichWithMetrics(results);
      
      // Cache the enriched results
      await cacheResults(source, query, results);
      
      // Paginate and return results
      const paginatedResults = paginateResults(results, offset, pageSize);
      return NextResponse.json(paginatedResults);
    }
    
    // If no source specified, search all (with caching per source)
    // Check if we have ALL sources cached for this query
    const cachedSmithery = await checkCache(McpServerSource.SMITHERY, query);
    const cachedNpm = await checkCache(McpServerSource.NPM, query);
    const cachedGitHub = await checkCache(McpServerSource.GITHUB, query);
    const cachedCommunity = await checkCache(McpServerSource.COMMUNITY, query);
    
    // If all are cached, combine and return
    if (cachedSmithery && cachedNpm && cachedGitHub && cachedCommunity) {
      const combinedResults: SearchIndex = {};
      
      // Add results with namespace prefix
      Object.entries(cachedSmithery).forEach(([key, value]) => {
        combinedResults[`smithery:${key}`] = value;
      });
      Object.entries(cachedNpm).forEach(([key, value]) => {
        combinedResults[`npm:${key}`] = value;
      });
      Object.entries(cachedGitHub).forEach(([key, value]) => {
        combinedResults[`github:${key}`] = value;
      });
      Object.entries(cachedCommunity).forEach(([key, value]) => {
        combinedResults[`community:${key}`] = value;
      });
      
      // Enrich combined results with metrics
      const enrichedResults = await enrichWithMetrics(combinedResults);
      
      // Paginate and return
      const paginatedResults = paginateResults(enrichedResults, offset, pageSize);
      return NextResponse.json(paginatedResults);
    }
    
    // Otherwise, fetch what's needed and merge
    const smitheryResults = cachedSmithery || await searchSmithery(query);
    if (!cachedSmithery) {
      await cacheResults(McpServerSource.SMITHERY, query, smitheryResults);
    }
    
    const npmResults = cachedNpm || await searchNpm(query);
    if (!cachedNpm) {
      await cacheResults(McpServerSource.NPM, query, npmResults);
    }
    
    const githubResults = cachedGitHub || await searchGitHub(query);
    if (!cachedGitHub) {
      await cacheResults(McpServerSource.GITHUB, query, githubResults);
    }
    
    const communityResults = cachedCommunity || await searchCommunity(query);
    if (!cachedCommunity) {
      await cacheResults(McpServerSource.COMMUNITY, query, communityResults);
    }
    
    // Combine all results under namespaced keys to avoid collisions
    results = {} as SearchIndex;
    
    // Add results with namespace prefix
    Object.entries(smitheryResults).forEach(([key, value]) => {
      results[`smithery:${key}`] = value;
    });
    Object.entries(npmResults).forEach(([key, value]) => {
      results[`npm:${key}`] = value;
    });
    Object.entries(githubResults).forEach(([key, value]) => {
      results[`github:${key}`] = value;
    });
    Object.entries(communityResults).forEach(([key, value]) => {
      results[`community:${key}`] = value;
    });
    
    // Enrich combined results with metrics
    results = await enrichWithMetrics(results);
    
    // Paginate and return results
    const paginatedResults = paginateResults(results, offset, pageSize);
    return NextResponse.json(paginatedResults);
  } catch (_error) {
    console.error('Search error:', _error);
    return NextResponse.json(
      { error: 'Failed to search for MCP servers' },
      { status: 500 }
    );
  }
}

/**
 * Enrich search results with rating and installation metrics
 */
async function enrichWithMetrics(results: SearchIndex): Promise<SearchIndex> {
  const enrichedResults = { ...results };
  
  for (const [_key, server] of Object.entries(enrichedResults)) {
    if (!server.source || !server.external_id) {
      continue;
    }
    
    try {
      // Get metrics for this server
      const metricsResult = await getServerRatingMetrics({
        source: server.source,
        externalId: server.external_id
      });
      
      if (metricsResult.success && metricsResult.metrics) {
        // Add metrics to server data
        server.rating = metricsResult.metrics.averageRating;
        server.ratingCount = metricsResult.metrics.ratingCount;
        server.installation_count = metricsResult.metrics.installationCount;
      }
    } catch (_error) {
      console.error(`Failed to get metrics for ${_key}:`, _error);
      // Continue with next server even if metrics fail
    }
  }
  
  return enrichedResults;
}

/**
 * Search for MCP servers in Smithery
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchSmithery(query: string): Promise<SearchIndex> {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    throw new Error('SMITHERY_API_KEY is not defined');
  }

  const url = new URL('https://registry.smithery.ai/servers');
  if (query) {
    url.searchParams.append('q', query);
  }
  url.searchParams.append('pageSize', '50'); // Get a reasonable number of results

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Smithery API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SmitherySearchResponse;
  
  // Convert to our SearchIndex format
  const results: SearchIndex = {};
  
  for (const server of data.servers) {
    let mcpServer = getMcpServerFromSmitheryServer(server);
    try {
      // Fetch details to get command/args/url
      const details = await fetchSmitheryServerDetails(server.qualifiedName);
      mcpServer = updateMcpServerWithDetails(mcpServer, details);
    } catch (detailError) {
      console.error(`Failed to fetch details for Smithery server ${server.qualifiedName}:`, detailError);
      // Continue with the basic info if details fail
    }
    results[server.qualifiedName] = mcpServer;
  }

  // Enrich results with metrics
  return await enrichWithMetrics(results);
}

/**
 * Search for MCP servers on NPM
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchNpm(query: string): Promise<SearchIndex> {
  try {
    const data = await searchNpmPackages(query);
    
    // Convert to our SearchIndex format
    const results: SearchIndex = {};
    
    for (const item of data.objects) {
      const mcpServer = getNpmPackageAsMcpServer(item.package);
      results[item.package.name] = mcpServer;
    }
    
    // Enrich results with metrics
    return await enrichWithMetrics(results);
  } catch (_error) {
    console.error('NPM search error:', _error);
    return {}; // Return empty results on error
  }
}

/**
 * Search for MCP servers on GitHub
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchGitHub(query: string): Promise<SearchIndex> {
  try {
    // Try to search GitHub for repos
    const repos = await searchGitHubRepos(query);
    
    // Also fetch from awesome-mcp-servers list if no query
    let awesomeRepos: any[] = [];
    if (!query) {
      try {
        awesomeRepos = await fetchAwesomeMcpServersList();
      } catch (_error) {
        console.error('Error fetching awesome-mcp-servers list:', _error);
      }
    }
    
    // Combine and deduplicate
    const allRepos = [...repos];
    for (const repo of awesomeRepos) {
      if (!allRepos.some(r => r.full_name === repo.full_name)) {
        allRepos.push(repo);
      }
    }
    
    // Convert to our SearchIndex format
    const results: SearchIndex = {};
    
    for (const repo of allRepos) {
      // Try to fetch package.json for better metadata
      let packageJson = null;
      try {
        packageJson = await getRepoPackageJson(repo);
      } catch (_error) {
        // Continue without package.json
      }
      
      const mcpServer = getGitHubRepoAsMcpServer(repo, packageJson);
      results[repo.full_name] = mcpServer;
    }
    
    // Enrich results with metrics
    return await enrichWithMetrics(results);
  } catch (_error) {
    console.error('GitHub search error:', _error);
    return {}; // Return empty results on error
  }
}

/**
 * Search for community MCP servers - implementation to show shared servers
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchCommunity(query: string): Promise<SearchIndex> {
  try {
    // Get shared MCP servers, joining through profiles and projects to get user info
    const sharedServersQuery = db
      .select({
        sharedServer: sharedMcpServersTable,
        profile: profilesTable,
        user: users, // Select user data
      })
      .from(sharedMcpServersTable)
      .innerJoin(profilesTable, eq(sharedMcpServersTable.profile_uuid, profilesTable.uuid))
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid)) // Join to projects
      .innerJoin(users, eq(projectsTable.user_id, users.id)) // Join to users
      .where(
        query
          ? and(
              eq(sharedMcpServersTable.is_public, true),
              or(
                ilike(sharedMcpServersTable.title, `%${query}%`),
                ilike(sharedMcpServersTable.description || '', `%${query}%`),
                ilike(users.username, `%${query}%`), // Search by username from users table
                ilike(users.email, `%${query}%`) // Also search by user email
              )
            )
          : eq(sharedMcpServersTable.is_public, true)
      )
      .orderBy(desc(sharedMcpServersTable.created_at))
      .limit(50); // Limit to 50 results

    const resultsWithJoins = await sharedServersQuery;

    // Convert to our SearchIndex format
    const results: SearchIndex = {};

    for (const { sharedServer, profile, user } of resultsWithJoins) {
      // We'll use the template field which contains the sanitized MCP server data
      const template = sharedServer.template as Record<string, any>;

      if (!template) continue;

      // Create an entry with metadata from the shared server
      const serverKey = `${sharedServer.uuid}`;

      // Fetch rating metrics for this shared server
      let rating = 0;
      let ratingCount = 0;
      let installationCount = 0; // Declare installationCount here
      try {
        // For community servers, metrics are linked via external_id (which is the sharedServer.uuid) and source
        const metricsResult = await getServerRatingMetrics({ // Pass args as a single object
          source: McpServerSource.COMMUNITY,
          externalId: sharedServer.uuid
        });
        if (metricsResult.success && metricsResult.metrics) {
          rating = metricsResult.metrics.averageRating;
          ratingCount = metricsResult.metrics.ratingCount;
          installationCount = metricsResult.metrics.installationCount; // Assign value here
        }
      } catch (metricsError) {
        console.error(`Failed to get metrics for community server ${serverKey}:`, metricsError);
      }

      // Determine the display name for 'shared_by' - Use username from users table first, then fallback
      const sharedByName = user?.username || 'Unknown User';
      const profileUrl = user?.username ? `/to/${user.username}` : null;

      results[serverKey] = {
        name: sharedServer.title,
        description: sharedServer.description || '',
        command: template.command || '',
        args: template.args || [],
        envs: Array.isArray(template.env) ? template.env : Object.keys(template.env || {}),
        url: template.url || null,
        source: McpServerSource.COMMUNITY,
        external_id: sharedServer.uuid,
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
        // Add additional metadata
        category: template.category,
        tags: template.tags,
        qualifiedName: `community:${sharedServer.uuid}`,
        updated_at: sharedServer.updated_at.toISOString(),
        // Add shared_by and profile URL
        shared_by: sharedByName,
        shared_by_profile_url: profileUrl,
        rating: rating,
        ratingCount: ratingCount,
        installation_count: installationCount, // Use the declared variable
      };
    }

    console.log(`Found ${Object.keys(results).length} community servers`);
    
    return results; // Return directly as metrics are fetched inside
  } catch (error) {
    console.error('Community search error:', error);
    return {}; // Return empty results on error
  }
}

/**
 * Check cache for search results
 * 
 * @param source Source to check
 * @param query Search query
 * @returns SearchIndex if cache hit, null if miss
 */
async function checkCache(source: McpServerSource, query: string): Promise<SearchIndex | null> {
  const cachedEntry = await db.query.searchCacheTable.findFirst({
    where: (table, { eq, and, gt }) => (
      and(
        eq(table.source, source),
        eq(table.query, query),
        gt(table.expires_at, new Date())
      )
    ),
  });

  if (cachedEntry) {
    return cachedEntry.results as SearchIndex;
  }

  return null;
}

/**
 * Cache search results
 * 
 * @param source Source of results
 * @param query Search query
 * @param results Search results
 */
async function cacheResults(source: McpServerSource, query: string, results: SearchIndex): Promise<void> {
  const ttl = CACHE_TTL[source] || 60; // Default to 1 hour if source not found
  
  await db.insert(searchCacheTable).values({
    source,
    query,
    results,
    expires_at: addDays(new Date(), ttl / (24 * 60)), // Convert minutes to days
  });
}

/**
 * Paginate search results
 * 
 * @param results Full search results
 * @param offset Offset for pagination
 * @param pageSize Page size
 * @returns Paginated results
 */
function paginateResults(results: SearchIndex, offset: number, pageSize: number): PaginatedSearchResult {
  const keys = Object.keys(results);
  const totalResults = keys.length;
  
  const paginatedKeys = keys.slice(offset, offset + pageSize);
  const paginatedResults: SearchIndex = {};
  
  for (const key of paginatedKeys) {
    paginatedResults[key] = results[key];
  }
  
  return {
    results: paginatedResults,
    total: totalResults,
    offset,
    pageSize,
    hasMore: offset + pageSize < totalResults,
  };
}
