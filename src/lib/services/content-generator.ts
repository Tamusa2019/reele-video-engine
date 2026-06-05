// =============================================================================
// Content Generation Service - Core AI service for Reele
// Generates hooks, scripts, scene JSON, captions, and hashtags
// =============================================================================

import { getLLMService } from '@/lib/llm';
import type { ProjectInput, LLMResponse, SceneJSON, SceneData } from '@/lib/types';
import { DEFAULT_BRANDING, PLATFORM_MAX_DURATION } from '@/lib/types';

const SYSTEM_PROMPT_CONTENT = `You are a world-class viral short-form video content strategist and scriptwriter. You specialize in creating content for Facebook Reels, Instagram Reels, TikTok, and YouTube Shorts.

Your expertise includes:
- Pattern interrupt techniques that stop the scroll
- Psychological triggers that drive engagement
- Platform-specific content optimization
- Storytelling frameworks for short-form video
- RTL (right-to-left) content for Arabic audiences
- Brand-safe content that converts viewers into customers

You follow the proven structure for viral videos:
1. HOOK (0-3s): Pattern interrupt that stops the scroll. Use curiosity gaps, shocking statements, or relatable problems.
2. PROBLEM (3-8s): Deepen the pain point. Make the viewer feel the problem personally.
3. SOLUTION (8-20s): Present the solution clearly and concisely. Show, don't just tell.
4. PROOF (20-25s): Social proof, testimonials, or demonstrations that validate the solution.
5. CTA (25-30s): Clear, compelling call-to-action that tells the viewer exactly what to do next.

Key rules:
- Every word must earn its place. Short-form video has zero room for filler.
- Use contractions and conversational language.
- Front-load the value — the first 3 seconds determine everything.
- Always end with a specific, actionable CTA.
- For Arabic content: ensure RTL phrasing is natural, not translated.`;

const SYSTEM_PROMPT_SCENE_JSON = `You are a video production AI that converts scripts into machine-readable scene JSON for automated video rendering.

You must output valid JSON with this exact structure:
{
  "title": "string - video title",
  "duration": number - total duration in seconds,
  "language": "string - 'en' or 'ar'",
  "platform": "string - target platform",
  "scenes": [
    {
      "start": number - start time in seconds,
      "end": number - end time in seconds,
      "type": "string - one of: hook, problem, solution, proof, cta, transition",
      "text": "string - on-screen text for this scene",
      "imageUrl": "string or null - prompt for image generation",
      "animation": { "type": "string", "duration": number, "easing": "string" }
    }
  ],
  "branding": {
    "primaryColor": "string - hex color",
    "secondaryColor": "string - hex color",
    "accentColor": "string - hex color",
    "fontFamily": "string",
    "logoUrl": "string or null",
    "watermarkPosition": "string"
  },
  "voiceover": {
    "text": "string - full voiceover script with timing cues",
    "language": "string",
    "speed": number - 0.8 to 1.2
  },
  "subtitles": {
    "enabled": boolean,
    "style": "string - 'modern', 'classic', or 'bold'"
  }
}

Rules:
- Each scene must have precise start/end times that add up to the total duration
- Scene types should follow: hook → problem → solution → proof → cta
- Add transition scenes between major sections (0.5s each)
- Text should be short, punchy phrases (max 10 words per scene)
- imageUrl should be a detailed image generation prompt describing the visual
- Animation types: "fadeIn", "slideUp", "zoomIn", "typewriter", "bounceIn", "slideLeft", "slideRight"
- For Arabic content, use "slideRight" for text animations to match RTL direction`;

const SYSTEM_PROMPT_CAPTION = `You are a social media caption expert who creates engaging, algorithm-friendly captions for short-form video content.

Your captions must:
- Start with an attention-grabbing first line
- Use line breaks for readability
- Include relevant emojis (but not too many)
- End with a clear CTA
- Be optimized for the specific platform's algorithm
- For Instagram: use line breaks and emojis strategically
- For TikTok: keep it casual and use trending language
- For Facebook: more descriptive, community-focused
- For YouTube Shorts: keyword-rich for discoverability

Return ONLY the caption text, no additional commentary.`;

