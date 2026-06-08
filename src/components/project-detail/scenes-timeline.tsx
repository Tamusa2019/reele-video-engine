'use client';

import type { Scene, SCENE_COLORS } from '@/lib/frontend-types';
import { SCENE_COLORS as sceneColors } from '@/lib/frontend-types';
import { Badge } from '@/components/ui/badge';

interface ScenesTimelineProps {
  scenes: Scene[];
}

const SCENE_TYPE_LABELS: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problem',
  solution: 'Solution',
  proof: 'Proof',
  cta: 'CTA',
  transition: 'Transition',
};

export function ScenesTimeline({ scenes }: ScenesTimelineProps) {
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No scenes generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Timeline bar */}
      <div className="flex gap-0.5 h-3 rounded-lg overflow-hidden mb-4">
        {scenes.map((scene) => {
          const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
          const width = (scene.duration / totalDuration) * 100;
          const colorMap: Record<string, string> = {
            hook: 'bg-orange-500',
            problem: 'bg-red-500',
            solution: 'bg-green-500',
            proof: 'bg-blue-500',
            cta: 'bg-purple-500',
            transition: 'bg-gray-400',
          };
          return (
            <div
              key={scene.id}
              className={`${colorMap[scene.type] ?? 'bg-gray-400'} transition-all`}
              style={{ width: `${width}%` }}
              title={`${SCENE_TYPE_LABELS[scene.type] ?? scene.type}: ${scene.start.toFixed(1)}s - ${scene.end.toFixed(1)}s`}
            />
          );
        })}
      </div>

      {/* Scene cards */}
      <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            className={`border-l-4 p-4 rounded-r-lg ${sceneColors[scene.type as keyof typeof sceneColors] ?? ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    Scene {index + 1}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {SCENE_TYPE_LABELS[scene.type] ?? scene.type}
                  </Badge>
                </div>
                <p className="text-sm">{scene.text}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {scene.start.toFixed(1)}s - {scene.end.toFixed(1)}s ({scene.duration.toFixed(1)}s)
                </p>
              </div>
              {scene.imageUrl && (
                <div className="w-16 h-16 rounded-md overflow-hidden shrink-0">
                  <img
                    src={scene.imageUrl}
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
