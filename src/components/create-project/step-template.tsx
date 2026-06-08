'use client';

import { useFormContext } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Globe, GraduationCap, ShoppingBag, BarChart3, MessageSquareQuote, Building2, Plane, FlaskConical } from 'lucide-react';
import type { ProjectFormData } from './create-project-view';
import type { Template, ApiResponse, TEMPLATE_TYPE_GRADIENTS } from '@/lib/frontend-types';
import { TEMPLATE_TYPE_GRADIENTS as gradients } from '@/lib/frontend-types';
import { useState } from 'react';

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

const TYPE_ICONS: Record<string, React.ReactNode> = {
  educational: <GraduationCap className="w-6 h-6" />,
  product_promo: <ShoppingBag className="w-6 h-6" />,
  data_viz: <BarChart3 className="w-6 h-6" />,
  testimonial: <MessageSquareQuote className="w-6 h-6" />,
  corporate: <Building2 className="w-6 h-6" />,
  travel: <Plane className="w-6 h-6" />,
  chemistry: <FlaskConical className="w-6 h-6" />,
};

export function StepTemplate() {
  const { setValue, watch } = useFormContext<ProjectFormData>();
  const selectedTemplateId = watch('templateId');
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['templates', filter],
    queryFn: () => {
      const params = filter !== 'all' ? `?type=${filter}` : '';
      return fetch(`/api/templates${params}`).then(r => r.json()) as Promise<ApiResponse<Template[]>>;
    },
  });

  const templates = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Choose Template</h3>
        <p className="text-sm text-muted-foreground">
          Select a template style for your video
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TEMPLATE_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setFilter(type.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No templates found for this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            const gradient = gradients[template.type] ?? 'from-gray-400 to-gray-600';

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setValue('templateId', template.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all text-left group ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                {/* Template Preview */}
                <div className={`h-32 bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
                  <div className="text-white/90">
                    {TYPE_ICONS[template.type] ?? <GraduationCap className="w-6 h-6" />}
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}

                  {/* RTL badge */}
                  {template.supportsRtl && (
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-white/20 text-white border-0 text-xs">
                        <Globe className="w-3 h-3 mr-1" />
                        RTL
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Template Info */}
                <div className="p-3 bg-card">
                  <h4 className="text-sm font-medium truncate">{template.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {template.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  {template.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
