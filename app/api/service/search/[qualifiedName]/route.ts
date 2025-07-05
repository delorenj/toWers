import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { McpServerSource } from '@/db/schema';
import { McpIndex, SmitheryServer } from '@/types/search';
import { getGitHubRepoAsMcpServer, getRepoPackageJson } from '@/utils/github';
import { getNpmPackageAsMcpServer, searchNpmPackages } from '@/utils/npm';
import { fetchSmitheryServerDetails, getMcpServerFromSmitheryServer, updateMcpServerWithDetails } from '@/utils/smithery';

/**
 * Enrich a server with rating and installation metrics
 */
async function enrichServerWithMetrics(server: McpIndex): Promise<McpIndex> {
  if (!server.source || !server.external_id) {
    return server;
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
  } catch (error) {
    console.error(`Failed to get metrics for ${server.name}:`, error);
    // Continue even if metrics fail
  }
  
  return server;
}

/**
 * Get detailed information about a specific MCP server
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qualifiedName: string }> }
) {
  const { qualifiedName } = await params;
  
  try {
    let mcpServer: McpIndex | null = null;
    
    // Determine the source based on the qualifiedName or source query param
    const url = new URL(request.url);
    let source = url.searchParams.get('source') as McpServerSource | null;
    
    // If source is not provided, try to infer it from the qualified name
    if (!source) {
      if (qualifiedName.includes('/') && !qualifiedName.startsWith('@')) {
        // Likely a GitHub repo or Smithery server
        if (qualifiedName.includes('github.com')) {
          source = McpServerSource.GITHUB;
        } else {
          source = McpServerSource.SMITHERY;
        }
      } else {
        // Likely an NPM package
        source = McpServerSource.NPM;
      }
    }
    
    switch (source) {
      case McpServerSource.SMITHERY:
        mcpServer = await getSmitheryServerDetails(qualifiedName);
        break;
      case McpServerSource.NPM:
        mcpServer = await getNpmPackageDetails(qualifiedName);
        break;
      case McpServerSource.GITHUB:
        mcpServer = await getGitHubRepoDetails(qualifiedName);
        break;
      default:
        throw new Error(`Unsupported source: ${source}`);
    }
    
    if (!mcpServer) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }
    
    // Enrich with metrics before returning
    mcpServer = await enrichServerWithMetrics(mcpServer);
    
    return NextResponse.json(mcpServer);
  } catch (_error) {
    console.error('Error fetching server details:', _error);
    return NextResponse.json(
      { error: 'Failed to fetch server details' },
      { status: 500 }
    );
  }
}

/**
 * Get details for a Smithery server
 */
async function getSmitheryServerDetails(qualifiedName: string): Promise<McpIndex | null> {
  // First, create a basic server object
  const dummyServer: SmitheryServer = {
    qualifiedName,
    displayName: qualifiedName.split('/').pop() || qualifiedName,
    description: '',
    homepage: '',
    useCount: 0,
    isDeployed: false,
    createdAt: new Date().toISOString(),
  };
  
  let mcpServer = getMcpServerFromSmitheryServer(dummyServer);
  
  // Fetch details from Smithery API
  try {
    const details = await fetchSmitheryServerDetails(qualifiedName);
    mcpServer = updateMcpServerWithDetails(mcpServer, details);
  } catch (error) {
    console.error(`Error fetching Smithery server details: ${error}`);
    // Continue with basic info if details fetch fails
  }
  
  return mcpServer;
}

/**
 * Get details for an NPM package
 */
async function getNpmPackageDetails(packageName: string): Promise<McpIndex | null> {
  try {
    // Search for the exact package
    const searchResults = await searchNpmPackages(packageName);
    
    const matchingPackage = searchResults.objects.find(
      obj => obj.package.name === packageName
    );
    
    if (!matchingPackage) {
      return null;
    }
    
    return getNpmPackageAsMcpServer(matchingPackage.package);
  } catch (error) {
    console.error(`Error fetching NPM package details: ${error}`);
    return null;
  }
}

/**
 * Get details for a GitHub repository
 */
async function getGitHubRepoDetails(repoFullName: string): Promise<McpIndex | null> {
  try {
    // Clean up the repo name if it contains a URL
    const fullName = repoFullName.replace('https://github.com/', '').replace(/\/$/, '');
    
    // Fetch repo details from GitHub API
    const response = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const repo = await response.json();
    
    // Try to fetch package.json for better metadata
    let packageJson = null;
    try {
      packageJson = await getRepoPackageJson(repo);
    } catch (_error) {
      // Continue without package.json
    }
    
    return getGitHubRepoAsMcpServer(repo, packageJson);
  } catch (_error) {
    console.error(`Error fetching GitHub repo details:`, _error);
    return null;
  }
} 