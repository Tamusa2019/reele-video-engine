'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Trash2, Download } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { Project, STATUS_COLORS, PLATFORM_LABELS } from '@/lib/frontend-types';
import { STATUS_COLORS as stColors, PLATFORM_LABELS as plLabels } from '@/lib/frontend-types';
import { format } from 'date-fns';

interface ProjectHeaderProps {
  project: Project;
  onDelete?: () => void;
  onRegenerate?: () => void;
}

export function ProjectHeader({ project, onDelete, onRegenerate }: ProjectHeaderProps) {
  const { setView } = useAppStore();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView('history')}
            className="h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-xl font-bold">{project.title}</h2>
          <Badge className={stColors[project.status as keyof typeof stColors] ?? ''}>
            {project.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground ml-11">
          <span>{plLabels[project.platform as keyof typeof plLabels] ?? project.platform}</span>
          <span>•</span>
          <span>{project.duration}s</span>
          <span>•</span>
          <span>{format(new Date(project.createdAt), 'MMM d, yyyy h:mm a')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-11 sm:ml-0">
        <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Re-generate
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Download
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive gap-1.5">
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
