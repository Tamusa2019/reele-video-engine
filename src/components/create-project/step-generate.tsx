'use client';

import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Coins, Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import type { ProjectFormData } from './create-project-view';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLATFORM_LABELS } from '@/lib/frontend-types';

interface GenerateStep {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export function StepGenerate() {
  const { watch, reset } = useFormContext<ProjectFormData>();
  const { selectProject, setView } = useAppStore();
  const [steps, setSteps] = useState<GenerateStep[]>([
    { label: 'Generating content...', status: 'pending' },
    { label: 'Creating scenes...', status: 'pending' },
    { label: 'Generating images...', status: 'pending' },
    { label: 'Creating voiceover...', status: 'pending' },
    { label: 'Rendering video...', status: 'pending' },
  ]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);

  const topic = watch('topic');
  const audience = watch('audience');
  const platform = watch('platform');
  const language = watch('language');
  const duration = watch('duration');
  const cta = watch('cta');
  const primaryColor = watch('primaryColor');
  const accentColor = watch('accentColor');
  const fontFamily = watch('fontFamily');
  const brandKitId = watch('brandKitId');
  const templateId = watch('templateId');

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          audience,
          platform,
          language,
          duration,
          cta: cta || undefined,
          brandKitId: brandKitId || undefined,
          templateId: templateId || undefined,
          primaryColor: primaryColor || '#1A2B5F',
          secondaryColor: '#FFFFFF',
          accentColor: accentColor || '#FF6B35',
          fontFamily: fontFamily || 'Inter',
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Video generation failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      const projectId = data?.data?.project?.id;
      setGeneratedProjectId(projectId);
      setIsComplete(true);
    },
    onError: () => {
      setHasError(true);
      setSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' ? { ...s, status: 'error' } : s
        )
      );
    },
  });

  // Simulate step progression during generation
  useEffect(() => {
    if (!generateMutation.isPending) return;

    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    const stepDurations = [3000, 2000, 4000, 3000, 5000];

    stepDurations.forEach((duration, index) => {
      const timer = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) => {
            if (i === index) return { ...s, status: 'active' };
            if (i < index) return { ...s, status: 'completed' };
            return s;
          })
        );
      }, stepDurations.slice(0, index).reduce((a, b) => a + b, 0));
      stepTimers.push(timer);
    });

    return () => stepTimers.forEach(clearTimeout);
  }, [generateMutation.isPending]);

  const handleGenerate = () => {
    setHasError(false);
    setIsComplete(false);
    setSteps([
      { label: 'Generating content...', status: 'pending' },
      { label: 'Creating scenes...', status: 'pending' },
      { label: 'Generating images...', status: 'pending' },
      { label: 'Creating voiceover...', status: 'pending' },
      { label: 'Rendering video...', status: 'pending' },
    ]);
    generateMutation.mutate();
  };

  const handleViewProject = () => {
    if (generatedProjectId) {
      selectProject(generatedProjectId);
    }
  };

  const handleRetry = () => {
    handleGenerate();
  };

  const isGenerating = generateMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Generate Video</h3>
        <p className="text-sm text-muted-foreground">
          Review your settings and generate your video
        </p>
      </div>

      {/* Summary */}
      {!isGenerating && !isComplete && !hasError && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <h4 className="font-medium">Summary</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Topic</p>
                <p className="font-medium truncate">{topic}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Audience</p>
                <p className="font-medium truncate">{audience}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Platform</p>
                <Badge variant="secondary">
                  {PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Language</p>
                <p className="font-medium">{language === 'ar' ? 'Arabic' : 'English'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{duration} seconds</p>
              </div>
              {cta && (
                <div>
                  <p className="text-muted-foreground">CTA</p>
                  <p className="font-medium truncate">{cta}</p>
                </div>
              )}
              {primaryColor && (
                <div>
                  <p className="text-muted-foreground">Primary Color</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded border border-border"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <span className="font-mono text-xs">{primaryColor}</span>
                  </div>
                </div>
              )}
              {templateId && (
                <div>
                  <p className="text-muted-foreground">Template</p>
                  <Badge variant="secondary">Selected</Badge>
                </div>
              )}
            </div>

            <Separator />

            {/* Credits Cost */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-accent" />
                <span className="font-medium">Estimated Cost</span>
              </div>
              <span className="text-lg font-bold text-accent">10 credits</span>
            </div>

            <Button
              onClick={handleGenerate}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-12"
              size="lg"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Video
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Steps */}
      {(isGenerating || isComplete || hasError) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <AnimatePresence mode="popLayout">
              {steps.map((step, index) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-3 py-2"
                >
                  {step.status === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-muted flex items-center justify-center shrink-0" />
                  )}
                  {step.status === 'active' && (
                    <Loader2 className="w-6 h-6 text-accent animate-spin shrink-0" />
                  )}
                  {step.status === 'completed' && (
                    <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                  )}
                  {step.status === 'error' && (
                    <XCircle className="w-6 h-6 text-destructive shrink-0" />
                  )}
                  <span
                    className={`text-sm ${
                      step.status === 'active'
                        ? 'font-medium text-foreground'
                        : step.status === 'completed'
                        ? 'text-muted-foreground'
                        : step.status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Completion State */}
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 pt-4 border-t"
              >
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h4 className="text-lg font-semibold mb-1">Video Generated!</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your video has been successfully generated
                  </p>
                  <Button
                    onClick={handleViewProject}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    View Project
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {hasError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 pt-4 border-t"
              >
                <div className="text-center">
                  <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
                  <h4 className="text-lg font-semibold mb-1">Generation Failed</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Something went wrong. Please try again.
                  </p>
                  <Button onClick={handleRetry} variant="outline">
                    Retry
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