const SYSTEM_PROMPT_HASHTAGS = `You are a hashtag strategist for short-form video content.

Generate relevant hashtags that:
- Mix high-volume and niche hashtags
- Include platform-specific trending tags
- Are relevant to the content topic
- Include a mix of broad and specific tags
- Maximum 30 hashtags for Instagram, 10-15 for other platforms

Return ONLY a JSON array of hashtag strings (without the # symbol), no additional text.
Example: ["viral", "trending", "motivation", "success"]`;

let contentGeneratorInstance: ContentGeneratorService | null = null;

export class ContentGeneratorService {
  private llm = getLLMService();

  static getInstance(): ContentGeneratorService {
    if (!contentGeneratorInstance) {
      contentGeneratorInstance = new ContentGeneratorService();
    }
    return contentGeneratorInstance;
  }

  /** Generate a viral hook for the given topic */
  async generateHook(topic: string, audience: string, platform: string): Promise<string> {
    const prompt = `Generate 1 viral hook for a ${platform} short-form video about: "${topic}"
Target audience: ${audience}

The hook must:
- Stop the scroll within the first 3 seconds
- Create a curiosity gap or pattern interrupt
- Be conversational and natural to speak
- Be under 15 words
- NOT use "Did you know?" or "Stop scrolling" (overused)

Return ONLY the hook text, nothing else.`;

    return this.llm.generate(prompt, SYSTEM_PROMPT_CONTENT);
  }

  /** Generate a full video script with timing */
  async generateScript(
    topic: string,
    audience: string,
    duration: number,
    platform: string,
    hook?: string,
    cta?: string
  ): Promise<string> {
    const maxDuration = PLATFORM_MAX_DURATION[platform] || 60;
    const actualDuration = Math.min(duration, maxDuration);

    const prompt = `Write a complete video script for a ${actualDuration}-second ${platform} video about: "${topic}"
Target audience: ${audience}
${hook ? `Use this hook: "${hook}"` : 'Start with a pattern-interrupt hook.'}
${cta ? `End with this CTA: "${cta}"` : 'End with a clear, specific CTA.'}

Script structure:
- Hook (0-3s): Pattern interrupt
- Problem (3-8s): Deepen the pain point  
- Solution (8-${Math.floor(actualDuration * 0.6)}s): Present the solution
- Proof (${Math.floor(actualDuration * 0.6)}-${Math.floor(actualDuration * 0.85)}s): Validate with proof
- CTA (${Math.floor(actualDuration * 0.85)}-${actualDuration}s): Call to action

Format: Write the voiceover script with [TIMING] markers like [0:00] at the start of each section.
Keep it conversational, punchy, and under ${actualDuration} seconds when spoken at normal pace.`;

    return this.llm.generate(prompt, SYSTEM_PROMPT_CONTENT);
  }

  /** Generate machine-readable Scene JSON from script */
  async generateSceneJSON(
    hook: string,
    script: string,
    input: ProjectInput
  ): Promise<SceneJSON> {
    const maxDuration = PLATFORM_MAX_DURATION[input.platform] || 60;
    const actualDuration = Math.min(input.duration, maxDuration);

    const branding = {
      primaryColor: input.primaryColor || DEFAULT_BRANDING.primaryColor,
      secondaryColor: input.secondaryColor || DEFAULT_BRANDING.secondaryColor,
      accentColor: input.accentColor || DEFAULT_BRANDING.accentColor,
      fontFamily: input.fontFamily || DEFAULT_BRANDING.fontFamily,
      logoUrl: input.logoUrl || undefined,
      watermarkPosition: DEFAULT_BRANDING.watermarkPosition,
    };

    const prompt = `Convert this video script into scene JSON:

Hook: "${hook}"
Script: 
${script}

Requirements:
- Total duration: ${actualDuration} seconds
- Platform: ${input.platform}
- Language: ${input.language}
- Branding colors: primary=${branding.primaryColor}, secondary=${branding.secondaryColor}, accent=${branding.accentColor}
- Font: ${branding.fontFamily}
${input.language === 'ar' ? '- IMPORTANT: This is Arabic (RTL) content. Use slideRight animations and ensure text flows right-to-left.' : ''}

Generate the complete scene JSON following the exact structure specified in your instructions.
For imageUrl fields, provide detailed English prompts for AI image generation that would create compelling visuals for each scene.
The voiceover text should be the complete narration script.
For Arabic content, set speed to 0.9 (slightly slower for clarity).`;

    const sceneJSON = await this.llm.generateJSON<SceneJSON>(prompt, SYSTEM_PROMPT_SCENE_JSON);

    // Ensure branding is applied
    sceneJSON.branding = {
      ...branding,
      ...sceneJSON.branding,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      fontFamily: branding.fontFamily,
    };

    // Ensure voiceover language is set
    sceneJSON.voiceover.language = input.language;
    if (input.language === 'ar') {
      sceneJSON.voiceover.speed = 0.9;
    }

    // Ensure duration is correct
    sceneJSON.duration = actualDuration;
    sceneJSON.platform = input.platform;
    sceneJSON.language = input.language;

    return sceneJSON;
  }

