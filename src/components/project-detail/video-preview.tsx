'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, ImageIcon, Film, Clock, Download, RefreshCw } from 'lucide-react';
import type { Project } from '@/lib/frontend-types';
import { useState, useEffect, useCallback } from 'react';

interface VideoPreviewProps {
  project: Project;
  onReRender?: () => void;
}

export function VideoPreview({ project, onReRender }: VideoPreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [checkingVideo, setCheckingVideo] = useState(false);

  const scenes = project.scenes ?? [];
  const imageScenes = scenes.filter(s => s.imageUrl);

  // Check if the video file actually exists (HEAD request)
  const checkVideoAvailability = useCallback(() => {
    if (project.videoUrl && project.status === 'completed') {
      setCheckingVideo(true);
      fetch(project.videoUrl, { method: 'HEAD' })
        .then(res => setVideoAvailable(res.ok))
        .catch(() => setVideoAvailable(false))
        .finally(() => setCheckingVideo(false));
    }
  }, [project.videoUrl, project.status]);

  useEffect(() => {
    checkVideoAvailability();
  }, [checkVideoAvailability]);

  // If there's a real playable video file, show the video player
  if (videoAvailable && project.videoUrl) {
    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="relative">
            <video
              controls
              className="w-full max-h-[400px] object-contain bg-black"
              poster={project.thumbnailUrl ?? undefined}
            >
              <source src={project.videoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
          {/* Download button */}
          <div className="p-2 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-accent shrink-0" />
              <span className="text-xs text-muted-foreground">
                MP4 video rendered successfully
              </span>
            </div>
            <a
              href={project.videoUrl}
              download
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show scene-based preview (thumbnail + scene grid)
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="relative aspect-[9/16] max-h-[500px] bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center mx-auto overflow-hidden">
          {/* Thumbnail / First scene image as background */}
          {project.thumbnailUrl || imageScenes.length > 0 ? (
            <img
              src={project.thumbnailUrl || imageScenes[0]?.imageUrl || ''}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          ) : null}

          {/* Overlay with project info */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-4">
            <div className="space-y-2">
              <h3 className="text-white font-semibold text-sm line-clamp-2">
                {project.title}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {project.platform?.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className="text-xs text-white border-white/30">
                  <Clock className="w-3 h-3 mr-1" />
                  {project.duration}s
                </Badge>
              </div>
            </div>
          </div>

          {/* Play button overlay - click to expand scene preview */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="absolute inset-0 flex items-center justify-center group"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </button>

          {/* Status indicator for non-completed projects */}
          {project.status !== 'completed' && (
            <div className="absolute top-3 right-3">
              <Badge
                className={`text-xs ${
                  project.status === 'generating'
                    ? 'bg-yellow-500/80 text-white'
                    : project.status === 'rendering'
                    ? 'bg-blue-500/80 text-white'
                    : project.status === 'failed'
                    ? 'bg-red-500/80 text-white'
                    : 'bg-gray-500/80 text-white'
                }`}
              >
                {project.status}
              </Badge>
            </div>
          )}
        </div>

        {/* Scene Preview Grid - expandable */}
        {showPreview && scenes.length > 0 && (
          <div className="p-3 border-t bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Scene Preview ({scenes.length} scenes, {imageScenes.length} with images)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {scenes.map((scene, i) => (
                <div
                  key={scene.id || i}
                  className="aspect-[9/16] rounded-md overflow-hidden relative group"
                >
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${i + 1}: ${scene.text?.substring(0, 20)}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[9px] text-white font-mono">
                      {scene.start.toFixed(0)}s-{scene.end.toFixed(0)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed status - different messages based on video availability */}
        {project.status === 'completed' && (
          <div className="p-3 border-t bg-accent/5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {checkingVideo
                    ? 'Checking video...'
                    : videoAvailable
                      ? 'Video rendered and ready to play'
                      : 'All content generated. Video is being processed or needs to be re-rendered.'
                  }
                </span>
              </div>
              {!videoAvailable && !checkingVideo && onReRender && (
                <button
                  onClick={onReRender}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-render
                </button>
              )}
            </div>
          </div>
        )}

        {/* Generating overlay */}
        {project.status === 'generating' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex flex-col items-center text-white">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm">Generating...</p>
            </div>
          </div>
        )}

        {/* Rendering overlay */}
        {project.status === 'rendering' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex flex-col items-center text-white">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm">Rendering video with Remotion...</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
