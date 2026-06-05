// =============================================================================
// Reele Video Engine - Core Types
// =============================================================================

/** Project input from user */
export interface ProjectInput {
  topic: string;
  audience: string;
  platform: 'facebook_reels' | 'instagram_reels' | 'tiktok' | 'youtube_shorts';
  language: 'en' | 'ar';
  duration: number; // seconds
  cta?: string;
  brandKitId?: string;
  templateId?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

/** Scene structure from AI */
export interface SceneData {
  start: number;
  end: number;
  type: 'hook' | 'problem' | 'solution' | 'proof' | 'cta' | 'transition';
  text: string;
  imageUrl?: string;
  animation?: Record<string, unknown>;
}

/** Full scene JSON that AI generates */
export interface SceneJSON {
  title: string;
  duration: number;
  language: string;
  platform: string;
  scenes: SceneData[];
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    logoUrl?: string;
    watermarkPosition?: string;
  };
  voiceover: {
    text: string;
    language: string;
    speed: number;
  };
  subtitles: {
    enabled: boolean;
    style: 'modern' | 'classic' | 'bold';
  };
}

/** LLM Response */
export interface LLMResponse {
  hook: string;
  script: string;
  sceneJSON: SceneJSON;
  caption: string;
  hashtags: string[];
}

/** Template config */
export interface TemplateConfig {
  id: string;
  name: string;
  type: string;
  backgroundStyle: string;
  textAnimation: string;
  transitionStyle: string;
  supportsRtl: boolean;
}

/** Remotion render configuration */
export interface RemotionConfig {
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  scenes: SceneData[];
  branding: SceneJSON['branding'];
  voiceoverUrl?: string;
  subtitleUrl?: string;
  outputFormat: 'mp4' | 'webm';
}

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Platform dimensions mapping */
export const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  facebook_reels: { width: 1080, height: 1920 },
  instagram_reels: { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
  youtube_shorts: { width: 1080, height: 1920 },
};

/** Platform max duration mapping */
export const PLATFORM_MAX_DURATION: Record<string, number> = {
  facebook_reels: 60,
  instagram_reels: 90,
  tiktok: 180,
  youtube_shorts: 60,
};

/** Default branding colors */
export const DEFAULT_BRANDING = {
  primaryColor: '#1A2B5F',
  secondaryColor: '#FFFFFF',
  accentColor: '#FF6B35',
  fontFamily: 'Inter',
  watermarkPosition: 'bottom-right',
} as const;

/** Project status type */
export type ProjectStatus = 'draft' | 'generating' | 'rendering' | 'completed' | 'failed';

/** Scene type */
export type SceneType = 'hook' | 'problem' | 'solution' | 'proof' | 'cta' | 'transition';

/** Asset type */
export type AssetType = 'image' | 'voiceover' | 'subtitle' | 'music' | 'thumbnail';

/** Language type */
export type Language = 'en' | 'ar';

/** Platform type */
export type Platform = 'facebook_reels' | 'instagram_reels' | 'tiktok' | 'youtube_shorts';
