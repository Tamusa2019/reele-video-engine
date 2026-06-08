// =============================================================================
// Branding Service - Apply brand kit to scene JSON
// =============================================================================

import type { SceneJSON } from '@/lib/types';
import { DEFAULT_BRANDING } from '@/lib/types';

let brandingInstance: BrandingService | null = null;

export interface BrandKitInput {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  watermarkPosition?: string;
}

export class BrandingService {
  /**
   * Apply brand kit settings to a scene JSON
   * Merges brand kit into scene JSON while preserving scene structure
   */
  applyBranding(sceneJSON: SceneJSON, brandKit: BrandKitInput): SceneJSON {
    const branded = { ...sceneJSON };

    // Merge branding colors with defaults
    branded.branding = {
      primaryColor: brandKit.primaryColor || sceneJSON.branding.primaryColor || DEFAULT_BRANDING.primaryColor,
      secondaryColor: brandKit.secondaryColor || sceneJSON.branding.secondaryColor || DEFAULT_BRANDING.secondaryColor,
      accentColor: brandKit.accentColor || sceneJSON.branding.accentColor || DEFAULT_BRANDING.accentColor,
      fontFamily: brandKit.fontFamily || sceneJSON.branding.fontFamily || DEFAULT_BRANDING.fontFamily,
      logoUrl: brandKit.logoUrl || sceneJSON.branding.logoUrl || undefined,
      watermarkPosition: brandKit.watermarkPosition || sceneJSON.branding.watermarkPosition || DEFAULT_BRANDING.watermarkPosition,
    };

    // Validate and sanitize colors
    branded.branding.primaryColor = this.sanitizeColor(branded.branding.primaryColor);
    branded.branding.secondaryColor = this.sanitizeColor(branded.branding.secondaryColor);
    branded.branding.accentColor = this.sanitizeColor(branded.branding.accentColor);

    // Apply brand-safe color adjustments
    const adjustedColors = this.ensureBrandSafeColors({
      primary: branded.branding.primaryColor,
      secondary: branded.branding.secondaryColor,
      accent: branded.branding.accentColor,
    });

    branded.branding.primaryColor = adjustedColors.primary;
    branded.branding.secondaryColor = adjustedColors.secondary;
    branded.branding.accentColor = adjustedColors.accent;

    // Apply consistent typography
    branded.branding.fontFamily = this.sanitizeFontFamily(branded.branding.fontFamily);

    // Add watermark position if logo exists
    if (branded.branding.logoUrl) {
      branded.branding.watermarkPosition = branded.branding.watermarkPosition || 'bottom-right';
    }

    return branded;
  }

  /**
   * Sanitize a hex color value
   */
  private sanitizeColor(color: string): string {
    // Remove whitespace
    let cleaned = color.trim();

    // Add # if missing
    if (!cleaned.startsWith('#')) {
      cleaned = '#' + cleaned;
    }

    // Validate hex format
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(cleaned)) {
      console.warn(`[BrandingService] Invalid color format: ${color}, using default`);
      return DEFAULT_BRANDING.primaryColor;
    }

    // Expand 3-char hex to 6-char
    if (cleaned.length === 4) {
      cleaned = '#' + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2] + cleaned[3] + cleaned[3];
    }

    return cleaned.toUpperCase();
  }

  /**
   * Ensure colors are brand-safe (sufficient contrast, not too similar)
   */
  private ensureBrandSafeColors(colors: {
    primary: string;
    secondary: string;
    accent: string;
  }): { primary: string; secondary: string; accent: string } {
    const { primary, secondary, accent } = colors;

    // Check if primary and secondary are too similar
    const primaryLuminance = this.getLuminance(primary);
    const secondaryLuminance = this.getLuminance(secondary);
    const contrastRatio = this.getContrastRatio(primaryLuminance, secondaryLuminance);

    let adjustedSecondary = secondary;
    if (contrastRatio < 2.0) {
      // If too similar, darken or lighten the secondary
      adjustedSecondary = secondaryLuminance > 0.5 ? '#1A1A1A' : '#FFFFFF';
      console.warn(`[BrandingService] Low contrast between primary and secondary, adjusting secondary to ${adjustedSecondary}`);
    }

    // Check if accent is too similar to primary
    const accentLuminance = this.getLuminance(accent);
    const primaryAccentContrast = this.getContrastRatio(primaryLuminance, accentLuminance);

    let adjustedAccent = accent;
    if (primaryAccentContrast < 1.5) {
      adjustedAccent = '#FF6B35'; // Fall back to default accent
      console.warn(`[BrandingService] Low contrast between primary and accent, adjusting accent to default`);
    }

    return {
      primary,
      secondary: adjustedSecondary,
      accent: adjustedAccent,
    };
  }

  /**
   * Calculate relative luminance of a hex color
   */
  private getLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  /**
   * Calculate contrast ratio between two luminance values
   */
  private getContrastRatio(l1: number, l2: number): number {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Sanitize font family name
   */
  private sanitizeFontFamily(fontFamily: string): string {
    const allowedFonts = [
      'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
      'Poppins', 'Raleway', 'Nunito', 'Playfair Display',
      'Merriweather', 'Oswald', 'PT Sans', 'Ubuntu',
      'Cairo', 'Tajawal', 'Almarai', 'IBM Plex Sans',
      'DM Sans', 'Plus Jakarta Sans', 'Space Grotesk',
    ];

    // Check if the font is in our allowed list
    if (allowedFonts.includes(fontFamily)) {
      return fontFamily;
    }

    // For Arabic content, default to Cairo or Tajawal
    if (fontFamily.includes('Arab') || fontFamily.includes('arab')) {
      return 'Cairo';
    }

    // Default to Inter
    return DEFAULT_BRANDING.fontFamily;
  }

  /**
   * Get brand CSS variables from a brand kit
   */
  getCSSVariables(brandKit: BrandKitInput): Record<string, string> {
    return {
      '--brand-primary': brandKit.primaryColor || DEFAULT_BRANDING.primaryColor,
      '--brand-secondary': brandKit.secondaryColor || DEFAULT_BRANDING.secondaryColor,
      '--brand-accent': brandKit.accentColor || DEFAULT_BRANDING.accentColor,
      '--brand-font': brandKit.fontFamily || DEFAULT_BRANDING.fontFamily,
    };
  }

  /**
   * Get watermark position coordinates (percentage-based)
   */
  getWatermarkPosition(position: string = 'bottom-right'): { x: number; y: number } {
    const positions: Record<string, { x: number; y: number }> = {
      'top-left': { x: 5, y: 5 },
      'top-right': { x: 85, y: 5 },
      'bottom-left': { x: 5, y: 90 },
      'bottom-right': { x: 85, y: 90 },
      'center': { x: 42, y: 45 },
    };

    return positions[position] || positions['bottom-right'];
  }
}

/** Convenience function */
export function getBrandingService(): BrandingService {
  if (!brandingInstance) {
    brandingInstance = new BrandingService();
  }
  return brandingInstance;
}