  /** Generate social media caption */
  async generateCaption(topic: string, platform: string, language: string): Promise<string> {
    const prompt = `Write a social media caption for a ${platform} video about: "${topic}"
Language: ${language}
${language === 'ar' ? 'Write the caption in Arabic.' : ''}

The caption should:
- Match the platform's style and culture
- Be engaging and drive comments/shares
- Include 2-3 relevant emojis
- End with a question to drive engagement`;

    return this.llm.generate(prompt, SYSTEM_PROMPT_CAPTION);
  }

  /** Generate relevant hashtags */
  async generateHashtags(topic: string, platform: string): Promise<string[]> {
    const maxHashtags = platform === 'instagram_reels' ? 30 : 15;

    const prompt = `Generate ${maxHashtags} relevant hashtags for a ${platform} video about: "${topic}"

Mix of:
- 40% high-volume popular hashtags
- 30% medium-volume niche hashtags
- 30% specific long-tail hashtags

Return ONLY a JSON array of strings (no # symbol).`;

    try {
      const hashtags = await this.llm.generateJSON<string[]>(prompt, SYSTEM_PROMPT_HASHTAGS);
      return Array.isArray(hashtags) ? hashtags : [];
    } catch {
      // Fallback: generate from topic
      const words = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const base = words.map(w => w.replace(/[^a-z0-9]/g, ''));
      return [
        ...base,
        'viral', 'trending', 'fyp', 'foryou', 'shorts',
        topic.toLowerCase().replace(/\s+/g, ''),
      ].slice(0, maxHashtags);
    }
  }

  /** Orchestrate full content generation */
  async generateFullContent(input: ProjectInput): Promise<LLMResponse> {
    console.log(`[ContentGenerator] Starting full content generation for: "${input.topic}"`);

    // Step 1: Generate viral hook
    console.log('[ContentGenerator] Step 1/5: Generating hook...');
    const hook = await this.generateHook(input.topic, input.audience, input.platform);
    console.log('[ContentGenerator] Hook generated:', hook.substring(0, 80));

    // Step 2: Generate full script
    console.log('[ContentGenerator] Step 2/5: Generating script...');
    const script = await this.generateScript(
      input.topic,
      input.audience,
      input.duration,
      input.platform,
      hook,
      input.cta
    );
    console.log('[ContentGenerator] Script generated:', script.substring(0, 80));

    // Step 3: Generate scene JSON
    console.log('[ContentGenerator] Step 3/5: Generating scene JSON...');
    const sceneJSON = await this.generateSceneJSON(hook, script, input);
    console.log('[ContentGenerator] Scene JSON generated with', sceneJSON.scenes.length, 'scenes');

    // Step 4: Generate caption
    console.log('[ContentGenerator] Step 4/5: Generating caption...');
    const caption = await this.generateCaption(input.topic, input.platform, input.language);
    console.log('[ContentGenerator] Caption generated');

    // Step 5: Generate hashtags
    console.log('[ContentGenerator] Step 5/5: Generating hashtags...');
    const hashtags = await this.generateHashtags(input.topic, input.platform);
    console.log('[ContentGenerator] Hashtags generated:', hashtags.length);

    return { hook, script, sceneJSON, caption, hashtags };
  }
}

/** Convenience function */
export function getContentGenerator(): ContentGeneratorService {
  return ContentGeneratorService.getInstance();
}
