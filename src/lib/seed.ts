// =============================================================================
// Seed Templates - Default templates for the Reele Video Engine
// =============================================================================

import { db } from '@/lib/db';

interface TemplateSeed {
  name: string;
  type: string;
  description: string;
  thumbnailUrl: string | null;
  config: Record<string, unknown>;
  supportsRtl: boolean;
  isActive: boolean;
}

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Educational Explainer',
    type: 'educational',
    description: 'Perfect for teaching concepts, tutorials, and how-to content. Features clean layouts with step-by-step visuals.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'gradient',
      backgroundGradient: { from: '#1A2B5F', to: '#2D4A8C' },
      textAnimation: 'typewriter',
      transitionStyle: 'fade',
      sceneLayout: 'centered',
      iconStyle: 'outline',
      progressBarEnabled: true,
      stepCounterEnabled: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Product Showcase',
    type: 'product_promo',
    description: 'Designed for product launches, features, and promotions. Bold visuals with call-to-action emphasis.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'solid',
      backgroundColor: '#FFFFFF',
      textAnimation: 'slideUp',
      transitionStyle: 'slide',
      sceneLayout: 'split',
      iconStyle: 'filled',
      ctaButtonStyle: 'rounded',
      priceTagEnabled: true,
      productFrameEnabled: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Data Visualization',
    type: 'data_viz',
    description: 'Great for statistics, comparisons, and data-driven stories. Animated charts and bold numbers.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'dark',
      backgroundColor: '#0F172A',
      textAnimation: 'zoomIn',
      transitionStyle: 'morph',
      sceneLayout: 'data-focused',
      iconStyle: 'minimal',
      chartAnimationsEnabled: true,
      counterAnimationsEnabled: true,
      comparisonLayoutEnabled: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Customer Testimonial',
    type: 'testimonial',
    description: 'Build trust with customer stories and reviews. Features quote styling and social proof elements.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'warm',
      backgroundGradient: { from: '#FEF3C7', to: '#FDE68A' },
      textAnimation: 'fadeIn',
      transitionStyle: 'crossfade',
      sceneLayout: 'quote-centered',
      iconStyle: 'emoji',
      starRatingEnabled: true,
      avatarFrameEnabled: true,
      quoteMarksEnabled: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Corporate Professional',
    type: 'corporate',
    description: 'Clean, professional design for business content, company updates, and B2B communications.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'minimal',
      backgroundColor: '#F8FAFC',
      textAnimation: 'slideUp',
      transitionStyle: 'wipe',
      sceneLayout: 'professional',
      iconStyle: 'corporate',
      logoPlacement: 'top-right',
      footerBrandingEnabled: true,
      corporateColorsEnabled: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Travel Adventure',
    type: 'travel',
    description: 'Dynamic, immersive design for travel content, destination features, and adventure stories.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'cinematic',
      backgroundOverlay: 'dark-gradient',
      textAnimation: 'bounceIn',
      transitionStyle: 'zoom',
      sceneLayout: 'full-bleed',
      iconStyle: 'travel',
      locationTagEnabled: true,
      mapOverlayEnabled: true,
      droneViewTransition: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Chemistry Science',
    type: 'chemistry',
    description: 'Scientific design for chemistry, science experiments, and educational science content.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'dark-lab',
      backgroundGradient: { from: '#1E293B', to: '#0F172A' },
      textAnimation: 'fadeIn',
      transitionStyle: 'molecular',
      sceneLayout: 'lab-style',
      iconStyle: 'scientific',
      formulaDisplayEnabled: true,
      elementAnimationEnabled: true,
      reactionAnimationEnabled: true,
      periodicTableTheme: true,
    },
    supportsRtl: false,
    isActive: true,
  },
  {
    name: 'Arabic Educational',
    type: 'educational',
    description: 'RTL-optimized educational template for Arabic content. Features right-to-left text flow and Arabic-optimized typography.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'gradient',
      backgroundGradient: { from: '#1A2B5F', to: '#2D4A8C' },
      textAnimation: 'slideRight',
      transitionStyle: 'slide-reverse',
      sceneLayout: 'rtl-centered',
      iconStyle: 'outline',
      direction: 'rtl',
      fontFamily: 'Cairo',
      textAlign: 'right',
      progressBarEnabled: true,
    },
    supportsRtl: true,
    isActive: true,
  },
  {
    name: 'Arabic Product Promo',
    type: 'product_promo',
    description: 'RTL-optimized product showcase for Arabic markets. Bold visuals with right-to-left call-to-action.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'solid',
      backgroundColor: '#FFFFFF',
      textAnimation: 'slideRight',
      transitionStyle: 'slide-reverse',
      sceneLayout: 'rtl-split',
      iconStyle: 'filled',
      direction: 'rtl',
      fontFamily: 'Tajawal',
      textAlign: 'right',
      ctaButtonStyle: 'rounded',
      priceTagEnabled: true,
    },
    supportsRtl: true,
    isActive: true,
  },
  {
    name: 'Minimalist Quote',
    type: 'testimonial',
    description: 'Ultra-clean design focused on typography and powerful quotes. Perfect for motivational content.',
    thumbnailUrl: null,
    config: {
      backgroundStyle: 'minimal',
      backgroundColor: '#FFFFFF',
      textAnimation: 'typewriter',
      transitionStyle: 'fade',
      sceneLayout: 'quote-minimal',
      iconStyle: 'none',
      largeQuoteMarks: true,
      serifFont: true,
      minimalDecorations: true,
    },
    supportsRtl: false,
    isActive: true,
  },
];

/**
 * Seed the database with default templates
 * Safe to call multiple times - checks for existing templates first
 */
export async function seedTemplates(): Promise<void> {
  console.log('[Seed] Starting template seeding...');

  try {
    // Check if templates already exist
    const existingCount = await db.template.count();

    if (existingCount > 0) {
      console.log(`[Seed] ${existingCount} templates already exist, skipping seed.`);
      return;
    }

    // Create all templates
    for (const template of TEMPLATES) {
      await db.template.create({
        data: {
          name: template.name,
          type: template.type,
          description: template.description,
          thumbnailUrl: template.thumbnailUrl,
          config: JSON.stringify(template.config),
          supportsRtl: template.supportsRtl,
          isActive: template.isActive,
        },
      });
    }

    console.log(`[Seed] Successfully seeded ${TEMPLATES.length} templates.`);
  } catch (error) {
    console.error('[Seed] Failed to seed templates:', error);
    throw error;
  }
}

/**
 * Seed a default user for development
 */
export async function seedDefaultUser(): Promise<void> {
  console.log('[Seed] Starting default user seeding...');

  try {
    const existingUser = await db.user.findUnique({
      where: { email: 'demo@reele.app' },
    });

    if (existingUser) {
      console.log('[Seed] Default user already exists, skipping.');
      return;
    }

    await db.user.create({
      data: {
        email: 'demo@reele.app',
        name: 'Demo User',
        role: 'user',
        credits: 50,
        plan: 'pro',
      },
    });

    console.log('[Seed] Default user created: demo@reele.app');
  } catch (error) {
    console.error('[Seed] Failed to seed default user:', error);
    throw error;
  }
}

/**
 * Run all seed functions
 */
export async function seedAll(): Promise<void> {
  console.log('[Seed] Running all seed functions...');
  await seedDefaultUser();
  await seedTemplates();
  console.log('[Seed] All seeding completed.');
}
