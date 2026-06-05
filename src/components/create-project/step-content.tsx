'use client';

import { useFormContext } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Facebook, Instagram, Youtube } from 'lucide-react';
import type { ProjectFormData } from './create-project-view';
import { PLATFORM_LABELS, type Platform } from '@/lib/frontend-types';

const platforms: { value: Platform; label: string; icon: React.ReactNode }[] = [
  { value: 'facebook_reels', label: 'Facebook Reels', icon: <Facebook className="w-4 h-4" /> },
  { value: 'instagram_reels', label: 'Instagram Reels', icon: <Instagram className="w-4 h-4" /> },
  { value: 'tiktok', label: 'TikTok', icon: <div className="w-4 h-4 flex items-center justify-center font-bold text-xs">T</div> },
  { value: 'youtube_shorts', label: 'YouTube Shorts', icon: <Youtube className="w-4 h-4" /> },
];

export function StepContent() {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<ProjectFormData>();

  const duration = watch('duration') ?? 30;
  const platform = watch('platform');
  const language = watch('language');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Content Details</h3>
        <p className="text-sm text-muted-foreground">
          Tell us about the video you want to create
        </p>
      </div>

      {/* Topic */}
      <div className="space-y-2">
        <Label htmlFor="topic" className="text-sm font-medium">
          Topic <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="topic"
          placeholder="e.g., 5 benefits of drinking lemon water every morning..."
          className="min-h-[100px] resize-none"
          {...register('topic')}
        />
        {errors.topic && (
          <p className="text-xs text-destructive">{errors.topic.message}</p>
        )}
      </div>

      {/* Target Audience */}
      <div className="space-y-2">
        <Label htmlFor="audience" className="text-sm font-medium">
          Target Audience <span className="text-destructive">*</span>
        </Label>
        <Input
          id="audience"
          placeholder="e.g., Health-conscious adults aged 25-45"
          {...register('audience')}
        />
        {errors.audience && (
          <p className="text-xs text-destructive">{errors.audience.message}</p>
        )}
      </div>

      {/* Language */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Language</Label>
        <Select
          value={language}
          onValueChange={(val) => setValue('language', val as 'en' | 'ar')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ar">Arabic (RTL)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Platform */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Platform <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-3">
          {platforms.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setValue('platform', p.value)}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                platform === p.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className={`p-1.5 rounded ${platform === p.value ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {p.icon}
              </div>
              <span className="text-sm font-medium">{p.label}</span>
            </button>
          ))}
        </div>
        {errors.platform && (
          <p className="text-xs text-destructive">{errors.platform.message}</p>
        )}
      </div>

      {/* Duration */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Duration</Label>
          <Badge variant="secondary" className="font-mono">
            {duration} seconds
          </Badge>
        </div>
        <Slider
          value={[duration]}
          onValueChange={([val]) => setValue('duration', val)}
          min={15}
          max={60}
          step={5}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>15s</span>
          <span>60s</span>
        </div>
      </div>

      {/* Call to Action */}
      <div className="space-y-2">
        <Label htmlFor="cta" className="text-sm font-medium">
          Call to Action <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="cta"
          placeholder="e.g., Follow for more health tips!"
          {...register('cta')}
        />
      </div>
    </div>
  );
}
