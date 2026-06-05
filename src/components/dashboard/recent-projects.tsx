'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PlusCircle, Play, MoreVertical } from 'lucide-react';
import type { Project, ApiResponse, PLATFORM_LABELS, STATUS_COLORS } from '@/lib/frontend-types';
import { PLATFORM_LABELS as plLabels, STATUS_COLORS as stColors } from '@/lib/frontend-types';
import { format } from 'date-fns';

export function RecentProjects() {
  const { setView, selectProject } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'recent'],
    queryFn: () => fetch('/api/projects?limit=6').then(r => r.json()) as Promise<ApiResponse<{ projects: Project[] }>>,
  });

  const projects = data?.data?.projects ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Projects</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView('history')}
          className="text-muted-foreground hover:text-foreground"
        >
          View All
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-0 shadow-sm">
              <Skeleton className="h-40 w-full rounded-t-lg" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Play className="w-8 h-8 text-muted-foreground" />
            </div>
            <h4 className="font-medium mb-1">No videos yet</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first video to get started
            </p>
            <Button onClick={() => setView('create')} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Video
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              onClick={() => selectProject(project.id)}
            >
              {/* Thumbnail */}
              <div className="relative h-40 bg-gradient-to-br from-primary/20 to-accent/20 rounded-t-lg overflow-hidden">
                {project.thumbnailUrl ? (
                  <img
                    src={project.thumbnailUrl}
                    alt={project.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Play className="w-12 h-12 text-primary/30" />
                  </div>
                )}
                {/* Duration badge */}
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                  {project.duration}s
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <CardContent className="p-4">
                <h4 className="font-medium text-sm truncate mb-2">{project.title}</h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {plLabels[project.platform as keyof typeof plLabels] ?? project.platform}
                  </Badge>
                  <Badge className={`text-xs ${stColors[project.status as keyof typeof stColors] ?? ''}`}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(project.createdAt), 'MMM d, yyyy')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
