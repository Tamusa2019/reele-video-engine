"""
TTS Service - Text-to-speech using Edge-TTS (Microsoft Edge Read-Aloud).
Free, high-quality, multiple voice options.
"""

import asyncio
import hashlib
import logging
import os
from typing import Optional

import edge_tts

logger = logging.getLogger(__name__)

CACHE_DIR = os.environ.get("CACHE_DIR", "/tmp/reele_cache/tts")

# Voice presets mapping
VOICE_MAP = {
    "bella": "en-US-EmmaMultilingualNeural",    # Warm, feminine (default)
    "adam": "en-US-AndrewNeural",               # Deep, masculine
    "dolly": "en-US-AnaNeural",                  # Friendly, feminine
    "george": "en-GB-RyanNeural",               # British, authoritative
    "nova": "en-US-AvaNeural",                   # Modern, energetic
    "echo": "en-US-BrianNeural",                 # Strong, confident
}

DEFAULT_VOICE = "bella"


def _cache_path(text: str, voice: str) -> str:
    """Get cached TTS file path."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = hashlib.md5(f"{text}:{voice}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.mp3")


async def synthesize(
    text: str,
    voice_key: str = DEFAULT_VOICE,
    output_path: Optional[str] = None,
    rate: str = "+0%",
    pitch: str = "+0Hz"
) -> str:
    """
    Synthesize text to speech using Edge-TTS.
    Returns the path to the generated MP3 file.
    """
    voice = VOICE_MAP.get(voice_key, VOICE_MAP[DEFAULT_VOICE])

    # Check cache
    cache_file = _cache_path(text, voice_key)
    if os.path.exists(cache_file) and os.path.getsize(cache_file) > 1000:
        logger.info(f"TTS cache hit for: {text[:40]}...")
        if output_path and output_path != cache_file:
            import shutil
            shutil.copy2(cache_file, output_path)
            return output_path
        return cache_file

    if not output_path:
        output_path = cache_file

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)

        if os.path.exists(output_path) and os.path.getsize(output_path) > 500:
            logger.info(f"TTS generated: {output_path} ({os.path.getsize(output_path)} bytes)")
            # Save to cache
            if output_path != cache_file:
                import shutil
                shutil.copy2(output_path, cache_file)
            return output_path
        else:
            raise RuntimeError(f"TTS output too small or missing: {output_path}")

    except Exception as e:
        logger.error(f"Edge-TTS failed: {e}")
        # Fallback: generate silent audio
        return _generate_silent_audio(output_path, duration=3.0)


def _generate_silent_audio(output_path: str, duration: float = 3.0) -> str:
    """Generate silent audio as fallback."""
    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
        "-t", str(duration),
        "-c:a", "libmp3lame", "-b:a", "192k",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, timeout=30)
    logger.warning(f"Generated silent audio fallback: {output_path}")
    return output_path


def get_audio_duration(path: str) -> float:
    """Get duration of an audio file in seconds using ffprobe."""
    import subprocess
    import json as json_mod

    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

    if result.returncode == 0:
        info = json_mod.loads(result.stdout)
        return float(info.get("format", {}).get("duration", 3.0))

    return 3.0  # Default fallback


def get_available_voices() -> dict:
    """Return available voice presets."""
    return VOICE_MAP.copy()
