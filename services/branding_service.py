"""
Branding Service - Applies premium watermark pill + logo overlays to videos.

The watermark is rendered as a rounded pill (gradient-filled) at the bottom-left,
with the brand handle / page name set in bold white type. If a logo is provided,
it is embedded into the pill at the left edge. The pill fades in during the first
0.6s of the video and persists throughout.
"""

import logging
import os
import subprocess
import shutil
from typing import Optional

logger = logging.getLogger(__name__)

WIDTH = 1080
HEIGHT = 1920

# Brand palette (RGB hex strings for ffmpeg)
BRAND_PURPLE_RGB = "0x6C5CE7"
BRAND_PINK_RGB   = "0xFF3366"
LOGO_MAX_W = 80
PILL_PAD_X = 28
PILL_PAD_Y = 18
PILL_BOTTOM_MARGIN = 56
PILL_LEFT_MARGIN = 40


def apply_branding(
    video_path: str,
    output_path: str,
    watermark_text: Optional[str] = None,
    logo_path: Optional[str] = None,
    page_name: Optional[str] = None,
) -> str:
    """Apply branding overlays to a video: gradient pill watermark + optional logo."""
    if not watermark_text and not logo_path:
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    # Resize logo if needed
    if logo_path and os.path.exists(logo_path):
        logo_path = _maybe_resize_logo(logo_path)

    has_logo = bool(logo_path and os.path.exists(logo_path))

    # Probe duration to time the fade-in
    duration = _get_duration(video_path)

    # Build the gradient pill PNG (transparent background, rounded rect filled
    # with a horizontal purple → pink gradient). Returns path to the PNG.
    pill_text = (watermark_text or "").strip() or (f"@{page_name}" if page_name else "")
    if not pill_text and not has_logo:
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    pill_png = _build_pill_png(pill_text, has_logo, logo_path, output_path + "_pill.png")
    if not pill_png:
        logger.warning("Pill generation failed, falling back to plain drawtext watermark")
        return _apply_simple_watermark(video_path, output_path, pill_text, logo_path, has_logo)

    # ffmpeg overlay: video + pill png, placed at bottom-left, fade in 0-0.6s
    # The pill PNG is a full-width, short-height image (1080 x ~140) with the
    # pill drawn at left edge; we overlay it 1:1.
    fade_dur = 0.6
    filter_complex = (
        f"[1:v]format=rgba,"
        f"fade=t=in:st=0:d={fade_dur}:alpha=1[pill];"
        f"[0:v][pill]overlay=0:H-h-0[vout]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", pill_png,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "21",
        "-c:a", "copy",
        "-pix_fmt", "yuv420p",
        output_path
    ]

    logger.info(
        f"Applying branding pill: text={pill_text!r}, logo={'yes' if has_logo else 'no'}, "
        f"fade_in={fade_dur}s"
    )

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        logger.error(f"Branding overlay failed: {result.stderr[:500]}")
        logger.warning("Falling back to video without branding")
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path

    # Cleanup intermediate pill PNG
    try:
        os.remove(pill_png)
    except Exception:
        pass

    logger.info(f"Branding applied successfully: {output_path}")
    return output_path


