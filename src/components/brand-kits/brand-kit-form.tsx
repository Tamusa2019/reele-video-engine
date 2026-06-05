'use client';

import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { BrandKit } from '@/lib/frontend-types';

interface BrandKitFormProps {
  open: boolean;
  onClose: () => void;
  editKit?: BrandKit | null;
}

interface BrandKitFormData {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  watermarkPosition: string;
}

const FONT_FAMILIES = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Playfair Display', 'Cairo', 'Tajawal'];
const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

export function BrandKitForm({ open, onClose, editKit }: BrandKitFormProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BrandKitFormData>({
    defaultValues: {
      name: editKit?.name ?? '',
      primaryColor: editKit?.primaryColor ?? '#1A2B5F',
      secondaryColor: editKit?.secondaryColor ?? '#FFFFFF',
      accentColor: editKit?.accentColor ?? '#FF6B35',
      fontFamily: editKit?.fontFamily ?? 'Inter',
      watermarkPosition: editKit?.watermarkPosition ?? 'bottom-right',
    },
  });

  const primaryColor = watch('primaryColor');
  const secondaryColor = watch('secondaryColor');
  const accentColor = watch('accentColor');
  const fontFamily = watch('fontFamily');
  const watermarkPosition = watch('watermarkPosition');

  const createMutation = useMutation({
    mutationFn: async (data: BrandKitFormData) => {
      const url = editKit ? `/api/brand-kits/${editKit.id}` : '/api/brand-kits';
      const method = editKit ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to save brand kit');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      reset();
      onClose();
    },
  });

  const onSubmit = (data: BrandKitFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editKit ? 'Edit Brand Kit' : 'Create Brand Kit'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Brand"
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Primary</Label>
              <div className="flex flex-col gap-1">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value)}
                  className="w-full h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Secondary</Label>
              <div className="flex flex-col gap-1">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="w-full h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={secondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accent</Label>
              <div className="flex flex-col gap-1">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setValue('accentColor', e.target.value)}
                  className="w-full h-10 rounded-lg border border-border cursor-pointer"
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
          <div className="flex gap-1 p-2 rounded-lg bg-muted">
            <div className="flex-1 h-6 rounded" style={{ backgroundColor: primaryColor }} />
            <div className="flex-1 h-6 rounded" style={{ backgroundColor: secondaryColor }} />
            <div className="flex-1 h-6 rounded" style={{ backgroundColor: accentColor }} />
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <Label>Font Family</Label>
            <Select value={fontFamily} onValueChange={(val) => setValue('fontFamily', val)}>
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

          {/* Watermark Position */}
          <div className="space-y-2">
            <Label>Watermark Position</Label>
            <Select value={watermarkPosition} onValueChange={(val) => setValue('watermarkPosition', val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WATERMARK_POSITIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos.replace('-', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editKit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
