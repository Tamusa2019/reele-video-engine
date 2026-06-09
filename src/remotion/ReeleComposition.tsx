// =============================================================================
// ReeleComposition - The main Remotion composition for rendering videos
// Each scene gets its own visual layer with animations and transitions
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
// Scene Component - Renders a single scene with animation
// =============================================================================
const SceneComponent: React.FC<{
  scene: ReeleSceneData;
  branding: ReeleBranding;
  totalScenes: number;
  sceneIndex: number;
}> = ({ scene, branding, totalScenes, sceneIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneStartFrame = Math.floor(scene.start * fps);
  const sceneEndFrame = Math.ceil(scene.end * fps);
  const sceneDuration = sceneEndFrame - sceneStartFrame;

  // Local frame within this scene
  const localFrame = frame - sceneStartFrame;

  // Animation durations
  const fadeInFrames = Math.min(15, Math.floor(sceneDuration * 0.15));
  const fadeOutFrames = Math.min(10, Math.floor(sceneDuration * 0.1));

  // Fade in/out opacity
  const opacity = interpolate(
    localFrame,
    [0, fadeInFrames, sceneDuration - fadeOutFrames, sceneDuration],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  // Text entrance animation (slide up + fade)
  const textSlideY = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const textTranslateY = interpolate(textSlideY, [0, 1], [40, 0]);

  // Scene type styling
  const sceneStyles: Record<string, { fontSize: number; fontWeight: number; textTransform: string }> = {
    hook: { fontSize: 56, fontWeight: 900, textTransform: 'uppercase' },
    problem: { fontSize: 44, fontWeight: 600, textTransform: 'none' },
    solution: { fontSize: 44, fontWeight: 600, textTransform: 'none' },
    proof: { fontSize: 40, fontWeight: 500, textTransform: 'none' },
    cta: { fontSize: 52, fontWeight: 800, textTransform: 'uppercase' },
    transition: { fontSize: 36, fontWeight: 500, textTransform: 'none' },
  };

  const style = sceneStyles[scene.type] || sceneStyles.solution;

  // Background overlay gradient
  const overlayGradient =
    scene.type === 'hook'
      ? 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.6) 100%)'
      : scene.type === 'cta'
        ? 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)'
        : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%)';

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Background Image */}
      {scene.imageUrl && (
        <AbsoluteFill>
          <Img
            src={scene.imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          {/* Overlay gradient for text readability */}
          <AbsoluteFill style={{ background: overlayGradient }} />
        </AbsoluteFill>
      )}

      {/* Fallback gradient background when no image */}
      {!scene.imageUrl && (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%)`,
          }}
        />
      )}

      {/* Scene text content */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 40px',
        }}
      >
        <div
          style={{
            color: branding.secondaryColor,
            fontFamily: branding.fontFamily || 'Inter, Arial, sans-serif',
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            textTransform: style.textTransform as React.CSSProperties['textTransform'],
            textAlign: 'center',
            lineHeight: 1.3,
            transform: `translateY(${textTranslateY}px)`,
            textShadow: '2px 2px 8px rgba(0,0,0,0.5)',
            maxWidth: '90%',
          }}
        >
          {scene.text}
        </div>

        {/* Scene type badge */}
        {scene.type === 'hook' && (
          <div
            style={{
              position: 'absolute',
              top: 120,
              left: '50%',
              transform: `translateX(-50%) translateY(${interpolate(textSlideY, [0, 1], [-20, 0])}px)`,
              backgroundColor: branding.accentColor,
              color: '#fff',
              padding: '8px 24px',
              borderRadius: 30,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {scene.type.toUpperCase()}
          </div>
        )}

        {/* CTA indicator */}
        {scene.type === 'cta' && (
          <div
            style={{
              marginTop: 24,
              backgroundColor: branding.accentColor,
              color: '#fff',
              padding: '16px 48px',
              borderRadius: 50,
              fontSize: 28,
              fontWeight: 800,
              transform: `scale(${interpolate(textSlideY, [0, 1], [0.8, 1])})`,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            ACT NOW
          </div>
        )}
      </AbsoluteFill>

      {/* Watermark/Logo */}
      {branding.logoUrl && (
        <Img
          src={branding.logoUrl}
          style={{
            position: 'absolute',
            ...(branding.watermarkPosition === 'top-right'
              ? { top: 40, right: 40 }
              : branding.watermarkPosition === 'top-left'
                ? { top: 40, left: 40 }
                : { bottom: 80, right: 40 }),
            width: 60,
            height: 60,
            opacity: 0.7,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// =============================================================================
// Subtitle Overlay Component
// =============================================================================
const SubtitleOverlay: React.FC<{
  scenes: ReeleSceneData[];
  language: string;
}> = ({ scenes, language }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find the current scene's text
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

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 160,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          color: '#FFFFFF',
          fontSize: 32,
          fontWeight: 600,
          textAlign: 'center',
          padding: '12px 32px',
          borderRadius: 12,
          maxWidth: '85%',
          direction: language === 'ar' ? 'rtl' : 'ltr',
          lineHeight: 1.4,
          backdropFilter: 'blur(4px)',
        }}
      >
        {currentScene.text}
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
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
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
            />
          </Sequence>
        );
      })}

      {/* Subtitle overlay across the entire video */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <SubtitleOverlay scenes={scenes} language="en" />
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
