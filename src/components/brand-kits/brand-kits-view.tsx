'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandKitCard } from './brand-kit-card';
import { BrandKitForm } from './brand-kit-form';
import { PlusCircle, Palette } from 'lucide-react';
import type { BrandKit, ApiResponse } from '@/lib/frontend-types';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion } from 'framer-motion';

export function BrandKitsView() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editKit, setEditKit] = useState<BrandKit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['brand-kits'],
    queryFn: () => fetch('/api/brand-kits').then(r => r.json()) as Promise<ApiResponse<BrandKit[]>>,
  });

  const brandKits = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/brand-kits/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({ title: 'Brand kit deleted' });
      setDeleteId(null);
    },
  });

  const handleEdit = (kit: BrandKit) => {
    setEditKit(kit);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditKit(null);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditKit(null);
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Brand Kits</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your brand colors, fonts, and watermarks
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          New Brand Kit
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : brandKits.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Palette className="w-8 h-8 text-muted-foreground" />
          </div>
          <h4 className="font-medium mb-1">No brand kits yet</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create a brand kit to quickly apply your branding to videos
          </p>
          <Button onClick={handleCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Brand Kit
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {brandKits.map((kit) => (
            <BrandKitCard
              key={kit.id}
              brandKit={kit}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </motion.div>
      )}

      {/* Brand Kit Form Dialog */}
      <BrandKitForm
        open={formOpen}
        onClose={handleCloseForm}
        editKit={editKit}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand Kit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this brand kit? This action cannot be undone.
              Projects using this kit will keep their current branding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
