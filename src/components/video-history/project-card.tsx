'use client';

import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play } from 'lucide-react';
import type { Project, PLATFORM_LABELS, STATUS_COLORS } from '@/lib/frontend-types';
import { PLATFORM_LABELS as plLabels, STATUS_COLORS as stColors } from '@/lib/frontend-types';
import { format } from 'date-fns';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { selectProject } = useAppStore();

  return (
    <Card
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
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
          {project.duration}s
        </div>
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
  );
}
