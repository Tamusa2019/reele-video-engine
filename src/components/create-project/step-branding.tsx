'use client';

import { useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Upload, Palette } from 'lucide-react';
import type { ProjectFormData } from './create-project-view';
import type { BrandKit, ApiResponse } from '@/lib/frontend-types';

const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Poppins',
  'Montserrat',
  'Open Sans',
  'Playfair Display',
  'Cairo',
  'Tajawal',
];

export function StepBranding() {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<ProjectFormData>();

  const brandKitMode = watch('brandKitMode') ?? 'custom';
  const brandKitId = watch('brandKitId');
  const primaryColor = watch('primaryColor') ?? '#1A2B5F';
  const secondaryColor = watch('secondaryColor') ?? '#FFFFFF';
  const accentColor = watch('accentColor') ?? '#FF6B35';
  const fontFamily = watch('fontFamily') ?? 'Inter';
  const watermarkEnabled = watch('watermarkEnabled') ?? false;

  const { data: brandKitsData } = useQuery({
    queryKey: ['brand-kits'],
    queryFn: () => fetch('/api/brand-kits').then(r => r.json()) as Promise<ApiResponse<BrandKit[]>>,
  });

  const brandKits = brandKitsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Branding</h3>
        <p className="text-sm text-muted-foreground">
          Customize the look and feel of your video
        </p>
      </div>

      {/* Brand Kit Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Brand Kit</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setValue('brandKitMode', 'custom')}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              brandKitMode === 'custom'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <Palette className="w-5 h-5 mb-2" />
            <p className="text-sm font-medium">Custom</p>
            <p className="text-xs text-muted-foreground">Set colors manually</p>
          </button>
          <button
            type="button"
            onClick={() => setValue('brandKitMode', 'kit')}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              brandKitMode === 'kit'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <Palette className="w-5 h-5 mb-2" />
            <p className="text-sm font-medium">Saved Kit</p>
            <p className="text-xs text-muted-foreground">Use a brand kit</p>
          </button>
        </div>
      </div>

      {brandKitMode === 'kit' ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select Brand Kit</Label>
          {brandKits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No brand kits yet. Create one in the Brand Kits section.
            </p>
          ) : (
            <Select
              value={brandKitId ?? ''}
              onValueChange={(val) => {
                const kit = brandKits.find((k) => k.id === val);
                if (kit) {
                  setValue('brandKitId', kit.id);
                  setValue('primaryColor', kit.primaryColor);
                  setValue('secondaryColor', kit.secondaryColor);
                  setValue('accentColor', kit.accentColor);
                  setValue('fontFamily', kit.fontFamily);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a brand kit" />
              </SelectTrigger>
              <SelectContent>
                {brandKits.map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: kit.primaryColor }} />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: kit.accentColor }} />
                      </div>
                      {kit.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <>
          {/* Color Pickers */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Primary</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Secondary</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Accent</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setValue('accentColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setValue('accentColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Color Preview */}
          <div className="flex gap-1 p-3 rounded-lg bg-muted">
            <div className="flex-1 h-8 rounded" style={{ backgroundColor: primaryColor }} />
            <div className="flex-1 h-8 rounded" style={{ backgroundColor: secondaryColor }} />
            <div className="flex-1 h-8 rounded" style={{ backgroundColor: accentColor }} />
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Font Family</Label>
            <Select
              value={fontFamily}
              onValueChange={(val) => setValue('fontFamily', val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((font) => (
                  <SelectItem key={font} value={font}>
                    <span style={{ fontFamily: font }}>{font}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Logo Upload</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag & drop your logo or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, SVG (max 2MB)
              </p>
            </div>
          </div>

          {/* Watermark Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Watermark</Label>
              <p className="text-xs text-muted-foreground">Add a watermark to your video</p>
            </div>
            <Switch
              checked={watermarkEnabled}
              onCheckedChange={(checked) => setValue('watermarkEnabled', checked)}
            />
          </div>
        </>
      )}
    </div>
  );
}
