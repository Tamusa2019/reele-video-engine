"""
Image Service - Generates AI images for video scenes.
Primary: Pollinations.ai (free, no API key)
Fallback: z-ai-generate CLI
Last resort: FFmpeg gradient background
"""

import asyncio
import hashlib
import logging
import os
import subprocess
import json
from typing import Optional
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Output dimensions for 9:16 vertical video
IMAGE_WIDTH = 1080
IMAGE_HEIGHT = 1920

# Cache directory for generated images
CACHE_DIR = os.environ.get("CACHE_DIR", "/tmp/reele_cache/images")


def _cache_key(prompt: str) -> str:
    """Generate MD5 hash cache key from prompt."""
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _cache_path(prompt: str) -> str:
    """Get cached file path for a prompt."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{_cache_key(prompt)}.png")


async def generate_scene_image(prompt: str, scene_type: str = "fact") -> str:
    """
    Generate an AI image for a scene.
    Returns the file path to the generated image.
    Tries multiple sources with fallback chain.
    """
    # Check cache first
    cached = _cache_path(prompt)
    if os.path.exists(cached) and os.path.getsize(cached) > 1000:
        logger.info(f"Image cache hit for prompt: {prompt[:50]}...")
        return cached

    # Enhance prompt for better results
    enhanced = _enhance_prompt(prompt, scene_type)

    # Try Pollinations.ai first
    result = await _try_pollinations(enhanced, cached)
    if result:
        return result

    # Try z-ai-generate CLI
    result = await _try_zai_generate(enhanced, cached)
    if result:
        return result

    # Last resort: gradient background
    result = _generate_gradient(cached, scene_type)
    if result:
        return result

    raise RuntimeError(f"All image generation methods failed for prompt: {prompt[:50]}")


def _enhance_prompt(prompt: str, scene_type: str) -> str:
    """Enhance the image prompt for better generation results."""
    additions = {
        "hook": "dramatic, eye-catching, bold composition, cinematic lighting, ultra detailed, 4K",
        "fact": "informative visualization, clean composition, cinematic lighting, ultra detailed, 4K",
        "story": "narrative scene, emotional, cinematic lighting, movie still, ultra detailed, 4K",
        "insight": "inspiring, thought-provoking, ethereal lighting, ultra detailed, 4K",
        "cta": "bold, attention-grabbing, dynamic composition, cinematic lighting, ultra detailed, 4K",
    }
    addition = additions.get(scene_type, "cinematic lighting, ultra detailed, 4K")
    return f"{prompt}, {addition}, vertical 9:16 aspect ratio"


async def _try_pollinations(prompt: str, output_path: str) -> Optional[str]:
    """Try generating image via Pollinations.ai API."""
    try:
        import urllib.parse
        encoded_prompt = urllib.parse.quote(prompt)

        # Pollinations.ai URL format - dimensions as query params, not in path
        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={IMAGE_WIDTH}&height={IMAGE_HEIGHT}&nologo=true&seed=42&model=flux"

        logger.info(f"Trying Pollinations.ai for: {prompt[:50]}...")

        async with httpx.AsyncClient(
            timeout=60.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/png,image/jpeg,image/*"
            }
        ) as client:
            response = await client.get(url)

            if response.status_code == 200 and len(response.content) > 5000:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                logger.info(f"Pollinations.ai generated image: {output_path}")
                return output_path
            else:
                logger.warning(f"Pollinations.ai returned status {response.status_code}, size {len(response.content)}")

    except Exception as e:
        logger.warning(f"Pollinations.ai failed: {e}")

    return None


async def _try_zai_generate(prompt: str, output_path: str) -> Optional[str]:
    """Try generating image via z-ai-generate CLI tool."""
    try:
        # Check if CLI is available
        result = subprocess.run(
            ["which", "z-ai-generate"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            logger.info("z-ai-generate CLI not available")
            return None

        logger.info(f"Trying z-ai-generate for: {prompt[:50]}...")

        # Use size closest to our needs (1344x768 is landscape, but we'll crop later)
        # Actually 720x1440 is portrait and closest to 9:16
        proc = subprocess.run(
            ["z-ai-generate", "-p", prompt, "-o", output_path, "-s", "720x1440"],
            capture_output=True, text=True, timeout=120
        )

        if proc.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 5000:
            logger.info(f"z-ai-generate created image: {output_path}")
            return output_path
        else:
            logger.warning(f"z-ai-generate failed: {proc.stderr[:200]}")

    except Exception as e:
        logger.warning(f"z-ai-generate failed: {e}")

    return None


def _generate_gradient(output_path: str, scene_type: str) -> Optional[str]:
    """Generate a gradient background image as last resort."""
    try:
        color_map = {
            "hook": ("#1a0533", "#4a0e8f"),       # Deep purple
            "fact": ("#0a1628", "#1e3a5f"),         # Deep blue
            "story": ("#1a0a28", "#5f1e3a"),         # Deep magenta
            "insight": ("#0a2818", "#1e5f3a"),       # Deep green
            "cta": ("#280a0a", "#8f1e1e"),           # Deep red
        }
        c1, c2 = color_map.get(scene_type, ("#0a1628", "#1e3a5f"))

        # Use gradients lavfi filter with correct syntax
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"gradients=s={IMAGE_WIDTH}x{IMAGE_HEIGHT}:c0={c1}:c1={c2}",
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 100:
            logger.info(f"Generated gradient: {output_path}")
            return output_path

        # Fallback: use color source with overlay gradient
        logger.warning(f"Gradients filter failed, trying color source: {result.stderr[:200]}")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"color=c={c1}:s={IMAGE_WIDTH}x{IMAGE_HEIGHT}:d=1",
            "-vf", f"drawbox=x=0:y=0:w={IMAGE_WIDTH}:h={IMAGE_HEIGHT}:color={c2}:t=fill:alpha=0.5",
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"Generated color overlay fallback: {output_path}")
            return output_path

        # Absolute last resort: solid color
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"color=c={c1}:s={IMAGE_WIDTH}x{IMAGE_HEIGHT}:d=1",
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if os.path.exists(output_path):
            logger.info(f"Generated solid color fallback: {output_path}")
            return output_path

    except Exception as e:
        logger.error(f"Gradient generation error: {e}")

    return None
