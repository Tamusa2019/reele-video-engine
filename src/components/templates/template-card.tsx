'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Globe, GraduationCap, ShoppingBag, BarChart3, MessageSquareQuote, Building2, Plane, FlaskConical } from 'lucide-react';
import type { Template, TEMPLATE_TYPE_GRADIENTS } from '@/lib/frontend-types';
import { TEMPLATE_TYPE_GRADIENTS as gradients } from '@/lib/frontend-types';

interface TemplateCardProps {
  template: Template;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onUseTemplate: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  educational: <GraduationCap className="w-6 h-6" />,
  product_promo: <ShoppingBag className="w-6 h-6" />,
  data_viz: <BarChart3 className="w-6 h-6" />,
  testimonial: <MessageSquareQuote className="w-6 h-6" />,
  corporate: <Building2 className="w-6 h-6" />,
  travel: <Plane className="w-6 h-6" />,
  chemistry: <FlaskConical className="w-6 h-6" />,
};

export function TemplateCard({ template, isSelected, onSelect, onUseTemplate }: TemplateCardProps) {
  const gradient = gradients[template.type] ?? 'from-gray-400 to-gray-600';

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 transition-all group ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/30'
      }`}
    >
      {/* Template Preview */}
      <div
        className="h-32 bg-gradient-to-br cursor-pointer flex items-center justify-center relative"
        onClick={() => onSelect(template.id)}
        style={{ background: `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))` }}
      >
        <div className={`h-32 bg-gradient-to-br ${gradient} flex items-center justify-center relative w-full`}>
          <div className="text-white/90">
            {TYPE_ICONS[template.type] ?? <GraduationCap className="w-6 h-6" />}
          </div>

          {isSelected && (
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-4 h-4 text-primary-foreground" />
            </div>
          )}

          {template.supportsRtl && (
            <div className="absolute top-2 left-2">
              <Badge className="bg-white/20 text-white border-0 text-xs">
                <Globe className="w-3 h-3 mr-1" />
                RTL
              </Badge>
            </div>
          )}
        </div>
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
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onUseTemplate(template.id);
          }}
        >
          Use Template
        </Button>
      </div>
    </div>
  );
}
