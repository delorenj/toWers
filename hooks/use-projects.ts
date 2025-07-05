import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { useToast } from '@/hooks/use-toast';
import { Project } from '@/types/project';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export const useProjects = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { status: sessionStatus } = useSession();

  // Only fetch projects if authenticated
  const { data = [], mutate, isLoading, error } = useSWR(
    // Only fetch if authenticated
    sessionStatus === 'authenticated' ? 'projects' : null,
    getProjects,
    {
      onError: (_error: Error) => {
        // Log the error but don't automatically redirect
        console.error('Projects error:', _error);
        
        // Show toast notification for user feedback
        toast({
          title: t('common.error'),
          description: _error?.message || t('common.errors.unexpected'),
          variant: 'destructive',
        });
        
        // For auth issues, clear the stored project
        const isAuthIssue = 
          error?.message?.toLowerCase().includes('unauthorized') ||
          error?.message?.toLowerCase().includes('session expired');
          
        if (isAuthIssue) {
          localStorage.removeItem(CURRENT_PROJECT_KEY);
        }
        
        return [];
      },
      // Add retry configuration
      shouldRetryOnError: (_err: Error) => {
        // Don't retry on auth errors or server component render errors
        if (
          _err?.message?.includes('Unauthorized') ||
          _err?.message?.includes('Session expired') ||
          _err?.message?.includes('Server Components render')
        ) {
          return false;
        }
        return true;
      },
      // Limit retries
      errorRetryCount: 2
    }
  );

  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Load saved project on mount only if authenticated
  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setCurrentProject(null);
      return;
    }

    try {
      const savedProjectUuid = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (data?.length) {
        if (savedProjectUuid) {
          const savedProject = data.find((p: Project) => p.uuid === savedProjectUuid);
          if (savedProject) {
            setCurrentProject(savedProject);
            return;
          }
        }
        // If no saved project or saved project not found, use first project
        setCurrentProject(data[0]);
      } else {
        setCurrentProject(null);
      }
    } catch (error) {
      console.warn('Failed to load project:', error);
      setCurrentProject(null);
    }
  }, [data, sessionStatus]);

  // Persist project selection
  const handleSetCurrentProject = (project: Project | null) => {
    setCurrentProject(project);

    if (project) {
      localStorage.setItem(CURRENT_PROJECT_KEY, project.uuid);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }

    // Only reload if we're changing projects while authenticated
    if (project && sessionStatus === 'authenticated') {
      window.location.reload();
    }
  };

  return {
    projects: data ?? [],
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    mutate,
    isLoading: isLoading || sessionStatus === 'loading',
    error,
    isAuthenticated: sessionStatus === 'authenticated'
  };
};
