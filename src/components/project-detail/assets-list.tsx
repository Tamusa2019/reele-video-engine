'use client';

import type { Asset } from '@/lib/frontend-types';
import { Button } from '@/components/ui/button';
import { Download, Image, FileAudio, FileText, Music, FileImage } from 'lucide-react';

interface AssetsListProps {
  assets: Asset[];
}

const ASSET_ICONS: Record<string, React.ReactNode> = {
  image: <Image className="w-5 h-5" alt="" />,
  voiceover: <FileAudio className="w-5 h-5" />,
  subtitle: <FileText className="w-5 h-5" />,
  music: <Music className="w-5 h-5" />,
  thumbnail: <FileImage className="w-5 h-5" />,
};

const ASSET_COLORS: Record<string, string> = {
  image: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
  voiceover: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
  subtitle: 'text-green-600 bg-green-50 dark:bg-green-950/30',
  music: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30',
  thumbnail: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30',
};

export function AssetsList({ assets }: AssetsListProps) {
  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No assets generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${ASSET_COLORS[asset.type] ?? 'text-gray-600 bg-gray-50'}`}>
              {ASSET_ICONS[asset.type] ?? <FileText className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {asset.fileName ?? `${asset.type}-${asset.id.slice(0, 8)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {asset.type} {asset.mimeType && `• ${asset.mimeType}`}
                {asset.fileSize && ` • ${(asset.fileSize / 1024).toFixed(1)}KB`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <a href={asset.url} download={asset.fileName ?? undefined} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}
