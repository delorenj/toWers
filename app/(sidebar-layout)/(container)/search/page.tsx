'use client';

import { Filter, Layers, SortDesc } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getMcpServers } from '@/app/actions/mcp-servers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerSource } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth'; // Import useAuth
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';
import { McpIndex, McpServerCategory, PaginatedSearchResult } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

import CardGrid from './components/CardGrid';
import { PaginationUi } from './components/PaginationUi';
import { useFilteredResults } from './hooks/useFilteredResults';
import { useSortedResults } from './hooks/useSortedResults';

const PAGE_SIZE = 8;

type SortOption = 'relevance' | 'popularity' | 'recent' | 'stars';

function SearchContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('query') || '';
  const offset = parseInt(searchParams.get('offset') || '0');
  const sourceParam = searchParams.get('source') || McpServerSource.COMMUNITY;
  const sortParam = (searchParams.get('sort') as SortOption) || 'relevance';
  const tagsParam = searchParams.get('tags') || '';
  const categoryParam = searchParams.get('category') || '';
  
  const [searchQuery, setSearchQuery] = useState(query);
  const [source, setSource] = useState<string>(sourceParam);
  const [sort, setSort] = useState<SortOption>(sortParam);
  const [tags, setTags] = useState<string[]>(tagsParam ? tagsParam.split(',') : []);
  const [category, setCategory] = useState<McpServerCategory | ''>( 
    categoryParam as McpServerCategory || ''
  );
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<McpServerCategory[]>([]);
  const { currentProfile } = useProfiles();
  const { session } = useAuth(); // Use the auth hook
  const currentUsername = session?.user?.username; // Get username from session
  const profileUuid = currentProfile?.uuid;

  // Fetch installed servers for the current profile
  const { data: installedServersData } = useSWR(
    profileUuid ? `${profileUuid}/installed-mcp-servers` : null,
    async () => profileUuid ? getMcpServers(profileUuid) : []
  );

  // Create a memoized map for quick lookup: 'source:external_id' -> uuid
  const installedServerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (installedServersData) {
      installedServersData.forEach((server: McpServer) => {
        if (server.source && server.external_id) {
          map.set(`${server.source}:${server.external_id}`, server.uuid);
        }
      });
    }
    return map;
  }, [installedServersData]);

  // Prepare API URL with parameters
  const apiUrl = source === 'all' 
    ? `/api/service/search?query=${encodeURIComponent(query)}&pageSize=${PAGE_SIZE}&offset=${offset}`
    : `/api/service/search?query=${encodeURIComponent(query)}&source=${source}&pageSize=${PAGE_SIZE}&offset=${offset}`;

  const { data, mutate } = useSWR(
    apiUrl,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
      return res.json() as Promise<PaginatedSearchResult>;
    }
  );

  // Extract all available tags and categories from the results
  useEffect(() => {
    if (data?.results) {
      const tagSet = new Set<string>();
      const categorySet = new Set<McpServerCategory>();
      
      Object.values(data.results as Record<string, McpIndex>).forEach((item) => {
        if (item.tags && item.tags.length) {
          item.tags.forEach(tag => tagSet.add(tag));
        }
        if (item.category) {
          categorySet.add(item.category);
        }
      });
      
      setAvailableTags(Array.from(tagSet).sort());
      setAvailableCategories(Array.from(categorySet).sort());
    }
  }, [data]);

  // Use the enhanced custom hooks for filtering and sorting
  const { filter, getFilteredResults } = useFilteredResults(data?.results, tags, category);
  const { sort: sortState, getSortedResults } = useSortedResults(data?.results, sort, getFilteredResults);

  // Memoize search filters with enhanced state information
  const searchFilters = useMemo(() => {
    return {
      source,
      sort: sort,
      tags: tags.join(','),
      category,
      // Include enhanced state information from hooks
      filterState: filter,
      sortState
    };
  }, [source, sort, tags, category, filter, sortState]);

  // Update URL when search parameters change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        searchQuery !== query || 
        searchFilters.source !== sourceParam || 
        searchFilters.sort !== sortParam || 
        searchFilters.tags !== tagsParam ||
        searchFilters.category !== categoryParam
      ) {
        const params = new URLSearchParams();
        if (searchQuery) {
          params.set('query', searchQuery);
        }
        if (searchFilters.source !== 'all') {
          params.set('source', searchFilters.source);
        }
        if (!searchFilters.sortState.isDefault) {
          params.set('sort', searchFilters.sort);
        }
        if (searchFilters.filterState.hasTags) {
          params.set('tags', searchFilters.tags);
        }
        if (searchFilters.filterState.hasCategory) {
          params.set('category', searchFilters.category);
        }
        params.set('offset', '0');
        router.push(`/search?${params.toString()}`);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, query, searchFilters, sourceParam, sortParam, tagsParam, categoryParam, router]);

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('offset', ((page - 1) * PAGE_SIZE).toString());
    router.push(`/search?${params.toString()}`);
  };

  const handleSourceChange = (value: string) => {
    setSource(value);
  };
  
  const handleSortChange = (value: SortOption) => {
    setSort(value);
  };
  
  const handleTagToggle = (tag: string) => {
    setTags(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };
  
  const handleCategoryChange = (cat: McpServerCategory | '') => {
    setCategory(cat);
  };

  // Render category icon dynamically
  const renderCategoryIcon = (cat: McpServerCategory) => {
    const iconName = getCategoryIcon(cat);
    const IconComponent = (LucideIcons as Record<string, any>)[iconName];
    
    return IconComponent ? <IconComponent className="h-4 w-4 mr-2" /> : <Layers className="h-4 w-4 mr-2" />;
  };

  return (
    <div className="container-fluid h-[var(--search-content)] flex flex-col bg-background py-4 space-y-4">

    <div className="flex flex-col space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t('search.title')}</h1>
        <p className="text-muted-foreground">
          {t('search.subtitle')}
        </p>
      </div>

      {/* Search Controls */}
      <div className="flex flex-wrap gap-4">
        <div className="w-full">
          <Input
            type='search'
            placeholder={t('search.input.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='mb-6 h-10 max-w-xl'
          />
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
          <Tabs defaultValue={source} onValueChange={handleSourceChange} className="w-full">
            <TabsList className="w-full h-10 flex rounded-lg">
              <TabsTrigger value={McpServerSource.COMMUNITY} className="flex-1">Community</TabsTrigger>
              <TabsTrigger value="all" className="flex-1">All Sources</TabsTrigger>
              <TabsTrigger value={McpServerSource.SMITHERY} className="flex-1">Smithery</TabsTrigger>
              <TabsTrigger value={McpServerSource.NPM} className="flex-1">NPM</TabsTrigger>
              <TabsTrigger value={McpServerSource.GITHUB} className="flex-1">GitHub</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex space-x-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Layers className="h-4 w-4 mr-2" />
                  {t('search.category')}
                  {category && <span className="ml-1">({t(`search.categories.${category}`)})</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('search.filterByCategory')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={() => handleCategoryChange('')}
                  className={!category ? 'bg-accent' : ''}
                >
                  {t('search.allCategories')}
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                {availableCategories.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto">
                    {availableCategories.map(cat => (
                      <DropdownMenuItem 
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className={category === cat ? 'bg-accent' : ''}
                      >
                        {renderCategoryIcon(cat)}
                        {t(`search.categories.${cat}`)}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ) : (
                  <DropdownMenuItem disabled>
                    {t('search.noCategoriesAvailable')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SortDesc className="h-4 w-4 mr-2" />
                  {t('search.sort')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('search.sortBy')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem 
                    onClick={() => handleSortChange('relevance')}
                    className={sort === 'relevance' ? 'bg-accent' : ''}
                  >
                    {t('search.sortOptions.relevance')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleSortChange('popularity')}
                    className={sort === 'popularity' ? 'bg-accent' : ''}
                  >
                    {t('search.sortOptions.popularity')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleSortChange('recent')}
                    className={sort === 'recent' ? 'bg-accent' : ''}
                  >
                    {t('search.sortOptions.recent')}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleSortChange('stars')}
                    className={sort === 'stars' ? 'bg-accent' : ''}
                  >
                    {t('search.sortOptions.stars')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  {t('search.filter')}
                  {tags.length > 0 && <span className="ml-1">({tags.length})</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('search.filterByTags')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTags.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto">
                    {availableTags.map(tag => (
                      <DropdownMenuItem 
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
                        className={tags.includes(tag) ? 'bg-accent' : ''}
                      >
                        {tag}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ) : (
                  <DropdownMenuItem disabled>
                    {t('search.noTagsAvailable')}
                  </DropdownMenuItem>
                )}
                {tags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setTags([])}>
                      {t('search.clearFilters')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Active filters display */}
        {(category || tags.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {category && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {renderCategoryIcon(category)}
                {t(`search.categories.${category}`)}
                <button
                  className="ml-1 hover:bg-accent p-1 rounded-full"
                  onClick={() => handleCategoryChange('')}
                >
                  ✕
                </button>
              </Badge>
            )}
            
            {tags.map(tag => (
              <Badge key={tag} variant="outline">
                #{tag}
                <button
                  className="ml-1 hover:bg-accent p-1 rounded-full"
                  onClick={() => handleTagToggle(tag)}
                >
                  ✕
                </button>
              </Badge>
            ))}
            
            {(category || tags.length > 0) && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs"
                onClick={() => {
                  setCategory('');
                  setTags([]);
                }}
              >
                {t('search.clearAllFilters')}
              </Button>
            )}
          </div>
        )}
      </div>

      {data?.results && (
        <CardGrid
          items={getSortedResults() || {}}
          installedServerMap={installedServerMap}
          currentUsername={currentUsername} // Pass the correct username
          profileUuid={profileUuid}
          onRefreshNeeded={() => mutate()}
        />
      )}

   <div className='pb-3'>
   {data && data.total > 0 && (
        <PaginationUi
          currentPage={Math.floor(offset / PAGE_SIZE) + 1}
          totalPages={Math.ceil(data.total / PAGE_SIZE)}
          onPageChange={handlePageChange}
        />
      )}
   </div>
    </div>
  );
}

export default function SearchPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div>{t('search.loading')}</div>}>
      <SearchContent />
    </Suspense>
  );
}
