// =============================================================================
// Remotion Root - Registers all compositions for rendering
// This is the entry point that Remotion CLI uses to find compositions
// =============================================================================

import React from 'react';
import { Composition, Fonts } from 'remotion';
import { ReeleComposition } from './ReeleComposition';
import type { ReeleCompositionProps } from './ReeleComposition';

// Default props for preview/testing
const DEFAULT_PROPS: ReeleCompositionProps = {
  scenes: [
    {
      start: 0,
      end: 3,
      type: 'hook',
      text: 'The Chemistry of Colors',
      imageUrl: undefined,
    },
    {
      start: 3,
      end: 8,
      type: 'problem',
      text: 'Flamingos are pink because of shrimp',
      imageUrl: undefined,
    },
    {
      start: 8,
      end: 13,
      type: 'solution',
      text: 'Leaves are green by accident',
      imageUrl: undefined,
    },
    {
      start: 13,
      end: 18,
      type: 'proof',
      text: 'Blue Morphos have no blue pigment',
      imageUrl: undefined,
    },
    {
      start: 18,
      end: 22,
      type: 'cta',
      text: 'Enjoyed these facts?',
      imageUrl: undefined,
    },
  ],
  branding: {
    primaryColor: '#1A2B5F',
    secondaryColor: '#FFFFFF',
    accentColor: '#A855F7',
    fontFamily: 'Inter',
  },
  title: 'Preview Video',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main Reele video composition - vertical (9:16) for social media */}
      <Composition
        id="ReeleVideo"
        component={ReeleComposition}
        durationInFrames={660} // 22 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />

      {/* Horizontal variant for YouTube Shorts (still 9:16 but can be adjusted) */}
      <Composition
        id="ReeleVideoHD"
        component={ReeleComposition}
        durationInFrames={660}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />
    </>
  );
};
