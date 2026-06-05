'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Palette } from 'lucide-react';
import type { BrandKit } from '@/lib/frontend-types';

interface BrandKitCardProps {
  brandKit: BrandKit;
  onEdit: (kit: BrandKit) => void;
  onDelete: (id: string) => void;
}

export function BrandKitCard({ brandKit, onEdit, onDelete }: BrandKitCardProps) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Logo or placeholder */}
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              {brandKit.logoUrl ? (
                <img
                  src={brandKit.logoUrl}
                  alt={brandKit.name}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <Palette className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <h4 className="font-medium">{brandKit.name}</h4>
              <p className="text-xs text-muted-foreground">
                {brandKit._count?.projects ?? 0} project{(brandKit._count?.projects ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(brandKit)}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(brandKit.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Color swatches */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md border border-border" style={{ backgroundColor: brandKit.primaryColor }} />
            <div className="w-8 h-8 rounded-md border border-border" style={{ backgroundColor: brandKit.secondaryColor }} />
            <div className="w-8 h-8 rounded-md border border-border" style={{ backgroundColor: brandKit.accentColor }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              {brandKit.fontFamily}
            </Badge>
            {brandKit.watermarkUrl && (
              <Badge variant="secondary" className="text-xs">
                Watermark
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Position: {brandKit.watermarkPosition.replace('-', ' ')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
