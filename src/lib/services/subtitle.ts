// =============================================================================
// Subtitle Service - Generate SRT and VTT subtitles from scene JSON
// Handles RTL for Arabic content
// =============================================================================

import type { SceneData } from '@/lib/types';

let subtitleInstance: SubtitleService | null = null;

export class SubtitleService {
  /**
   * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
   */
  private formatSRTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.round((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Convert seconds to WebVTT timestamp format: HH:MM:SS.mmm
   */
  private formatVTTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.round((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Add RTL markers for Arabic text
   */
  private addRTLMarkers(text: string, language: string): string {
    if (language === 'ar') {
      // Add Unicode Right-to-Left Mark (RLM) at the start
      return '\u200F' + text;
    }
    return text;
  }

  /**
   * Split long text into subtitle-friendly chunks
   * Max ~40 characters per line, max 2 lines per subtitle
   */
  private splitTextForSubtitle(text: string): string[] {
    if (text.length <= 40) {
      return [text];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > 40) {
        if (currentLine) {
          lines.push(currentLine.trim());
        }
        currentLine = word;
      } else {
        currentLine = (currentLine + ' ' + word).trim();
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    return lines;
  }

  /**
   * Generate SRT format subtitles from scenes
   */
  generateSRT(scenes: SceneData[], language: string = 'en'): string {
    const subtitles: string[] = [];
    let index = 1;

    for (const scene of scenes) {
      if (!scene.text || scene.text.trim().length === 0) continue;
      if (scene.type === 'transition') continue;

      // Split text into subtitle-friendly chunks
      const textLines = this.splitTextForSubtitle(scene.text);

      // If text is very long, split across the scene duration
      const totalDuration = scene.end - scene.start;
      const chunkDuration = totalDuration / Math.ceil(textLines.join(' ').length / 40);
      const displayDuration = Math.min(chunkDuration, totalDuration);

      // Single subtitle entry for the scene
      const startTime = this.formatSRTTimestamp(scene.start);
      const endTime = this.formatSRTTimestamp(scene.end);
      const text = this.addRTLMarkers(
        textLines.join('\n'),
        language
      );

      subtitles.push(`${index}`);
      subtitles.push(`${startTime} --> ${endTime}`);
      subtitles.push(text);
      subtitles.push(''); // Blank line separator

      index++;
    }

    return subtitles.join('\n');
  }

  /**
   * Generate WebVTT format subtitles from scenes
   */
  generateVTT(scenes: SceneData[], language: string = 'en'): string {
    const lines: string[] = ['WEBVTT', ''];

    // Add styling header for RTL
    if (language === 'ar') {
      lines.push('STYLE');
      lines.push('::cue {');
      lines.push('  direction: rtl;');
      lines.push('  text-align: right;');
      lines.push('}');
      lines.push('');
    }

    let index = 1;

    for (const scene of scenes) {
      if (!scene.text || scene.text.trim().length === 0) continue;
      if (scene.type === 'transition') continue;

      const textLines = this.splitTextForSubtitle(scene.text);

      const startTime = this.formatVTTTimestamp(scene.start);
      const endTime = this.formatVTTTimestamp(scene.end);
      const text = this.addRTLMarkers(
        textLines.join('\n'),
        language
      );

      lines.push(`${index}`);
      lines.push(`${startTime} --> ${endTime}`);
      lines.push(text);
      lines.push(''); // Blank line separator

      index++;
    }

    return lines.join('\n');
  }

  /**
   * Generate styled SRT with subtitle style
   */
  generateStyledSRT(
    scenes: SceneData[],
    language: string = 'en',
    style: 'modern' | 'classic' | 'bold' = 'modern'
  ): string {
    const baseSRT = this.generateSRT(scenes, language);

    // Add style note as a comment at the top
    const styleComment = {
      modern: 'NOTE Modern style: rounded, semi-transparent background, sans-serif',
      classic: 'NOTE Classic style: white text, black outline, serif-adjacent',
      bold: 'NOTE Bold style: large text, high contrast, impact font',
    }[style];

    return `${styleComment}\n\n${baseSRT}`;
  }

  /**
   * Generate subtitle data from a complete SceneJSON object
   */
  generateFromSceneJSON(sceneJSON: {
    scenes: SceneData[];
    language: string;
    subtitles?: { enabled: boolean; style: 'modern' | 'classic' | 'bold' };
  }): string {
    const style = sceneJSON.subtitles?.style || 'modern';
    return this.generateStyledSRT(sceneJSON.scenes, sceneJSON.language, style);
  }
}

/** Convenience function */
export function getSubtitleService(): SubtitleService {
  if (!subtitleInstance) {
    subtitleInstance = new SubtitleService();
  }
  return subtitleInstance;
}
