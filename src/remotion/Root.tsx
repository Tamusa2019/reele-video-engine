// =============================================================================
// Remotion Root - Registers all compositions for rendering
// This is the entry point that Remotion CLI uses to find compositions
// =============================================================================

import React from 'react';
import { Composition } from 'remotion';
import { ReeleComposition } from './ReeleComposition';
import type { ReeleCompositionProps } from './ReeleComposition';

// Default props for preview/testing
const DEFAULT_PROPS: ReeleCompositionProps = {
  scenes: [
    {
      start: 0,
      end: 3,
      type: 'hook',
      text: 'Did you know this incredible fact?',
      imageUrl: undefined,
    },
    {
      start: 3,
      end: 8,
      type: 'problem',
      text: 'Most people struggle with this everyday...',
      imageUrl: undefined,
    },
    {
      start: 8,
      end: 13,
      type: 'solution',
      text: 'Here is the solution that changes everything!',
      imageUrl: undefined,
    },
    {
      start: 13,
      end: 18,
      type: 'proof',
      text: 'Studies show this works for 95% of people.',
      imageUrl: undefined,
    },
    {
      start: 18,
      end: 22,
      type: 'cta',
      text: 'Follow for more tips like this!',
      imageUrl: undefined,
    },
  ],
  branding: {
    primaryColor: '#1A2B5F',
    secondaryColor: '#FFFFFF',
    accentColor: '#FF6B35',
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
