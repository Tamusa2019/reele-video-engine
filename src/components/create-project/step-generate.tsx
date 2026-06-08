'use client';

import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Coins, Loader2, CheckCircle2, XCircle, Sparkles, Clock } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import type { ProjectFormData } from './create-project-view';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLATFORM_LABELS } from '@/lib/frontend-types';

interface GenerateStep {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export function StepGenerate() {
  const { watch } = useFormContext<ProjectFormData>();
  const { selectProject, setView } = useAppStore();
  const [steps, setSteps] = useState<GenerateStep[]>([
    { label: 'Generating content...', status: 'pending' },
    { label: 'Creating scenes...', status: 'pending' },
    { label: 'Generating images...', status: 'pending' },
    { label: 'Creating voiceover & subtitles...', status: 'pending' },
    { label: 'Finalizing video...', status: 'pending' },
  ]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

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

  // Elapsed time counter
  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Progressively advance steps based on elapsed time (realistic estimates)
  // But always wait for the actual API response to mark completion
  useEffect(() => {
    if (!startTime || isComplete || hasError) return;

    // Estimated times for each step (in seconds)
    const stepDurations = [8, 12, 20, 25, 30]; // cumulative times when each step should start
    const timers: ReturnType<typeof setTimeout>[] = [];

    stepDurations.forEach((cumTime, index) => {
      const timer = setTimeout(() => {
        setSteps(prev => {
          const updated = [...prev];
          // Mark current and all previous steps
          for (let i = 0; i <= index; i++) {
            if (i < index) {
              updated[i] = { ...updated[i], status: 'completed' };
            } else {
              updated[i] = { ...updated[i], status: 'active' };
            }
          }
          return updated;
        });
      }, cumTime * 1000);
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, [startTime, isComplete, hasError]);

  const handleSuccess = useCallback((data: { data?: { project?: { id: string } } }) => {
    const projectId = data?.data?.project?.id;
    setGeneratedProjectId(projectId || null);
    setIsComplete(true);
    setStartTime(null);
    // Mark all steps as completed
    setSteps(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
  }, []);

  const handleError = useCallback((error: Error) => {
    setHasError(true);
    setErrorMessage(error.message || 'Something went wrong');
    setStartTime(null);
    setSteps(prev =>
      prev.map(s =>
        s.status === 'active' ? { ...s, status: 'error' as const } : s
      )
    );
  }, []);

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
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const handleGenerate = () => {
    setHasError(false);
    setIsComplete(false);
    setErrorMessage('');
    setElapsed(0);
    setGeneratedProjectId(null);
    setSteps([
      { label: 'Generating content...', status: 'active' },
      { label: 'Creating scenes...', status: 'pending' },
      { label: 'Generating images...', status: 'pending' },
      { label: 'Creating voiceover & subtitles...', status: 'pending' },
      { label: 'Finalizing video...', status: 'pending' },
    ]);
    setStartTime(Date.now());
    generateMutation.mutate();
  };

  const handleViewProject = () => {
    if (generatedProjectId) {
      selectProject(generatedProjectId);
    } else {
      setView('history');
    }
  };

  const handleRetry = () => {
    handleGenerate();
  };

  const isGenerating = generateMutation.isPending;

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

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
            {/* Elapsed Time */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Clock className="w-4 h-4" />
                <span>Elapsed: {formatElapsed(elapsed)}</span>
                <span className="text-xs">(usually takes 30-60s)</span>
              </div>
            )}

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
                  <p className="text-sm text-muted-foreground mb-1">
                    Your video has been successfully generated
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Completed in {formatElapsed(elapsed)}
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
                    {errorMessage || 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button onClick={handleRetry} variant="outline">
                      Retry
                    </Button>
                    <Button onClick={() => setView('history')} variant="ghost">
                      View History
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
