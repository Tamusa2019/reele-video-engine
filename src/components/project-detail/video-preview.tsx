'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Play } from 'lucide-react';
import type { Project } from '@/lib/frontend-types';

interface VideoPreviewProps {
  project: Project;
}

export function VideoPreview({ project }: VideoPreviewProps) {
  if (project.videoUrl) {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <video
            controls
            className="w-full max-h-[400px] object-contain bg-black"
            poster={project.thumbnailUrl ?? undefined}
          >
            <source src={project.videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="relative aspect-[9/16] max-h-[400px] bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto">
          {project.thumbnailUrl ? (
            <img
              src={project.thumbnailUrl}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Play className="w-16 h-16 mb-2" />
              <p className="text-sm">Video not yet available</p>
              <p className="text-xs">Status: {project.status}</p>
            </div>
          )}
          {project.status === 'generating' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="flex flex-col items-center text-white">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-sm">Generating...</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
