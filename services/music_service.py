"""
Background Music Service - Provides lofi background music.
Generates simple ambient music or uses a provided file.
"""

import logging
import os
import subprocess

logger = logging.getLogger(__name__)

MUSIC_DIR = os.environ.get("MUSIC_DIR", "/tmp/reele_cache/music")


def get_bg_music(style: str = "lofi") -> str:
    """
    Get a background music file path.
    Generates a simple ambient pad if no pre-existing file is available.
    """
    os.makedirs(MUSIC_DIR, exist_ok=True)
    output_path = os.path.join(MUSIC_DIR, f"bgm_{style}.mp3")

    if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
        return output_path

    # Generate a simple ambient pad using FFmpeg
    # This creates a soft, low-volume ambient background
    return _generate_ambient_music(output_path, style)


def _generate_ambient_music(output_path: str, style: str = "lofi") -> str:
    """Generate simple ambient music using FFmpeg synthesizer."""
    # Different styles produce different tones
    freq_map = {
        "lofi": 220,       # A3 - warm, low
        "energetic": 330,   # E4 - brighter
        "calm": 196,        # G3 - gentle
        "dramatic": 277,    # C#4 - tension
    }
    freq = freq_map.get(style, 220)

    # Generate a soft sine pad with slow vibrato
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"sine=frequency={freq}:duration=60",
        "-af", (
            f"volume=0.3,"
            f"tremolo=f=2:d=0.3,"
            f"lowpass=f=800,"
            f"afade=t=in:st=0:d=2,afade=t=out:st=55:d=5"
        ),
        "-t", "60",
        "-c:a", "libmp3lame", "-b:a", "128k",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode != 0:
        # Fallback: simple sine tone
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"sine=frequency={freq}:duration=60",
            "-af", "volume=0.2",
            "-t", "60",
            "-c:a", "libmp3lame", "-b:a", "128k",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if os.path.exists(output_path):
        logger.info(f"Generated background music: {output_path}")
        return output_path

    raise RuntimeError("Failed to generate background music")
