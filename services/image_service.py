"""
Image Service - Generates AI images for video scenes.
Primary: Pollinations.ai POST API (free, no API key)
Fallback 1: z-ai-generate CLI (if available)
Fallback 2: FFmpeg gradient background
"""

import asyncio
import hashlib
import logging
import os
import subprocess
import json
import tempfile
import random
from typing import Optional
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

IMAGE_WIDTH = 1080
IMAGE_HEIGHT = 1920

CACHE_DIR = os.environ.get("CACHE_DIR", "/tmp/reele_cache/images")

GRADIENT_PALETTES = {
    "hook": [
        ("#1a0533", "#4a0e8f"), ("#2d0a4e", "#7b2ff7"), ("#0f0c29", "#302b63"),
        ("#200122", "#6f0000"), ("#0f0c29", "#24243e"),
    ],
    "fact": [
        ("#0a1628", "#1e3a5f"), ("#0c1445", "#1a237e"), ("#001510", "#004d40"),
        ("#1b1b2f", "#162447"), ("#0d1b2a", "#1b263b"),
    ],
    "story": [
        ("#1a0a28", "#5f1e3a"), ("#2d1b4e", "#8e24aa"), ("#1a002e", "#5c0068"),
        ("#2b1055", "#d53369"), ("#1f1c2c", "#928dab"),
    ],
    "insight": [
        ("#0a2818", "#1e5f3a"), ("#003d33", "#00695c"), ("#0b3d0b", "#1b5e20"),
        ("#00261c", "#004d40"), ("#071e3d", "#1f6f8b"),
    ],
    "cta": [
        ("#280a0a", "#8f1e1e"), ("#3c0000", "#b71c1c"), ("#1a0000", "#880e4f"),
        ("#3e0000", "#d32f2f"), ("#2c0a0a", "#c62828"),
    ],
}


def _cache_key(prompt: str) -> str:
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _cache_path(prompt: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{_cache_key(prompt)}.jpg")


async def generate_scene_image(prompt: str, scene_type: str = "fact", scene_number: int = 1) -> str:
    """Generate an AI image for a scene. Each scene gets its own unique image."""
    cached = _cache_path(prompt)
    if os.path.exists(cached) and os.path.getsize(cached) > 1000:
        logger.info(f"Image cache hit for scene {scene_number}: {prompt[:50]}...")
        return cached

    enhanced = _enhance_prompt(prompt, scene_type)

    result = await _try_pollinations_post(enhanced, cached)
    if result:
        return result

    result = await _try_pollinations_get(enhanced, cached)
    if result:
        return result

    result = _try_zai_generate(enhanced, cached)
    if result:
        return result

    result = _generate_gradient(cached, scene_type, scene_number)
    if result:
        return result

    raise RuntimeError(f"All image generation methods failed for prompt: {prompt[:50]}")


def _enhance_prompt(prompt: str, scene_type: str) -> str:
    additions = {
        "hook": "dramatic, eye-catching, bold composition, cinematic lighting, ultra detailed, 4K, vertical composition",
        "fact": "informative visualization, clean composition, cinematic lighting, ultra detailed, 4K, vertical composition",
        "story": "narrative scene, emotional, cinematic lighting, movie still, ultra detailed, 4K, vertical composition",
        "insight": "inspiring, thought-provoking, ethereal lighting, ultra detailed, 4K, vertical composition",
        "cta": "bold, attention-grabbing, dynamic composition, cinematic lighting, ultra detailed, 4K, vertical composition",
    }
    addition = additions.get(scene_type, "cinematic lighting, ultra detailed, 4K, vertical composition")
    return f"{prompt}, {addition}"


async def _try_pollinations_post(prompt: str, output_path: str) -> Optional[str]:
    """Try generating image via Pollinations.ai POST API."""
    try:
        logger.info(f"Trying Pollinations.ai POST for: {prompt[:60]}...")

        payload = {
            "prompt": prompt,
            "width": 768,
            "height": 1344,
            "nologo": True,
            "seed": random.randint(1, 999999),
            "enhance": True,
            "model": "flux",
        }

        async with httpx.AsyncClient(
            timeout=90.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Content-Type": "application/json",
                "Accept": "image/jpeg,image/png,image/*"
            }
        ) as client:
            response = await client.post(
                "https://image.pollinations.ai/",
                json=payload,
            )

            if response.status_code == 200 and len(response.content) > 5000:
                raw_path = output_path.replace(".jpg", "_raw.jpg")
                with open(raw_path, "wb") as f:
                    f.write(response.content)
                logger.info(f"Pollinations POST generated raw image: {raw_path} ({len(response.content)} bytes)")

                result = _resize_to_vertical(raw_path, output_path)
                if result:
                    try:
                        os.remove(raw_path)
                    except:
                        pass
                    return result
                else:
                    os.rename(raw_path, output_path)
                    return output_path
            else:
                logger.warning(f"Pollinations POST returned status {response.status_code}, size {len(response.content)}")

    except Exception as e:
        logger.warning(f"Pollinations POST failed: {e}")

    return None


