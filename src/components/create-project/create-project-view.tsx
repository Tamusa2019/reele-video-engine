'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import { StepContent } from './step-content';
import { StepBranding } from './step-branding';
import { StepTemplate } from './step-template';
import { StepGenerate } from './step-generate';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const createProjectSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500, 'Topic too long'),
  audience: z.string().min(1, 'Audience is required').max(200, 'Audience too long'),
  platform: z.enum(['facebook_reels', 'instagram_reels', 'tiktok', 'youtube_shorts'], {
    required_error: 'Platform is required',
  }),
  language: z.enum(['en', 'ar']).default('en'),
  duration: z.number().min(15).max(60).default(30),
  cta: z.string().max(200).optional(),
  brandKitMode: z.enum(['custom', 'kit']).default('custom'),
  brandKitId: z.string().optional(),
  templateId: z.string().optional(),
  primaryColor: z.string().default('#1A2B5F'),
  secondaryColor: z.string().default('#FFFFFF'),
  accentColor: z.string().default('#FF6B35'),
  fontFamily: z.string().default('Inter'),
  watermarkEnabled: z.boolean().default(false),
});

export type ProjectFormData = z.infer<typeof createProjectSchema>;

const STEPS = [
  { id: 1, label: 'Content', icon: '✏️' },
  { id: 2, label: 'Branding', icon: '🎨' },
  { id: 3, label: 'Template', icon: '🎬' },
  { id: 4, label: 'Generate', icon: '🚀' },
];

export function CreateProjectView() {
  const [currentStep, setCurrentStep] = useState(1);

  const methods = useForm<ProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      topic: '',
      audience: '',
      platform: 'instagram_reels',
      language: 'en',
      duration: 30,
      cta: '',
      brandKitMode: 'custom',
      brandKitId: '',
      templateId: '',
      primaryColor: '#1A2B5F',
      secondaryColor: '#FFFFFF',
      accentColor: '#FF6B35',
      fontFamily: 'Inter',
      watermarkEnabled: false,
    },
    mode: 'onChange',
  });

  const { trigger } = methods;

  const validateStep = async (step: number): Promise<boolean> => {
    switch (step) {
      case 1:
        return await trigger(['topic', 'audience', 'platform']);
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepContent />;
      case 2:
        return <StepBranding />;
      case 3:
        return <StepTemplate />;
      case 4:
        return <StepGenerate />;
      default:
        return <StepContent />;
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => {
                  if (step.id < currentStep) setCurrentStep(step.id);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentStep === step.id
                    ? 'bg-primary text-primary-foreground'
                    : step.id < currentStep
                    ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <span className="text-lg">{step.icon}</span>
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 bg-border">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: step.id < currentStep ? '100%' : '0%' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <FormProvider {...methods}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            {currentStep < 4 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrev}
                  disabled={currentStep === 1}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                >
                  {currentStep === 3 ? (
                    <>
                      <Rocket className="w-4 h-4" />
                      Review & Generate
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}
