'use client';

import { ChevronLeft, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import CardGrid from '@/app/(sidebar-layout)/(container)/search/components/CardGrid';
import { createMcpServer } from '@/app/actions/mcp-servers';
import { unshareCollection } from '@/app/actions/social';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';
import { McpIndex } from '@/types/search';

interface CollectionContentProps {
  items: McpServer[];
  title: string;
  description?: string;
  collectionUuid: string;
  profileUuid: string;
  isOwner: boolean;
}

export function CollectionContent({ 
  items, 
  title, 
  description, 
  collectionUuid,
  profileUuid,
  isOwner 
}: CollectionContentProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentProfile } = useProfiles();
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleBack = () => {
    const from = searchParams.get('from');
    if (from) {
      router.push(from);
    } else if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/discover');
    }
  };

  const handleDelete = async () => {
    if (!profileUuid) return;
    
    setIsDeleting(true);
    try {
      const result = await unshareCollection(profileUuid, collectionUuid);
      if (result.success) {
        toast({
          title: t('collections.deleteSuccess'),
          description: t('collections.deleteSuccessDesc'),
        });
        router.push('/discover');
      } else {
        throw new Error(result.error || t('collections.deleteError'));
      }
    } catch (error) {
      toast({
        title: t('collections.error'),
        description: error instanceof Error ? error.message : t('collections.deleteError'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Convert servers to search index format
  const searchIndex = items.reduce<Record<string, McpIndex>>((acc, server) => {
    if (!server) return acc;
    
    // Convert env object to array of strings
    const envArray = server.env ? Object.entries(server.env).map(([key, value]) => `${key}=${value}`) : [];
    
    acc[server.uuid] = {
      name: server.name || '',
      description: server.description || '',
      command: server.command || '',
      args: server.args || [],
      envs: envArray,
      source: server.source || 'COMMUNITY',
      external_id: server.external_id || server.uuid,
      url: server.url || '',
      githubUrl: null,
      package_name: null,
      github_stars: null,
      package_registry: null,
      package_download_count: null,
      rating: server.averageRating || 0,
      ratingCount: server.ratingCount || 0,
      installation_count: server.installationCount || 0,
      shared_by: server.sharedBy || 'Unknown',
      shared_by_profile_url: null,
      useCount: 0,
      category: undefined,
      tags: []
    };
    return acc;
  }, {});

  const handleInstall = async (server: McpServer) => {
    if (!currentProfile?.uuid) {
      toast({
        title: t('collections.error'),
        description: t('collections.noActiveProfile'),
        variant: 'destructive'
      });
      return;
    }

    try {
      await createMcpServer({
        name: server.name,
        description: server.description || '',
        command: server.command || '',
        args: server.args || [],
        env: server.env || {},
        url: server.url || undefined,
        source: server.source || 'CUSTOM',
        external_id: server.external_id || undefined,
        type: server.type || 'STDIO',
        profileUuid: currentProfile.uuid
      });

      toast({
        title: t('collections.serverInstalled'),
        description: t('collections.serverInstalledDesc', { name: server.name })
      });
    } catch (error) {
      console.error('Failed to install server:', error);
      toast({
        title: t('collections.installError'),
        description: t('collections.installErrorDesc'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-8">
        {/* Header section with back button and title */}
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <Button 
              variant="ghost" 
              onClick={handleBack} 
              className="-ml-2 w-fit"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              {t('collections.back')}
            </Button>

            {isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('collections.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('collections.deleteConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('collections.deleteConfirmDesc')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? t('common.deleting') : t('common.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{title}</CardTitle>
              {description && (
                <CardDescription className="text-base">
                  {description}
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        </div>

        {/* Selected servers actions */}
        {selectedServers.length > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={() => {
                selectedServers.forEach(serverId => {
                  const server = items.find(s => s.uuid === serverId);
                  if (server) {
                    handleInstall(server);
                  }
                });
                setSelectedServers([]);
              }}
            >
              {t('collections.installSelected', { count: selectedServers.length })}
            </Button>
          </div>
        )}

        {/* Server grid */}
        <div className="space-y-4">
          {items.length > 0 ? (
            <CardGrid 
              items={searchIndex}
              installedServerMap={new Map()}
              selectable={true}
              onItemSelect={(serverId: string, selected: boolean) => {
                if (selected) {
                  setSelectedServers(prev => [...prev, serverId]);
                } else {
                  setSelectedServers(prev => prev.filter(id => id !== serverId));
                }
              }}
              selectedItems={selectedServers}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {t('collections.noServers')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}