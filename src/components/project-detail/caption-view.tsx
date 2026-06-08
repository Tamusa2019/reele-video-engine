'use client';

import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface CaptionViewProps {
  caption: string | null;
  hashtags: string | null;
}

export function CaptionView({ caption, hashtags }: CaptionViewProps) {
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const parsedHashtags = hashtags ? (() => {
    try {
      const parsed = JSON.parse(hashtags);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  })() : [];

  const fullCaption = caption
    ? `${caption}\n\n${parsedHashtags.join(' ')}`
    : parsedHashtags.join(' ');

  const copyToClipboard = async (text: string, type: 'caption' | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'caption') {
        setCopiedCaption(true);
        setTimeout(() => setCopiedCaption(false), 2000);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  if (!caption && parsedHashtags.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No caption generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Caption */}
      {caption && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Caption</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(caption, 'caption')}
              className="gap-1.5 text-xs"
            >
              {copiedCaption ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCaption ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <p className="text-sm leading-relaxed p-4 rounded-lg bg-muted">{caption}</p>
        </div>
      )}

      {/* Hashtags */}
      {parsedHashtags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Hashtags</h4>
          <div className="flex flex-wrap gap-2">
            {parsedHashtags.map((tag: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Copy All */}
      <Button
        variant="outline"
        onClick={() => copyToClipboard(fullCaption, 'all')}
        className="w-full gap-2"
      >
        {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copiedAll ? 'Copied!' : 'Copy Caption & Hashtags'}
      </Button>
    </div>
  );
}
