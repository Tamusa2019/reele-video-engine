"""
Branding Service - Applies watermark, logo, and branding overlays to videos.
"""

import logging
import os
import subprocess
import shutil
from typing import Optional

logger = logging.getLogger(__name__)

WIDTH = 1080
HEIGHT = 1920


def apply_branding(
    video_path: str,
    output_path: str,
    watermark_text: Optional[str] = None,
    logo_path: Optional[str] = None,
    page_name: Optional[str] = None,
) -> str:
    """Apply branding overlays to a video: watermark text and/or logo image."""
    if not watermark_text and not logo_path:
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    # Resize logo if needed
    if logo_path and os.path.exists(logo_path):
        logo_path = _maybe_resize_logo(logo_path)

    has_logo = logo_path and os.path.exists(logo_path)
    text_filter = _build_watermark_drawtext(watermark_text) if watermark_text else ""

    if has_logo and text_filter:
        filter_complex = f"[0:v]{text_filter}[vtext];[vtext][1:v]overlay=W-w-30:H-h-130[vout]"
    elif has_logo:
        filter_complex = f"[0:v][1:v]overlay=W-w-30:H-h-130[vout]"
    elif text_filter:
        filter_complex = f"[0:v]{text_filter}[vout]"
    else:
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    if has_logo:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", logo_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            output_path
        ]

    logger.info(f"Applying branding: watermark={'yes' if watermark_text else 'no'}, logo={'yes' if has_logo else 'no'}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        logger.error(f"Branding overlay failed: {result.stderr[:500]}")
        logger.warning("Falling back to video without branding")
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    logger.info(f"Branding applied successfully: {output_path}")
    return output_path


def _build_watermark_drawtext(watermark_text: str) -> str:
    """Build FFmpeg drawtext filter for watermark."""
    escaped_text = watermark_text.replace("'", "\\'").replace(":", "\\:").replace("%", "%%")

    filter_str = (
        f"drawbox=x=0:y=ih-80:w=iw:h=80:color=black@0.5:t=fill,"
        f"drawtext=text='{escaped_text}':"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
        f"fontsize=36:"
        f"fontcolor=white@0.9:"
        f"x=30:"
        f"y=h-65:"
        f"borderw=0"
    )

    return filter_str


def _maybe_resize_logo(logo_path: str) -> str:
    """Resize logo to max 120px wide if needed."""
    try:
        probe_cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams", logo_path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            import json
            info = json.loads(result.stdout)
            streams = info.get("streams", [])
            if streams:
                w = int(streams[0].get("width", 120))
                if w > 120:
                    ext = os.path.splitext(logo_path)[1] or ".png"
                    resized_path = logo_path.rsplit(".", 1)[0] + "_resized" + ext
                    if not os.path.exists(resized_path):
                        scale_cmd = [
                            "ffmpeg", "-y", "-i", logo_path,
                            "-vf", "scale=120:-1",
                            "-update", "1",
                            resized_path
                        ]
                        subprocess.run(scale_cmd, capture_output=True, text=True, timeout=30)
                        if os.path.exists(resized_path):
                            return resized_path
    except Exception as e:
        logger.warning(f"Logo dimension check failed: {e}")

    return logo_path


def create_default_logo(page_name: str, output_path: str) -> str:
    """Create a simple text-based logo as PNG using FFmpeg."""
    letter = page_name[0].upper() if page_name else "R"
    escaped_letter = letter.replace("'", "\\'").replace(":", "\\:")

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x6c5ce7:s=120x120:d=1",
        "-vf",
        f"drawtext=text='{escaped_letter}':"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
        f"fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2",
        "-frames:v", "1",
        "-update", "1",
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode != 0 or not os.path.exists(output_path):
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i",
            f"color=c=0x6c5ce7:s=100x100:d=1",
            "-frames:v", "1",
            "-update", "1",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if os.path.exists(output_path):
        logger.info(f"Created default logo: {output_path}")
        return output_path

    raise RuntimeError("Failed to create default logo")
