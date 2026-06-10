// =============================================================================
// ReeleComposition - Professional video composition matching HTML design spec
// Features: AI background images, gradient overlays, highlighted text,
// numbered circles, Space Grotesk titles, Inter body, CTA layouts
// =============================================================================

import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  Audio,
  spring,
} from 'remotion';

// Types for our composition props (must be serializable)
export interface ReeleSceneData {
  start: number;
  end: number;
  type: 'hook' | 'problem' | 'solution' | 'proof' | 'cta' | 'transition';
  text: string;
  imageUrl?: string;
  animation?: {
    type?: string;
    duration?: number;
    easing?: string;
  };
}

export interface ReeleBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl?: string;
  watermarkPosition?: string;
}

export interface ReeleCompositionProps {
  scenes: ReeleSceneData[];
  branding: ReeleBranding;
  voiceoverUrl?: string;
  subtitleUrl?: string;
  title: string;
}

// =============================================================================
// Design Tokens (matching the HTML reference)
// =============================================================================
const COLORS = {
  navy: '#1A2B5F',
  navyDark: '#0F1A3E',
  navyDarker: '#0B1026',
  white: '#FFFFFF',
  whiteDim: 'rgba(255,255,255,0.75)',
  whiteFaint: 'rgba(255,255,255,0.5)',
  purple: '#A855F7',
  purpleGlow: 'rgba(168,85,247,0.3)',
  purpleBg: 'rgba(168,85,247,0.1)',
  gold: '#FFD700',
  pink: '#EC4899',
  cyan: '#22D3EE',
  green: '#4ADE80',
  cardBg: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.15)',
  overlayBg: 'rgba(11,16,38,0.6)',
};

const FONTS = {
  title: "'Space Grotesk', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif",
  body: "'Inter', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif",
  mono: "'Liberation Mono', 'DejaVu Sans Mono', monospace",
};

