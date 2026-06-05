'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateCard } from './template-card';
import { useAppStore } from '@/lib/store';
import type { Template, ApiResponse } from '@/lib/frontend-types';
import { motion } from 'framer-motion';

const TEMPLATE_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'educational', label: 'Educational' },
  { value: 'product_promo', label: 'Product Promo' },
  { value: 'data_viz', label: 'Data Viz' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'travel', label: 'Travel' },
  { value: 'chemistry', label: 'Chemistry' },
];

export function TemplatesView() {
  const { setView, setSelectedTemplateId } = useAppStore();
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['templates', filter],
    queryFn: () => {
      const params = filter !== 'all' ? `?type=${filter}` : '';
      return fetch(`/api/templates${params}`).then(r => r.json()) as Promise<ApiResponse<Template[]>>;
    },
  });

  const templates = data?.data ?? [];

  const handleUseTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setView('create');
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Templates</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse and select templates for your videos
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TEMPLATE_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => setFilter(type.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === type.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No templates found for this category</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedId === template.id}
              onSelect={setSelectedId}
              onUseTemplate={handleUseTemplate}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