async def _try_pollinations_get(prompt: str, output_path: str) -> Optional[str]:
    """Try generating image via Pollinations.ai GET API."""
    try:
        import urllib.parse
        encoded_prompt = urllib.parse.quote(prompt)
        seed = random.randint(1, 999999)

        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={IMAGE_WIDTH}&height={IMAGE_HEIGHT}&nologo=true&seed={seed}&model=flux"

        logger.info(f"Trying Pollinations.ai GET for: {prompt[:50]}...")

        async with httpx.AsyncClient(
            timeout=90.0,
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
                logger.info(f"Pollinations GET generated image: {output_path}")
                return output_path
            else:
                logger.warning(f"Pollinations GET returned status {response.status_code}, size {len(response.content)}")

    except Exception as e:
        logger.warning(f"Pollinations GET failed: {e}")

    return None


def _try_zai_generate(prompt: str, output_path: str) -> Optional[str]:
    """Try generating image via z-ai-generate CLI (available in Docker)."""
    try:
        check = subprocess.run(
            ["which", "z-ai-generate"],
            capture_output=True, text=True, timeout=5
        )
        if check.returncode != 0:
            logger.info("z-ai-generate CLI not found, skipping")
            return None

        logger.info(f"Trying z-ai-generate CLI for: {prompt[:50]}...")

        raw_path = output_path.replace(".jpg", "_zai_raw.png")
        cmd = [
            "z-ai-generate",
            "--prompt", prompt,
            "--output", raw_path,
            "--size", "768x1344"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode == 0 and os.path.exists(raw_path) and os.path.getsize(raw_path) > 5000:
            resized = _resize_to_vertical(raw_path, output_path)
            if resized:
                try:
                    os.remove(raw_path)
                except:
                    pass
                return resized
            else:
                os.rename(raw_path, output_path)
                return output_path
        else:
            logger.warning(f"z-ai-generate failed: {result.stderr[:200] if result.stderr else 'unknown'}")

    except FileNotFoundError:
        logger.info("z-ai-generate CLI not available")
    except subprocess.TimeoutExpired:
        logger.warning("z-ai-generate timed out")
    except Exception as e:
        logger.warning(f"z-ai-generate error: {e}")

    return None


def _resize_to_vertical(input_path: str, output_path: str) -> Optional[str]:
    """Resize an image to 1080x1920 (9:16 vertical) using FFmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", (
                f"scale={IMAGE_WIDTH}:{IMAGE_HEIGHT}:force_original_aspect_ratio=increase,"
                f"crop={IMAGE_WIDTH}:{IMAGE_HEIGHT}"
            ),
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            logger.info(f"Resized image to vertical: {output_path}")
            return output_path
        else:
            logger.warning(f"Resize failed: {result.stderr[:200]}")

    except Exception as e:
        logger.warning(f"Resize error: {e}")

    return None


def _generate_gradient(output_path: str, scene_type: str, scene_number: int = 1) -> Optional[str]:
    """Generate a gradient background image as last resort."""
    try:
        palettes = GRADIENT_PALETTES.get(scene_type, GRADIENT_PALETTES["fact"])
        palette_idx = (scene_number - 1) % len(palettes)
        c1, c2 = palettes[palette_idx]

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"gradients=s={IMAGE_WIDTH}x{IMAGE_HEIGHT}:c0={c1}:c1={c2}:duration=1:speed=0.5",
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 100:
            logger.info(f"Generated gradient for scene {scene_number} ({scene_type}): {output_path}")
            return output_path

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