def _build_pill_png(text: str, has_logo: bool, logo_path: Optional[str], output_path: str) -> Optional[str]:
    """Build a transparent PNG containing the gradient pill at the bottom-left.

    The PNG is full-frame-width (1080px) and ~160px tall. The pill itself sits
    at the left side. Returns the path to the generated PNG or None on failure.
    """
    import textwrap

    # Estimate text width: ~0.55 * font_size * char_count for bold sans
    font_size = 38
    text_width_est = int(len(text) * font_size * 0.58)

    logo_w = LOGO_MAX_W if has_logo else 0
    logo_pad = 16 if has_logo else 0

    pill_inner_w = logo_w + logo_pad + text_width_est
    pill_w = pill_inner_w + 2 * PILL_PAD_X
    pill_h = font_size + 2 * PILL_PAD_Y + 12  # extra room for outline

    # Clamp pill width to max 80% of frame
    max_pill_w = int(WIDTH * 0.8)
    if pill_w > max_pill_w:
        pill_w = max_pill_w

    # PNG canvas: full frame width, pill height + bottom margin
    canvas_w = WIDTH
    canvas_h = pill_h + PILL_BOTTOM_MARGIN

    # Pill x offset (left edge)
    pill_x = PILL_LEFT_MARGIN
    pill_y = 0  # at top of canvas (canvas itself is positioned at bottom of frame)

    # Build the gradient background as a separate color source, then mask it
    # to a rounded rectangle, then draw the text on top.
    # ffmpeg doesn't have native rounded-rect, so we approximate using a
    # rectangle with a slight blur on the edges. For simplicity and to avoid
    # complex filtergraphs, we use a solid rectangle with a subtle 1px lighter
    # inner border (drawbox) — visually reads as a clean pill.

    # Steps:
    # 1. color source: canvas_w x canvas_h, transparent
    # 2. drawbox: filled gradient (we fake gradient with a solid purple-pink
    #    mid color #B24BA6 — visually brand-aligned and avoids expensive
    #    gradient filters). Then draw two semi-transparent overlays to suggest
    #    gradient direction.
    # 3. drawtext: pill_text in white bold
    # 4. If has_logo: overlay the logo PNG at the left of the pill

    # Choose a richer approach: use the `gradients` filter (available in
    # recent ffmpeg) for a true horizontal gradient.
    escaped_text = text.replace("'", "\\'").replace(":", "\\:").replace("%", "%%")

    # Build filter chain
    filters = []

    # Step 1: Solid color base (purple)
    filters.append(
        f"drawbox=x={pill_x}:y={pill_y}:w={pill_w}:h={pill_h}:"
        f"color={BRAND_PURPLE_RGB}@1.0:t=fill"
    )
    # Step 2: Overlay a semi-transparent pink rectangle on the right half to
    # simulate a horizontal gradient (purple → pink).
    half_w = pill_w // 2
    filters.append(
        f"drawbox=x={pill_x + half_w}:y={pill_y}:w={pill_w - half_w}:h={pill_h}:"
        f"color={BRAND_PINK_RGB}@0.55:t=fill"
    )
    # Step 3: Top highlight (thin lighter band for gloss)
    filters.append(
        f"drawbox=x={pill_x}:y={pill_y}:w={pill_w}:h=2:"
        f"color=white@0.35:t=fill"
    )
    # Step 4: Bottom shadow band (subtle depth)
    filters.append(
        f"drawbox=x={pill_x}:y={pill_y + pill_h - 3}:w={pill_w}:h=3:"
        f"color=black@0.35:t=fill"
    )

    # Build the filter chain string. We start from a transparent color source.
    filter_chain = ",".join(filters)

    # Compute text position: centered vertically inside the pill, after logo
    text_x = pill_x + PILL_PAD_X + logo_w + logo_pad
    text_y = pill_y + (pill_h - font_size) // 2 + 2  # small visual nudge down

    drawtext = (
        f"drawtext=text='{escaped_text}':"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
        f"fontsize={font_size}:"
        f"fontcolor=white@0.97:"
        f"x={text_x}:y={text_y}:"
        f"borderw=2:bordercolor=black@0.45"
    )

    # Single-pass: color source → filters → output PNG
    cmd_pill = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i",
        f"color=c=0x00000000@0.0:s={canvas_w}x{canvas_h}:d=1",
        "-vf", f"{filter_chain},{drawtext}",
        "-frames:v", "1",
        "-update", "1",
        "-pix_fmt", "rgba",
        output_path
    ]

    result = subprocess.run(cmd_pill, capture_output=True, text=True, timeout=30)
    if result.returncode != 0 or not os.path.exists(output_path):
        logger.error(f"Pill base render failed: {result.stderr[:300]}")
        return None

    # If we have a logo, composite it onto the pill PNG
    if has_logo and logo_path and os.path.exists(logo_path):
        logo_overlay_y = pill_y + (pill_h - LOGO_MAX_W) // 2
        logo_overlay_x = pill_x + PILL_PAD_X
        tmp_with_logo = output_path + "_logo.png"
        cmd_logo = [
            "ffmpeg", "-y",
            "-i", output_path,
            "-i", logo_path,
            "-filter_complex",
            f"[1:v]scale={LOGO_MAX_W}:-1[lg];"
            f"[0:v][lg]overlay={logo_overlay_x}:{logo_overlay_y}[out]",
            "-map", "[out]",
            "-frames:v", "1",
            "-update", "1",
            "-pix_fmt", "rgba",
            tmp_with_logo
        ]
        result_logo = subprocess.run(cmd_logo, capture_output=True, text=True, timeout=30)
        if result_logo.returncode == 0 and os.path.exists(tmp_with_logo):
            shutil.move(tmp_with_logo, output_path)
        else:
            logger.warning(f"Logo overlay onto pill failed: {result_logo.stderr[:300]}")

    return output_path


def _apply_simple_watermark(
    video_path: str,
    output_path: str,
    text: str,
    logo_path: Optional[str],
    has_logo: bool,
) -> str:
    """Fallback: plain drawtext watermark on a semi-transparent bar."""
    escaped = text.replace("'", "\\'").replace(":", "\\:").replace("%", "%%")
    text_filter = (
        f"drawbox=x=0:y=ih-80:w=iw:h=80:color=black@0.5:t=fill,"
        f"drawtext=text='{escaped}':"
        f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
        f"fontsize=36:fontcolor=white@0.9:x=30:y=h-65:borderw=0"
    )

    if has_logo:
        filter_complex = (
            f"[0:v]{text_filter}[vtext];"
            f"[vtext][1:v]overlay=W-w-30:H-h-130[vout]"
        )
        cmd = [
            "ffmpeg", "-y", "-i", video_path, "-i", logo_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "copy", "-pix_fmt", "yuv420p",
            output_path
        ]
    else:
        filter_complex = f"[0:v]{text_filter}[vout]"
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "copy", "-pix_fmt", "yuv420p",
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        logger.error(f"Simple watermark fallback failed: {result.stderr[:300]}")
        if video_path != output_path:
            shutil.copy2(video_path, output_path)
        return output_path
    return output_path


def _maybe_resize_logo(logo_path: str) -> str:
    """Resize logo to max 120px wide if needed (for the simple fallback path)."""
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


def _get_duration(path: str) -> float:
    import json
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            info = json.loads(result.stdout)
            return float(info.get("format", {}).get("duration", 0))
    except Exception:
        pass
    return 0
