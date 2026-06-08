'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectHeader } from './project-header';
import { VideoPreview } from './video-preview';
import { ScenesTimeline } from './scenes-timeline';
import { AssetsList } from './assets-list';
import { CaptionView } from './caption-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import type { Project, ApiResponse } from '@/lib/frontend-types';
import { toast } from '@/hooks/use-toast';

export function ProjectDetailView() {
  const { selectedProjectId, setView } = useAppStore();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', selectedProjectId],
    queryFn: () => fetch(`/api/projects/${selectedProjectId}`).then(r => r.json()) as Promise<ApiResponse<Project>>,
    enabled: !!selectedProjectId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${selectedProjectId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Project deleted successfully' });
      setView('history');
    },
  });

  const project = data?.data;

  if (!selectedProjectId) {
    return (
      <div className="p-4 lg:p-6 text-center py-20">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load project. It may not exist or has been deleted.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const scenes = project.scenes ?? [];
  const assets = project.assets ?? [];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <ProjectHeader
        project={project}
        onDelete={() => deleteMutation.mutate()}
        onRegenerate={() => toast({ title: 'Re-generation started' })}
      />

      {/* Error message */}
      {project.errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{project.errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Video Preview - 2 columns */}
        <div className="lg:col-span-2">
          <VideoPreview project={project} />
        </div>

        {/* Details - 3 columns */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="script" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="scenes">
                Scenes ({scenes.length})
              </TabsTrigger>
              <TabsTrigger value="assets">
                Assets ({assets.length})
              </TabsTrigger>
              <TabsTrigger value="caption">Caption</TabsTrigger>
            </TabsList>

            <TabsContent value="script" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6 space-y-4">
                  {project.hookText ? (
                    <div>
                      <h4 className="text-sm font-medium text-accent mb-2">Hook</h4>
                      <p className="text-sm leading-relaxed p-3 rounded-lg bg-accent/5 border border-accent/20">
                        {project.hookText}
                      </p>
                    </div>
                  ) : null}
                  {project.scriptText ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Full Script</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line p-3 rounded-lg bg-muted">
                        {project.scriptText}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Script not yet generated
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scenes" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <ScenesTimeline scenes={scenes} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assets" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <AssetsList assets={assets} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="caption" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <CaptionView
                    caption={project.captionText}
                    hashtags={project.hashtags}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
