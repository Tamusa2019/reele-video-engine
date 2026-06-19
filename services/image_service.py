"""
Image Service - Generates AI images for video scenes.
Primary: z-ai-web-dev-sdk (high quality, scene-specific, available in Docker)
Fallback 1: Pollinations.ai POST API (free, no API key)
Fallback 2: Pollinations.ai GET API
Fallback 3: FFmpeg gradient background
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

# z-ai SDK requires dimensions that are:
#   - each side between 512 and 2880
#   - each side a multiple of 32
#   - total pixels <= 2^22 (4,194,304)
# 1088x1920 = 2,088,960 pixels - within limits
ZAI_IMAGE_WIDTH = 1088
ZAI_IMAGE_HEIGHT = 1920

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
    """Generate an AI image for a scene. Each scene gets its own unique image.

    Tries z-ai-web-dev-sdk first (best quality, scene-specific), then falls back
    to Pollinations.ai, then to a gradient background.

    The scene_number is passed through to all generators so they can vary their
    output (e.g. different seeds) and to the gradient fallback so each scene
    gets a visually distinct gradient even when AI generation fails.
    """
    cached = _cache_path(prompt)
    if os.path.exists(cached) and os.path.getsize(cached) > 1000:
        logger.info(f"Image cache hit for scene {scene_number}: {prompt[:50]}...")
        return cached

    enhanced = _enhance_prompt(prompt, scene_type)

    # PRIMARY: z-ai-web-dev-sdk (best quality, actually follows the prompt)
    result = await _try_zai_sdk(enhanced, cached, scene_number)
    if result:
        return result

    # FALLBACK 1: Pollinations POST
    result = await _try_pollinations_post(enhanced, cached, scene_number)
    if result:
        return result

    # FALLBACK 2: Pollinations GET
    result = await _try_pollinations_get(enhanced, cached, scene_number)
    if result:
        return result

    # FALLBACK 3: Old z-ai-generate CLI (if installed)
    result = _try_zai_generate(enhanced, cached)
    if result:
        return result

    # LAST RESORT: Gradient background (varied by scene_number)
    result = _generate_gradient(cached, scene_type, scene_number)
    if result:
        return result

    raise RuntimeError(f"All image generation methods failed for prompt: {prompt[:50]}")


async def _try_zai_sdk(prompt: str, output_path: str, scene_number: int = 1) -> Optional[str]:
    """Generate image using z-ai-web-dev-sdk via a Node.js subprocess.

    z-ai actually follows the prompt and produces scene-specific images,
    unlike Pollinations which often returns generic abstract images.
    """
    # Write a small Node.js script that calls z-ai-web-dev-sdk
    script = f"""import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {{
  try {{
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({{
      prompt: {json.dumps(prompt)},
      size: '{ZAI_IMAGE_WIDTH}x{ZAI_IMAGE_HEIGHT}',
    }});
    const b64 = response.data[0].base64;
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync({json.dumps(output_path)}, buf);
    console.log('OK ' + buf.length);
  }} catch (e) {{
    console.error('ERR ' + e.message);
    process.exit(1);
  }}
}}
main();
"""
    script_path = output_path + ".mjs"
    try:
        with open(script_path, "w") as f:
            f.write(script)

        logger.info(f"Trying z-ai-web-dev-sdk for: {prompt[:60]}...")

        # Run with bun (faster) or node (fallback)
        runner = "bun" if subprocess.run(["which", "bun"], capture_output=True).returncode == 0 else "node"
        env = os.environ.copy()
        env["NODE_PATH"] = "/usr/lib/node_modules:" + env.get("NODE_PATH", "")

        result = subprocess.run(
            [runner, script_path],
            capture_output=True, text=True, timeout=120, env=env
        )

        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 5000:
            logger.info(f"z-ai SDK generated image: {output_path} ({os.path.getsize(output_path)} bytes)")
            # Resize to exact 1080x1920 if needed (z-ai returns 1088x1920)
            final = _resize_to_vertical(output_path, output_path)
            return final or output_path
        else:
            err = (result.stderr or result.stdout or "")[:300]
            logger.warning(f"z-ai SDK failed: {err}")

    except subprocess.TimeoutExpired:
        logger.warning("z-ai SDK timed out")
    except Exception as e:
        logger.warning(f"z-ai SDK error: {e}")
    finally:
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except:
            pass

    return None


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


async def _try_pollinations_post(prompt: str, output_path: str, scene_number: int = 1) -> Optional[str]:
    """Try generating image via Pollinations.ai POST API."""
    try:
        logger.info(f"Trying Pollinations.ai POST for scene {scene_number}: {prompt[:60]}...")

        # Deterministic seed based on prompt hash + scene_number so each scene
        # produces a different image even if prompts are similar
        seed_base = hashlib.md5(prompt.lower().strip().encode()).hexdigest()
        seed = (int(seed_base[:8], 16) + scene_number * 1000) % 999999

        payload = {
            "prompt": prompt,
            "width": 1080,
            "height": 1920,
            "nologo": True,
            "seed": seed,
            "enhance": True,
            "model": "flux",
        }

        async with httpx.AsyncClient(
            timeout=120.0,
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


async def _try_pollinations_get(prompt: str, output_path: str, scene_number: int = 1) -> Optional[str]:
    """Try generating image via Pollinations.ai GET API."""
    try:
        import urllib.parse
        encoded_prompt = urllib.parse.quote(prompt)
        # Deterministic seed + scene_number offset for per-scene variety
        seed_base = hashlib.md5(prompt.lower().strip().encode()).hexdigest()
        seed = (int(seed_base[:8], 16) + scene_number * 1000) % 999999

        url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={IMAGE_WIDTH}&height={IMAGE_HEIGHT}&nologo=true&seed={seed}&model=flux&enhance=true"

        logger.info(f"Trying Pollinations.ai GET for scene {scene_number}: {prompt[:50]}...")

        async with httpx.AsyncClient(
            timeout=120.0,
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
    """Generate a gradient background image as last resort.

    Varies the palette by BOTH scene_type AND scene_number so each scene
    gets a visually distinct gradient even when multiple scenes share the
    same scene_type (e.g. multiple 'fact' scenes).
    """
    try:
        palettes = GRADIENT_PALETTES.get(scene_type, GRADIENT_PALETTES["fact"])
        # Combine scene_number into the palette index so different scenes of
        # the same type get different colors
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
            # Add a scene number label so the gradient is visually distinguishable
            # even if colors happen to be similar
            _add_scene_label(output_path, output_path, scene_number, scene_type)
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
            _add_scene_label(output_path, output_path, scene_number, scene_type)
            return output_path

    except Exception as e:
        logger.error(f"Gradient generation error: {e}")

    return None


def _add_scene_label(input_path: str, output_path: str, scene_number: int, scene_type: str) -> None:
    """Burn a small scene-number label into the bottom-right of a fallback image.

    This guarantees that even if two scenes produce similar-looking gradients,
    the user can clearly see they are different scenes.
    """
    try:
        label = f"SCENE {scene_number} · {scene_type.upper()}"
        escaped = label.replace("'", "\\'").replace(":", "\\:").replace("%", "%%")
        tmp = output_path + "_labeled.jpg"
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-vf",
            f"drawtext=text='{escaped}':"
            f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
            f"fontsize=42:fontcolor=white@0.85:"
            f"x=w-text_w-40:y=h-text_h-40:"
            f"borderw=3:bordercolor=black@0.7",
            "-frames:v", "1", "-update", "1", tmp
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0 and os.path.exists(tmp):
            import shutil as _sh
            _sh.move(tmp, output_path)
    except Exception:
        pass  # label is decorative; don't fail the whole generation