// =============================================================================
// Scene Component - Professional slide rendering matching HTML design
// =============================================================================
const SceneComponent: React.FC<{
  scene: ReeleSceneData;
  branding: ReeleBranding;
  totalScenes: number;
  sceneIndex: number;
  totalDuration: number;
}> = ({ scene, branding, totalScenes, sceneIndex, totalDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneStartFrame = Math.floor(scene.start * fps);
  const sceneEndFrame = Math.ceil(scene.end * fps);
  const sceneDuration = sceneEndFrame - sceneStartFrame;
  const localFrame = frame - sceneStartFrame;

  // ---- Animations ----
  const fadeInDuration = Math.min(15, Math.floor(sceneDuration * 0.12));
  const fadeOutDuration = Math.min(10, Math.floor(sceneDuration * 0.08));

  // Main opacity (fade in/out)
  const opacity = interpolate(
    localFrame,
    [0, fadeInDuration, sceneDuration - fadeOutDuration, sceneDuration],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Slide-up entrance animation
  const slideSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.8 },
  });
  const slideY = interpolate(slideSpring, [0, 1], [50, 0]);

  // Scale entrance for number circle
  const scaleSpring = spring({
    frame: localFrame - 3,
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const numberScale = interpolate(scaleSpring, [0, 1], [0.3, 1]);

  // Subtitle fade-in (slightly delayed)
  const subtitleOpacity = interpolate(
    localFrame,
    [fadeInDuration + 5, fadeInDuration + 15],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Background image subtle zoom (Ken Burns effect)
  const bgScale = interpolate(
    localFrame,
    [0, sceneDuration],
    [1, 1.08],
    { extrapolateRight: 'clamp' }
  );

  // ---- Render based on scene type ----
  const isHook = scene.type === 'hook';
  const isCTA = scene.type === 'cta';
  const isFact = ['problem', 'solution', 'proof'].includes(scene.type);
  const factNumber = isFact ? getFactNumber(sceneIndex, scene.type) : 0;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* ===== Background Image ===== */}
      {scene.imageUrl && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={scene.imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${bgScale})`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* ===== Fallback gradient (no image) ===== */}
      {!scene.imageUrl && (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${COLORS.navyDark} 0%, ${COLORS.navy} 50%, ${branding.accentColor || COLORS.purple} 100%)`,
          }}
        />
      )}

      {/* ===== Dark overlay gradient (matching HTML) ===== */}
      <AbsoluteFill
        style={{
          background: isHook
            ? 'linear-gradient(to bottom, rgba(11,16,38,0.7), rgba(11,16,38,0.35), rgba(11,16,38,0.85))'
            : isCTA
              ? 'linear-gradient(to bottom, rgba(11,16,38,0.65), rgba(11,16,38,0.4), rgba(11,16,38,0.9))'
              : 'linear-gradient(to bottom, rgba(11,16,38,0.75), rgba(11,16,38,0.4), rgba(11,16,38,0.85))',
        }}
      />

      {/* ===== Scene Content ===== */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 36px 80px',
          transform: `translateY(${slideY}px)`,
        }}
      >
        {/* --- Hook Scene --- */}
        {isHook && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            textAlign: 'center',
            width: '100%',
          }}>
            {/* Emoji/icon */}
            <div style={{
              fontSize: 64,
              marginBottom: 28,
              filter: `drop-shadow(0 4px 12px rgba(0,0,0,0.5))`,
            }}>
              {getHookEmoji(scene.text)}
            </div>
            {/* Main title with highlights */}
            <RichTitle text={scene.text} fontSize={40} lineHeight={1.15} />
            {/* Subtitle */}
            <div style={{
              fontFamily: FONTS.body,
              fontSize: 20,
              fontWeight: 500,
              color: COLORS.whiteDim,
              lineHeight: 1.5,
              maxWidth: 380,
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
              marginTop: 16,
              opacity: subtitleOpacity,
            }}>
              {getHookSubtitle(scene.text)}
            </div>
          </div>
        )}

        {/* --- Fact/Numbered Scene (problem, solution, proof) --- */}
        {isFact && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            textAlign: 'center',
            width: '100%',
          }}>
            {/* Number circle */}
            <div style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              border: `3px solid ${COLORS.purple}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONTS.title,
              fontSize: 34,
              fontWeight: 700,
              color: COLORS.purple,
              marginBottom: 28,
              boxShadow: `0 0 25px ${COLORS.purpleGlow}`,
              background: COLORS.purpleBg,
              transform: `scale(${numberScale})`,
            }}>
              {factNumber}
            </div>
            {/* Title with highlighted words */}
            <RichTitle text={scene.text} fontSize={34} lineHeight={1.2} />
            {/* Description subtitle */}
            <div style={{
              fontFamily: FONTS.body,
              fontSize: 19,
              fontWeight: 500,
              color: COLORS.whiteDim,
              lineHeight: 1.55,
              maxWidth: 380,
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
              marginTop: 16,
              opacity: subtitleOpacity,
            }}>
              {getFactDescription(scene.text)}
            </div>
          </div>
        )}

        {/* --- CTA Scene --- */}
        {isCTA && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            textAlign: 'center',
            width: '100%',
          }}>
            {/* Emoji */}
            <div style={{
              fontSize: 52,
              marginBottom: 20,
            }}>
              🚀
            </div>
            {/* CTA title */}
            <div style={{
              fontFamily: FONTS.title,
              fontSize: 32,
              fontWeight: 800,
              color: COLORS.white,
              lineHeight: 1.3,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
              marginBottom: 24,
            }}>
              {scene.text}
            </div>
            {/* Social buttons */}
            <div style={{
              display: 'flex',
              gap: 14,
              marginBottom: 28,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}>
              {['❤️ Like', '🔗 Share', '🔖 Save'].map((label, i) => (
                <div key={i} style={{
                  padding: '14px 24px',
                  borderRadius: 50,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontWeight: 600,
                  fontSize: 16,
                  color: COLORS.white,
                  transform: `scale(${interpolate(slideSpring, [0, 1], [0.8, 1])})`,
                  transition: 'transform 0.2s',
                }}>
                  {label}
                </div>
              ))}
            </div>
            {/* Follow text */}
            <div style={{
              fontFamily: FONTS.body,
              fontSize: 18,
              fontWeight: 600,
              color: COLORS.purple,
            }}>
              Follow for more!
            </div>
          </div>
        )}

        {/* --- Transition Scene --- */}
        {scene.type === 'transition' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: FONTS.title,
              fontSize: 36,
              fontWeight: 700,
              color: COLORS.white,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}>
              {scene.text}
            </div>
          </div>
        )}
      </AbsoluteFill>

      {/* ===== Progress bar at top ===== */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: 3,
        background: `linear-gradient(90deg, ${COLORS.pink}, ${COLORS.purple}, ${COLORS.cyan})`,
        width: `${((sceneIndex + 1) / totalScenes) * 100}%`,
        zIndex: 30,
      }} />

      {/* ===== Slide counter ===== */}
      <div style={{
        position: 'absolute',
        top: 22,
        left: 28,
        zIndex: 20,
        fontFamily: FONTS.title,
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.whiteFaint,
      }}>
        <span style={{ color: COLORS.purple, fontSize: 17 }}>{sceneIndex + 1}</span>
        {' / '}
        {totalScenes}
      </div>

      {/* ===== Logo/Watermark ===== */}
      {branding.logoUrl && (
        <Img
          src={branding.logoUrl}
          style={{
            position: 'absolute',
            ...(branding.watermarkPosition === 'top-right'
              ? { top: 22, right: 28 }
              : branding.watermarkPosition === 'top-left'
                ? { top: 22, left: 28 }
                : { bottom: 90, right: 28 }),
            width: 56,
            height: 56,
            opacity: 0.7,
            objectFit: 'contain',
            zIndex: 20,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// =============================================================================
// Rich Title Component - Highlights key words in purple/gold like the HTML
// =============================================================================
const RichTitle: React.FC<{
  text: string;
  fontSize: number;
  lineHeight: number;
}> = ({ text, fontSize, lineHeight }) => {
  // Split text to identify highlight patterns
  const segments = parseHighlights(text);

  return (
    <div style={{
      fontFamily: FONTS.title,
      fontSize,
      fontWeight: 800,
      color: COLORS.white,
      lineHeight,
      marginBottom: 16,
      textShadow: '0 4px 20px rgba(0,0,0,0.6)',
      maxWidth: '90%',
      textAlign: 'center',
    }}>
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            color: seg.highlight === 'purple' ? COLORS.purple
              : seg.highlight === 'gold' ? COLORS.gold
              : COLORS.white,
          }}
        >
          {seg.text}
        </span>
      ))}
    </div>
  );
};

// =============================================================================
// Subtitle Overlay Component
// =============================================================================
const SubtitleOverlay: React.FC<{
  scenes: ReeleSceneData[];
}> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentScene = scenes.find((scene) => {
    const startFrame = Math.floor(scene.start * fps);
    const endFrame = Math.ceil(scene.end * fps);
    return frame >= startFrame && frame <= endFrame && scene.type !== 'transition';
  });

  if (!currentScene) return null;

  const startFrame = Math.floor(currentScene.start * fps);
  const endFrame = Math.ceil(currentScene.end * fps);
  const localFrame = frame - startFrame;
  const duration = endFrame - startFrame;

  const fadeIn = Math.min(8, Math.floor(duration * 0.1));
  const fadeOut = Math.min(5, Math.floor(duration * 0.08));

  const opacity = interpolate(
    localFrame,
    [0, fadeIn, duration - fadeOut, duration],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Wrap text for subtitle display
  const lines = wrapText(currentScene.text, 32);
  const displayText = lines.join('\n');

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 140,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.65)',
          color: COLORS.white,
          fontSize: 28,
          fontWeight: 600,
          textAlign: 'center',
          padding: '14px 32px',
          borderRadius: 14,
          maxWidth: '85%',
          lineHeight: 1.4,
          whiteSpace: 'pre-line',
          backdropFilter: 'blur(4px)',
        }}
      >
        {displayText}
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// Main Composition Component
// =============================================================================
export const ReeleComposition: React.FC<ReeleCompositionProps> = ({
  scenes,
  branding,
  voiceoverUrl,
  title,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navyDarker }}>
      {/* Render each scene as a Sequence */}
      {scenes.map((scene, index) => {
        const from = Math.floor(scene.start * fps);
        const durationInFramesScene = Math.ceil((scene.end - scene.start) * fps);

        return (
          <Sequence key={index} from={from} durationInFrames={durationInFramesScene}>
            <SceneComponent
              scene={scene}
              branding={branding}
              totalScenes={scenes.length}
              sceneIndex={index}
              totalDuration={durationInFrames / fps}
            />
          </Sequence>
        );
      })}

      {/* Subtitle overlay across the entire video */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <SubtitleOverlay scenes={scenes} />
      </Sequence>

      {/* Voiceover audio */}
      {voiceoverUrl && (
        <Sequence from={0} durationInFrames={durationInFrames}>
          <Audio src={voiceoverUrl} volume={1} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse text for highlight markers
 * Looks for patterns like "word*purple*" or "word*gold*" to apply colors
 * If no markers, auto-highlights key phrases
 */
function parseHighlights(text: string): Array<{ text: string; highlight: 'none' | 'purple' | 'gold' }> {
  const segments: Array<{ text: string; highlight: 'none' | 'purple' | 'gold' }> = [];

  // Check for explicit highlight markers: **purple** or **gold**
  const markerRegex = /\*\*(purple|gold)\*\*([^*]+)\*\*\1\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlight: 'none' });
    }
    // Add the highlighted text
    const color = match[1] as 'purple' | 'gold';
    segments.push({ text: match[2], highlight: color });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: 'none' });
  }

  // If no markers found, auto-highlight important words
  if (segments.length === 0 || (segments.length === 1 && segments[0].highlight === 'none')) {
    return autoHighlight(text);
  }

  return segments;
}

/**
 * Auto-highlight important words/phrases in the text
 * Makes the text more visually interesting like the HTML reference
 */
function autoHighlight(text: string): Array<{ text: string; highlight: 'none' | 'purple' | 'gold' }> {
  const segments: Array<{ text: string; highlight: 'none' | 'purple' | 'gold' }> = [];

  // Keywords that should be highlighted in purple
  const purpleKeywords = [
    'chemistry', 'color', 'colors', 'pigment', 'molecule', 'molecules',
    'chemical', 'reaction', 'science', 'because', 'nanocrystal', 'nanocrystals',
    'structural', 'bioluminescence', 'luciferin', 'carotenoid',
  ];

  // Keywords that should be highlighted in gold
  const goldKeywords = [
    'accident', 'cold light', 'no blue', 'zero heat', '100%',
    'shrimp', 'by accident', 'bend light', 'different colors',
  ];

  // Split into words and check each
  const words = text.split(/(\s+)/);
  let currentSegment = '';
  let currentHighlight: 'none' | 'purple' | 'gold' = 'none';

  for (const word of words) {
    const lowerWord = word.toLowerCase().replace(/[^a-z]/g, '');
    let wordHighlight: 'none' | 'purple' | 'gold' = 'none';

    if (purpleKeywords.some(kw => lowerWord.includes(kw))) {
      wordHighlight = 'purple';
    } else if (goldKeywords.some(kw => lowerWord.includes(kw) || word.toLowerCase().includes(kw))) {
      wordHighlight = 'gold';
    }

    if (wordHighlight !== currentHighlight) {
      if (currentSegment) {
        segments.push({ text: currentSegment, highlight: currentHighlight });
      }
      currentSegment = word;
      currentHighlight = wordHighlight;
    } else {
      currentSegment += word;
    }
  }

  if (currentSegment) {
    segments.push({ text: currentSegment, highlight: currentHighlight });
  }

  // If no highlights were found, highlight the last meaningful phrase in purple
  if (segments.length === 1 && segments[0].highlight === 'none') {
    const words2 = text.split(' ');
    if (words2.length > 3) {
      const lastThree = words2.slice(-3).join(' ');
      const firstPart = words2.slice(0, -3).join(' ') + ' ';
      return [
        { text: firstPart, highlight: 'none' },
        { text: lastThree, highlight: 'purple' },
      ];
    }
  }

  return segments.length > 0 ? segments : [{ text, highlight: 'none' }];
}

/**
 * Get the fact number for numbered scenes
 */
function getFactNumber(sceneIndex: number, sceneType: string): number {
  // We count how many fact-type scenes came before this one
  // For simplicity, just return sceneIndex + 1 for fact scenes
  return sceneIndex; // Will be adjusted by caller if needed
}

/**
 * Get an appropriate emoji for a hook scene based on text content
 */
function getHookEmoji(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('color') || lower.includes('colour')) return '🌈';
  if (lower.includes('science') || lower.includes('chemistry')) return '🧪';
  if (lower.includes('food') || lower.includes('eat')) return '🍕';
  if (lower.includes('space') || lower.includes('planet')) return '🚀';
  if (lower.includes('ocean') || lower.includes('sea')) return '🌊';
  if (lower.includes('animal') || lower.includes('dog') || lower.includes('cat')) return '🐾';
  if (lower.includes('money') || lower.includes('rich')) return '💰';
  if (lower.includes('health') || lower.includes('body')) return '💪';
  if (lower.includes('tech') || lower.includes('ai')) return '🤖';
  if (lower.includes('music')) return '🎵';
  if (lower.includes('history')) return '🏛️';
  return '✨';
}

/**
 * Extract subtitle/description from hook text
 * For hook scenes, the subtitle is usually a secondary line
 */
function getHookSubtitle(text: string): string {
  // If the text has a colon or dash, use the part after it
  const separators = [' - ', ': ', ' — '];
  for (const sep of separators) {
    if (text.includes(sep)) {
      return text.split(sep).slice(1).join(sep).trim();
    }
  }
  return "You won't believe what happens next.";
}

/**
 * Extract fact description from the text
 * Often the second sentence or the explanation part
 */
function getFactDescription(text: string): string {
  // If text has multiple sentences, use all but the first
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 1) {
    return sentences.slice(1).join(' ').trim();
  }
  // Otherwise look for "because", "due to", "this means" patterns
  const explanationWords = ['because', 'since', 'due to', 'this means', 'which means'];
  for (const word of explanationWords) {
    const idx = text.toLowerCase().indexOf(word);
    if (idx > 0) {
      return text.slice(idx).trim();
    }
  }
  return '';
}

/**
 * Wrap text into lines of approximately maxChars per line
 */
function wrapText(text: string, maxChars: number = 32): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3); // Max 3 subtitle lines
}
