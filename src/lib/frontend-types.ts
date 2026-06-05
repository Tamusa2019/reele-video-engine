// =============================================================================
// Frontend Types for Reele Video Engine
// =============================================================================

export type ProjectStatus = 'draft' | 'generating' | 'rendering' | 'completed' | 'failed';
export type SceneType = 'hook' | 'problem' | 'solution' | 'proof' | 'cta' | 'transition';
export type AssetType = 'image' | 'voiceover' | 'subtitle' | 'music' | 'thumbnail';
export type Platform = 'facebook_reels' | 'instagram_reels' | 'tiktok' | 'youtube_shorts';
export type Language = 'en' | 'ar';

export interface Project {
  id: string;
  title: string;
  topic: string;
  audience: string;
  platform: Platform;
  language: Language;
  duration: number;
  cta: string | null;
  status: ProjectStatus;
  sceneJson: string | null;
  scriptText: string | null;
  hookText: string | null;
  captionText: string | null;
  hashtags: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  voiceoverUrl: string | null;
  subtitleSrt: string | null;
  errorMessage: string | null;
  userId: string;
  brandKitId: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  brandKit?: BrandKit | null;
  template?: Template | null;
  scenes?: Scene[];
  assets?: Asset[];
  analytics?: VideoAnalytics | null;
  _count?: { assets: number; scenes: number };
}

export interface BrandKit {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  watermarkUrl: string | null;
  watermarkPosition: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { projects: number };
}

export interface Template {
  id: string;
  name: string;
  type: string;
  description: string | null;
  thumbnailUrl: string | null;
  config: Record<string, unknown>;
  supportsRtl: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { projects: number };
}

export interface Scene {
  id: string;
  projectId: string;
  sceneIndex: number;
  start: number;
  end: number;
  type: SceneType;
  text: string;
  imageUrl: string | null;
  animation: string | null;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface VideoAnalytics {
  id: string;
  projectId: string;
  views: number;
  likes: number;
  shares: number;
  completionRate: number;
  platformMetrics: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsData {
  period: string;
  projects: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    byPlatform: { platform: string; count: number }[];
    byStatus: { status: string; count: number }[];
  };
  credits: {
    totalUsed: number;
    byAction: { action: string; creditsUsed: number; count: number }[];
  };
  videoAnalytics: {
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    avgCompletionRate: number;
  };
  workflows: {
    failedCount: number;
    avgGenerationTimeMs: number;
  };
  recentProjects: {
    id: string;
    title: string;
    platform: string;
    status: string;
    createdAt: string;
    thumbnailUrl: string | null;
  }[];
}

export interface CreditsData {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  plan: string;
  createdAt: string;
  totalCreditsUsed: number;
  recentUsage: {
    id: string;
    action: string;
    creditsUsed: number;
    createdAt: string;
    metadata: unknown;
  }[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper types
export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook_reels: 'Facebook Reels',
  instagram_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  generating: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  rendering: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const SCENE_COLORS: Record<SceneType, string> = {
  hook: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20',
  problem: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  solution: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
  proof: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  cta: 'border-l-purple-500 bg-purple-50 dark:bg-purple-950/20',
  transition: 'border-l-gray-500 bg-gray-50 dark:bg-gray-950/20',
};

export const TEMPLATE_TYPE_GRADIENTS: Record<string, string> = {
  educational: 'from-blue-500 to-indigo-600',
  product_promo: 'from-orange-500 to-red-500',
  data_viz: 'from-cyan-500 to-blue-600',
  testimonial: 'from-yellow-400 to-orange-500',
  corporate: 'from-slate-600 to-gray-800',
  travel: 'from-emerald-400 to-teal-600',
  chemistry: 'from-purple-600 to-indigo-800',
};

export const TEMPLATE_TYPE_ICONS: Record<string, string> = {
  educational: 'GraduationCap',
  product_promo: 'ShoppingBag',
  data_viz: 'BarChart3',
  testimonial: 'MessageSquareQuote',
  corporate: 'Building2',
  travel: 'Plane',
  chemistry: 'FlaskConical',
};
