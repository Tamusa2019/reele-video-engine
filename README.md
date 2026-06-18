---
title: Reele Video Engine v2
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Reele Video Engine v2

AI-powered short-form video generation engine for creating viral Reels/TikTok/Shorts.

## Features

- **Per-scene AI-generated images** - Each scene gets its own unique AI image via Pollinations.ai
- **Word-by-word subtitles** - Hormozi-style kinetic subtitles with cyan highlighting
- **6 TTS voices** - Edge-TTS voices (Bella, Adam, Dolly, George, Nova, Echo)
- **Branding** - Watermark text + logo overlay on videos
- **Facebook captions** - Auto-generated optimized captions with hashtags
- **Background music** - Ambient music with audio ducking
- **Crossfade transitions** - Smooth xfade transitions between scenes

## API Endpoints

- `GET /` - Web UI
- `POST /api/generate` - Generate a complete video
- `GET /api/video/{filename}` - Serve a generated video
- `POST /api/upload-logo` - Upload a logo image
- `GET /api/voices` - List available TTS voices
- `GET /api/health` - Health check
- `GET /api/diagnose` - Diagnostic info about deployed code
