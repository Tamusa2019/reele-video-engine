// =============================================================================
// FFmpeg Video Renderer - Professional-quality video rendering fallback
// Architecture: Python/Pillow generates high-quality scene PNGs,
// ffmpeg assembles them into video clips with Ken Burns effect,
// concatenates clips, and adds audio.
// =============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, unlink, stat, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/config';
import type { RemotionConfig, SceneData } from '@/lib/types';

const execFileAsync = promisify(execFile);

let ffmpegRendererInstance: FfmpegRenderer | null = null;

// =============================================================================
// Python/Pillow scene image generator script
// Generates professional 1080x1920 PNG images for each scene type
// Matching the Remotion composition design: gradients, numbered circles,
// keyword highlights, progress bar, slide counter, CTA buttons
// =============================================================================
const SCENE_GENERATOR_PYTHON = `
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys, json, os, math

# Parse config from stdin
config = json.loads(sys.argv[1])

# --- Design Constants ---
WIDTH = 1080
HEIGHT = 1920
NAVY_DARK = (11, 16, 38)
NAVY = (26, 43, 95)
PURPLE = (168, 85, 247)
PURPLE_GLOW = (168, 85, 247, 77)
PURPLE_BG = (168, 85, 247, 25)
PINK = (236, 72, 153)
CYAN = (34, 211, 238)
GOLD = (255, 215, 0)
GREEN = (74, 222, 128)
WHITE = (255, 255, 255)
WHITE_DIM = (255, 255, 255, 191)
WHITE_FAINT = (255, 255, 255, 128)

# --- Font loading ---
def load_font(size, bold=False):
    font_paths = []
    if bold:
        font_paths = [
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ]
    else:
        font_paths = [
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size)
            except Exception:
                continue
    try:
        return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', size)
    except Exception:
        return ImageFont.load_default()

# --- Gradient backgrounds ---
def draw_diagonal_gradient(draw, w, h, c0, c1):
    for y in range(h):
        ratio = y / h
        # Add slight horizontal shift for diagonal effect
        for x in range(w):
            x_ratio = x / w
            mix = ratio * 0.75 + x_ratio * 0.25
            r = int(c0[0] + (c1[0] - c0[0]) * mix)
            g = int(c0[1] + (c1[1] - c0[1]) * mix)
            b = int(c0[2] + (c1[2] - c0[2]) * mix)
            draw.point((x, y), fill=(r, g, b))

def create_gradient_bg(scene_type):
    gradients = {
        'hook': ((15, 26, 62), (45, 27, 105)),
        'problem': ((15, 26, 62), (26, 43, 95)),
        'solution': ((11, 16, 38), (26, 58, 95)),
        'proof': ((15, 10, 26), (45, 27, 105)),
        'cta': ((15, 26, 62), (74, 25, 66)),
        'transition': ((11, 16, 38), (26, 43, 95)),
    }
    c0, c1 = gradients.get(scene_type, ((11, 16, 38), (26, 43, 95)))
    img = Image.new('RGB', (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(img)
    # Use line-by-line gradient for speed
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(c0[0] + (c1[0] - c0[0]) * ratio)
        g = int(c0[1] + (c1[1] - c0[1]) * ratio)
        b = int(c0[2] + (c1[2] - c0[2]) * ratio)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))
    # Add subtle horizontal gradient overlay
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for x in range(WIDTH):
        x_ratio = x / WIDTH
        alpha = int(20 * x_ratio)
        odraw.line([(x, 0), (x, HEIGHT)], fill=(c1[0], c1[1], c1[2], alpha))
    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    return img

def load_bg_image(image_path):
    try:
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path)
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                bg = Image.new('RGB', img.size, (11, 16, 38))
                bg.paste(img, mask=img.convert('RGBA').split()[-1] if 'A' in img.mode else None)
                img = bg
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            # Resize to cover (crop to fill)
            iw, ih = img.size
            scale = max(WIDTH / iw, HEIGHT / ih)
            new_w, new_h = int(iw * scale), int(ih * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            # Center crop
            left = (new_w - WIDTH) // 2
            top = (new_h - HEIGHT) // 2
            img = img.crop((left, top, left + WIDTH, top + HEIGHT))
            return img
    except Exception as e:
        print(f"[WARN] Failed to load bg image: {e}", file=sys.stderr)
    return None

def apply_dark_overlay(img, scene_type):
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    is_hook = scene_type == 'hook'
    is_cta = scene_type == 'cta'
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        if is_hook:
            # Top darker, middle lighter, bottom darker
            if ratio < 0.3:
                alpha = int(180 - 80 * (ratio / 0.3))
            elif ratio < 0.6:
                alpha = int(100 - 20 * ((ratio - 0.3) / 0.3))
            else:
                alpha = int(80 + 140 * ((ratio - 0.6) / 0.4))
        elif is_cta:
            if ratio < 0.3:
                alpha = int(165 - 70 * (ratio / 0.3))
            elif ratio < 0.6:
                alpha = int(95 - 10 * ((ratio - 0.3) / 0.3))
            else:
                alpha = int(85 + 150 * ((ratio - 0.6) / 0.4))
        else:
            if ratio < 0.3:
                alpha = int(190 - 90 * (ratio / 0.3))
            elif ratio < 0.6:
                alpha = int(100 - 10 * ((ratio - 0.3) / 0.3))
            else:
                alpha = int(90 + 130 * ((ratio - 0.6) / 0.4))
        draw.line([(0, y), (WIDTH, y)], fill=(11, 16, 38, alpha))
    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- Progress bar ---
def draw_progress_bar(img, scene_index, total_scenes):
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    bar_h = 4
    progress = (scene_index + 1) / total_scenes
    bar_w = int(WIDTH * progress)
    # Gradient: pink -> purple -> cyan
    for x in range(bar_w):
        ratio = x / WIDTH
        if ratio < 0.5:
            r = int(PINK[0] + (PURPLE[0] - PINK[0]) * (ratio / 0.5))
            g = int(PINK[1] + (PURPLE[1] - PINK[1]) * (ratio / 0.5))
            b = int(PINK[2] + (PURPLE[2] - PINK[2]) * (ratio / 0.5))
        else:
            r = int(PURPLE[0] + (CYAN[0] - PURPLE[0]) * ((ratio - 0.5) / 0.5))
            g = int(PURPLE[1] + (CYAN[1] - PURPLE[1]) * ((ratio - 0.5) / 0.5))
            b = int(PURPLE[2] + (CYAN[2] - PURPLE[2]) * ((ratio - 0.5) / 0.5))
        draw.line([(x, 0), (x, bar_h)], fill=(r, g, b, 255))
    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- Slide counter ---
def draw_slide_counter(img, scene_index, total_scenes):
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font_num = load_font(20, bold=True)
    font_sep = load_font(17, bold=False)
    # Current number in purple
    num_text = str(scene_index + 1)
    sep_text = f" / {total_scenes}"
    # Draw number in purple
    draw.text((28, 18), num_text, fill=PURPLE + (230,), font=font_num)
    # Get width of number for positioning separator
    num_bbox = draw.textbbox((0, 0), num_text, font=font_num)
    num_w = num_bbox[2] - num_bbox[0]
    draw.text((28 + num_w, 20), sep_text, fill=WHITE_FAINT, font=font_sep)
    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- Text wrapping ---
def wrap_text(text, font, max_width, max_lines=4):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        bbox = font.getbbox(test)
        if bbox[2] - bbox[0] > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines[-1][-3:] != '...':
            lines[-1] = lines[-1][:max_width//20] + '...'
    return lines

# --- Keyword highlighting ---
PURPLE_KEYWORDS = [
    'chemistry', 'color', 'colors', 'colour', 'colours', 'pigment', 'molecule',
    'molecules', 'chemical', 'reaction', 'science', 'because', 'nanocrystal',
    'nanocrystals', 'structural', 'bioluminescence', 'luciferin', 'carotenoid',
    'secret', 'hidden', 'mystery', 'amazing', 'incredible', 'shocking',
    'discover', 'reveals', 'truth', 'power', 'energy', 'quantum', 'force',
    'transform', 'evolve', 'breakthrough', 'impossible', 'unbelievable',
]

GOLD_KEYWORDS = [
    'accident', 'cold light', 'no blue', 'zero heat', '100%', 'shrimp',
    'by accident', 'bend light', 'different colors', 'never', 'every',
    'always', 'only', 'first', 'last', 'biggest', 'smallest', 'fastest',
    'dangerous', 'expensive', 'rare', 'ancient', 'new', 'free', 'million',
    'billion', 'thousand', 'zero', 'nothing', 'everything',
]

def parse_highlights(text):
    """Split text into segments with highlight colors."""
    segments = []
    words = text.split(' ')
    current_seg = ""
    current_color = "none"

    for word in words:
        lower = word.lower().strip('.,!?;:\'"()')
        color = "none"
        for kw in PURPLE_KEYWORDS:
            if kw in lower:
                color = "purple"
                break
        if color == "none":
            for kw in GOLD_KEYWORDS:
                if kw in lower or kw in word.lower():
                    color = "gold"
                    break

        if color != current_color:
            if current_seg:
                segments.append({"text": current_seg + " ", "color": current_color})
            current_seg = word
            current_color = color
        else:
            current_seg += " " + word

    if current_seg:
        segments.append({"text": current_seg, "color": current_color})

    # If no highlights found, highlight last 2-3 words in purple
    if len(segments) == 1 and segments[0]["color"] == "none":
        words = text.split(' ')
        if len(words) > 3:
            cut = max(1, len(words) - 3)
            segments = [
                {"text": ' '.join(words[:cut]) + ' ', "color": "none"},
                {"text": ' '.join(words[cut:]), "color": "purple"},
            ]

    return segments

def draw_rich_text(draw, text, x, y, font_bold, font_reg, max_width, color_map=None):
    """Draw text with keyword highlighting. Returns the total height used."""
    if color_map is None:
        color_map = {"none": WHITE, "purple": PURPLE, "gold": GOLD}

    segments = parse_highlights(text)

    # First wrap the full text to get line breaks
    # Then within each line, apply highlights
    full_lines = wrap_text(text, font_bold, max_width, max_lines=4)

    current_y = y
    line_height = font_bold.size + 10

    for line in full_lines:
        # Draw each segment that belongs to this line
        # Simpler approach: draw the full line white, then overdraw highlighted words
        draw.text((x, current_y), line, fill=WHITE, font=font_bold)

        # Find highlighted words and overdraw them
        for seg in segments:
            seg_text = seg["text"].strip()
            if seg["color"] == "none" or not seg_text:
                continue
            # Check if this segment appears in the current line
            if seg_text in line:
                # Find position within line
                idx = line.find(seg_text)
                prefix = line[:idx]
                # Measure prefix width
                prefix_bbox = font_bold.getbbox(prefix)
                seg_bbox = font_bold.getbbox(seg_text)
                prefix_w = prefix_bbox[2] - prefix_bbox[0]
                seg_color = color_map.get(seg["color"], WHITE)
                # Overdraw the segment with its highlight color
                draw.text((x + prefix_w, current_y), seg_text, fill=seg_color, font=font_bold)

        current_y += line_height

    return current_y - y

# --- Number circle for fact scenes ---
def draw_number_circle(img, number):
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = WIDTH // 2, int(HEIGHT * 0.28)
    radius = 34

    # Glow effect (multiple circles with decreasing alpha)
    for i in range(3, 0, -1):
        glow_r = radius + i * 8
        glow_alpha = 15 + i * 5
        draw.ellipse(
            [cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r],
            fill=PURPLE + (glow_alpha,),
            outline=None
        )

    # Main circle background
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=PURPLE_BG,
        outline=PURPLE + (255,),
        width=3
    )

    # Number text
    font = load_font(34, bold=True)
    num_text = str(number)
    bbox = font.getbbox(num_text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    # Center text in circle
    draw.text((cx - tw // 2, cy - th // 2 - 4), num_text, fill=PURPLE + (255,), font=font)

    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- CTA social buttons ---
def draw_social_buttons(img, y_start):
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    buttons = ["Like", "Share", "Save"]
    emojis = ["<3", ">>", "+"]
    font = load_font(18, bold=True)
    emoji_font = load_font(16, bold=False)

    btn_w = 140
    btn_h = 50
    gap = 16
    total_w = len(buttons) * btn_w + (len(buttons) - 1) * gap
    start_x = (WIDTH - total_w) // 2

    for i, (label, emoji) in enumerate(zip(buttons, emojis)):
        bx = start_x + i * (btn_w + gap)
        by = y_start

        # Button pill background
        draw.rounded_rectangle(
            [bx, by, bx + btn_w, by + btn_h],
            radius=25,
            fill=(255, 255, 255, 20),
            outline=(255, 255, 255, 50),
            width=1
        )

        # Button text
        text = f"{emoji} {label}"
        bbox = font.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = bx + (btn_w - tw) // 2
        ty = by + (btn_h - th) // 2 - 2
        draw.text((tx, ty), text, fill=WHITE + (230,), font=font)

    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- Subtitle bar at bottom ---
def draw_subtitle_bar(img, text):
    if not text or not text.strip():
        return img
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    font = load_font(28, bold=True)
    max_w = int(WIDTH * 0.85)
    lines = wrap_text(text, font, max_w, max_lines=3)
    display_text = '  '.join(lines)

    # Measure text
    bbox = font.getbbox(display_text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # Bar position
    bar_h = th + 36
    bar_y = HEIGHT - 160
    bar_x = (WIDTH - tw - 64) // 2
    bar_w = tw + 64

    # Background bar
    draw.rounded_rectangle(
        [bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
        radius=14,
        fill=(0, 0, 0, 165),
    )

    # Text
    tx = bar_x + 32
    ty = bar_y + 18
    draw.text((tx, ty), display_text, fill=WHITE, font=font)

    result = Image.alpha_composite(img.convert('RGBA'), overlay)
    return result.convert('RGB')

# --- Hook emoji detection ---
def get_hook_emoji_label(text):
    lower = text.lower()
    if any(w in lower for w in ['color', 'colour', 'rainbow']): return 'RAINBOW'
    if any(w in lower for w in ['science', 'chemistry', 'lab']): return 'SCIENCE'
    if any(w in lower for w in ['food', 'eat', 'cook', 'taste']): return 'FOOD'
    if any(w in lower for w in ['space', 'planet', 'star', 'universe']): return 'SPACE'
    if any(w in lower for w in ['ocean', 'sea', 'water', 'fish']): return 'OCEAN'
    if any(w in lower for w in ['animal', 'dog', 'cat', 'pet']): return 'ANIMAL'
    if any(w in lower for w in ['money', 'rich', 'wealth', 'dollar']): return 'MONEY'
    if any(w in lower for w in ['health', 'body', 'fitness', 'brain']): return 'HEALTH'
    if any(w in lower for w in ['tech', 'ai', 'robot', 'computer']): return 'TECH'
    if any(w in lower for w in ['music', 'song', 'sound']): return 'MUSIC'
    if any(w in lower for w in ['history', 'ancient', 'past']): return 'HISTORY'
    return 'SPARKLE'

# --- Main scene rendering ---
def render_scene(cfg):
    scene_type = cfg.get('sceneType', 'transition')
    text = cfg.get('text', '')
    image_path = cfg.get('imagePath', '')
    scene_index = cfg.get('sceneIndex', 0)
    total_scenes = cfg.get('totalScenes', 1)
    output_path = cfg.get('outputPath', '')

    # 1. Create or load background
    bg_img = load_bg_image(image_path)
    if bg_img:
        img = apply_dark_overlay(bg_img, scene_type)
    else:
        img = create_gradient_bg(scene_type)

    # 2. Progress bar
    img = draw_progress_bar(img, scene_index, total_scenes)

    # 3. Slide counter
    img = draw_slide_counter(img, scene_index, total_scenes)

    # 4. Scene-type-specific content
    is_hook = scene_type == 'hook'
    is_cta = scene_type == 'cta'
    is_fact = scene_type in ('problem', 'solution', 'proof')

    if is_hook:
        # Emoji label
        emoji_label = get_hook_emoji_label(text)
        overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Emoji badge at top center
        badge_font = load_font(22, bold=True)
        badge_text = f"[ {emoji_label} ]"
        badge_bbox = badge_font.getbbox(badge_text)
        badge_w = badge_bbox[2] - badge_bbox[0] + 32
        badge_h = badge_bbox[3] - badge_bbox[1] + 20
        badge_x = (WIDTH - badge_w) // 2
        badge_y = 80

        # Badge background
        draw.rounded_rectangle(
            [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
            radius=20,
            fill=PURPLE + (40,),
            outline=PURPLE + (100,),
            width=1
        )
        badge_text_x = (WIDTH - (badge_bbox[2] - badge_bbox[0])) // 2
        draw.text((badge_text_x, badge_y + 10), badge_text, fill=PURPLE + (230,), font=badge_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

        # Title text - large, bold, centered
        title_font = load_font(44, bold=True)
        max_w = int(WIDTH * 0.88)
        lines = wrap_text(text, title_font, max_w, max_lines=4)
        line_height = 58

        total_h = len(lines) * line_height
        base_y = int(HEIGHT * 0.35)

        overlay2 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw2 = ImageDraw.Draw(overlay2)

        for i, line in enumerate(lines):
            ly = base_y + i * line_height
            # Text shadow
            draw2.text((WIDTH // 2 - title_font.getbbox(line)[2] // 2 + 3, ly + 3), line, fill=(0, 0, 0, 140), font=title_font)
            # Main text
            draw2.text((WIDTH // 2 - title_font.getbbox(line)[2] // 2, ly), line, fill=WHITE + (255,), font=title_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay2).convert('RGB')

        # Draw highlighted keywords over the title
        overlay3 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw3 = ImageDraw.Draw(overlay3)
        segments = parse_highlights(text)
        for seg in segments:
            if seg["color"] == "none":
                continue
            seg_text = seg["text"].strip()
            for i, line in enumerate(lines):
                if seg_text in line:
                    ly = base_y + i * line_height
                    idx = line.find(seg_text)
                    prefix = line[:idx]
                    prefix_bbox = title_font.getbbox(prefix)
                    seg_color = PURPLE if seg["color"] == "purple" else GOLD
                    px = WIDTH // 2 - title_font.getbbox(line)[2] // 2 + (prefix_bbox[2] - prefix_bbox[0])
                    draw3.text((px, ly), seg_text, fill=seg_color + (255,), font=title_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay3).convert('RGB')

        # Subtitle
        subtitle_font = load_font(22, bold=False)
        subtitle = get_subtitle(text)
        sub_lines = wrap_text(subtitle, subtitle_font, int(WIDTH * 0.8), max_lines=2)
        sub_y = base_y + len(lines) * line_height + 24

        overlay4 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw4 = ImageDraw.Draw(overlay4)
        for i, sl in enumerate(sub_lines):
            sw = subtitle_font.getbbox(sl)[2]
            draw4.text((WIDTH // 2 - sw // 2, sub_y + i * 34), sl, fill=WHITE_DIM, font=subtitle_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay4).convert('RGB')

    elif is_fact:
        # Numbered circle
        fact_num = cfg.get('factNumber', scene_index + 1)
        img = draw_number_circle(img, fact_num)

        # Title
        title_font = load_font(38, bold=True)
        max_w = int(WIDTH * 0.85)
        lines = wrap_text(text, title_font, max_w, max_lines=3)
        line_height = 52
        base_y = int(HEIGHT * 0.28) + 100

        overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        for i, line in enumerate(lines):
            ly = base_y + i * line_height
            line_w = title_font.getbbox(line)[2]
            # Shadow
            draw.text((WIDTH // 2 - line_w // 2 + 3, ly + 3), line, fill=(0, 0, 0, 140), font=title_font)
            # Main text
            draw.text((WIDTH // 2 - line_w // 2, ly), line, fill=WHITE + (255,), font=title_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

        # Highlight keywords
        overlay2 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw2 = ImageDraw.Draw(overlay2)
        segments = parse_highlights(text)
        for seg in segments:
            if seg["color"] == "none":
                continue
            seg_text = seg["text"].strip()
            for i, line in enumerate(lines):
                if seg_text in line:
                    ly = base_y + i * line_height
                    idx = line.find(seg_text)
                    prefix = line[:idx]
                    prefix_bbox = title_font.getbbox(prefix)
                    seg_color = PURPLE if seg["color"] == "purple" else GOLD
                    line_w = title_font.getbbox(line)[2]
                    px = WIDTH // 2 - line_w // 2 + (prefix_bbox[2] - prefix_bbox[0])
                    draw2.text((px, ly), seg_text, fill=seg_color + (255,), font=title_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay2).convert('RGB')

        # Description subtitle
        desc_font = load_font(21, bold=False)
        desc = get_fact_description(text)
        if desc:
            desc_lines = wrap_text(desc, desc_font, int(WIDTH * 0.78), max_lines=3)
            desc_y = base_y + len(lines) * line_height + 20

            overlay3 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
            draw3 = ImageDraw.Draw(overlay3)
            for i, dl in enumerate(desc_lines):
                dw = desc_font.getbbox(dl)[2]
                draw3.text((WIDTH // 2 - dw // 2, desc_y + i * 32), dl, fill=WHITE_DIM, font=desc_font)

            img = Image.alpha_composite(img.convert('RGBA'), overlay3).convert('RGB')

    elif is_cta:
        overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Rocket badge
        badge_font = load_font(24, bold=True)
        badge_text = "[ ROCKET ]"
        badge_bbox = badge_font.getbbox(badge_text)
        badge_w = badge_bbox[2] - badge_bbox[0] + 32
        badge_h = badge_bbox[3] - badge_bbox[1] + 20
        badge_x = (WIDTH - badge_w) // 2
        badge_y = int(HEIGHT * 0.32)

        draw.rounded_rectangle(
            [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
            radius=20,
            fill=PINK + (30,),
            outline=PINK + (80,),
            width=1
        )
        badge_text_x = (WIDTH - (badge_bbox[2] - badge_bbox[0])) // 2
        draw.text((badge_text_x, badge_y + 10), badge_text, fill=PINK + (230,), font=badge_font)

        # CTA Title
        cta_font = load_font(36, bold=True)
        max_w = int(WIDTH * 0.85)
        cta_lines = wrap_text(text, cta_font, max_w, max_lines=3)
        line_height = 50
        cta_y = badge_y + badge_h + 40

        for i, line in enumerate(cta_lines):
            ly = cta_y + i * line_height
            line_w = cta_font.getbbox(line)[2]
            # Shadow
            draw.text((WIDTH // 2 - line_w // 2 + 3, ly + 3), line, fill=(0, 0, 0, 140), font=cta_font)
            # Text
            draw.text((WIDTH // 2 - line_w // 2, ly), line, fill=WHITE + (255,), font=cta_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

        # Social buttons
        buttons_y = cta_y + len(cta_lines) * line_height + 50
        img = draw_social_buttons(img, buttons_y)

        # Follow text
        follow_font = load_font(20, bold=True)
        follow_text = "Follow for more!"
        follow_bbox = follow_font.getbbox(follow_text)
        follow_w = follow_bbox[2] - follow_bbox[0]
        follow_y = buttons_y + 80

        overlay2 = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw2 = ImageDraw.Draw(overlay2)
        draw2.text((WIDTH // 2 - follow_w // 2, follow_y), follow_text, fill=PURPLE + (255,), font=follow_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay2).convert('RGB')

    else:
        # Transition scene - simple centered text
        trans_font = load_font(40, bold=True)
        max_w = int(WIDTH * 0.85)
        lines = wrap_text(text, trans_font, max_w, max_lines=3)
        line_height = 54
        total_h = len(lines) * line_height
        base_y = int((HEIGHT - total_h) / 2)

        overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        for i, line in enumerate(lines):
            ly = base_y + i * line_height
            line_w = trans_font.getbbox(line)[2]
            draw.text((WIDTH // 2 - line_w // 2 + 3, ly + 3), line, fill=(0, 0, 0, 140), font=trans_font)
            draw.text((WIDTH // 2 - line_w // 2, ly), line, fill=WHITE + (255,), font=trans_font)

        img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

    # 5. Subtitle bar at bottom
    img = draw_subtitle_bar(img, text)

    # 6. Save
    img.save(output_path, 'PNG', optimize=True)
    print(f"[OK] Saved: {output_path}")

def get_subtitle(text):
    separators = [' - ', ': ', ' - ', ' - ']
    for sep in separators:
        if sep in text:
            return text.split(sep)[-1].strip()
    return "You won't believe what happens next."

def get_fact_description(text):
    sentences = []
    current = ""
    for ch in text:
        current += ch
        if ch in '.!?' and len(current.strip()) > 10:
            sentences.append(current.strip())
            current = ""
    if current.strip():
        sentences.append(current.strip())

    if len(sentences) > 1:
        return ' '.join(sentences[1:])

    explanation_words = ['because', 'since', 'due to', 'this means', 'which means', 'that is why']
    lower = text.lower()
    for word in explanation_words:
        idx = lower.find(word)
        if idx > 0:
            return text[idx:].strip()
    return ""

if __name__ == '__main__':
    render_scene(config)
`;

export class FfmpegRenderer {
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.ffmpegPath, ['-version'], { timeout: 5000 });
      return true;
    } catch {
      console.warn('[FfmpegRenderer] ffmpeg not found - video fallback disabled');
      return false;
    }
  }

  /**
   * Render a video using Python/Pillow for scene images + ffmpeg for assembly
   */
  async renderVideo(
    config: RemotionConfig,
    jobId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const outputPath = path.join(UPLOAD_DIR, `video-${jobId}.mp4`);
    const tempDir = path.join(UPLOAD_DIR, `render-temp-${jobId}`);

    await mkdir(tempDir, { recursive: true });

    try {
      onProgress?.(5);

      // Step 1: Generate scene images using Python/Pillow
      const sceneImagePaths: string[] = [];
      let factCounter = 1;

      for (let i = 0; i < config.scenes.length; i++) {
        const scene = config.scenes[i];
        const isFact = ['problem', 'solution', 'proof'].includes(scene.type);
        const factNumber = isFact ? factCounter : 0;
        if (isFact) factCounter++;

        // Resolve image path if available
        const imagePath = this.resolveImagePath(scene.imageUrl, tempDir, i);

        const imagePathOut = path.join(tempDir, `scene-${i}.png`);
        await this.generateSceneImage(
          scene,
          config,
          i,
          config.scenes.length,
          imagePath,
          factNumber,
          imagePathOut
        );
        sceneImagePaths.push(imagePathOut);

        onProgress?.(5 + Math.floor(((i + 1) / config.scenes.length) * 30));
      }

      onProgress?.(35);

      // Step 2: Create video clips from scene images with Ken Burns zoom
      const clipPaths: string[] = [];
      for (let i = 0; i < config.scenes.length; i++) {
        const scene = config.scenes[i];
        const duration = scene.end - scene.start;
        const clipPath = path.join(tempDir, `clip-${i}.mp4`);

        await this.createVideoFromImage(
          sceneImagePaths[i],
          duration,
          config.fps,
          clipPath
        );

        clipPaths.push(clipPath);
        onProgress?.(35 + Math.floor(((i + 1) / config.scenes.length) * 30));
      }

      onProgress?.(65);

      // Step 3: Concatenate all clips
      const concatVideoPath = path.join(tempDir, 'concat.mp4');
      await this.concatenateClips(clipPaths, concatVideoPath);
      onProgress?.(75);

      // Step 4: Add audio if available
      if (config.voiceoverUrl) {
        const audioPath = this.urlToFilePath(config.voiceoverUrl);
        if (audioPath && existsSync(audioPath)) {
          await this.addAudio(concatVideoPath, audioPath, outputPath);
        } else {
          await copyFile(concatVideoPath, outputPath);
        }
      } else {
        await copyFile(concatVideoPath, outputPath);
      }

      onProgress?.(90);

      // Step 5: Verify output
      if (!existsSync(outputPath)) {
        throw new Error('FFmpeg render completed but output file not found');
      }

      const outputStat = await stat(outputPath);
      if (outputStat.size < 1000) {
        throw new Error('FFmpeg output file is too small, likely corrupt');
      }

      onProgress?.(100);
      console.log(
        `[FfmpegRenderer] Render complete! Output: ${outputPath} (${Math.round(outputStat.size / 1024 / 1024)}MB)`
      );

      return outputPath;
    } finally {
      // Clean up temp files
      try {
        const { rm } = await import('fs/promises');
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate a scene image using Python/Pillow
   */
  private async generateSceneImage(
    scene: SceneData,
    config: RemotionConfig,
    sceneIndex: number,
    totalScenes: number,
    imagePath: string,
    factNumber: number,
    outputPath: string
  ): Promise<void> {
    const sceneConfig = {
      sceneType: scene.type,
      text: scene.text || '',
      imagePath: imagePath || '',
      sceneIndex,
      totalScenes,
      factNumber,
      outputPath,
      width: config.width,
      height: config.height,
    };

    const configJson = JSON.stringify(sceneConfig);

    try {
      await execFileAsync('python3', ['-c', SCENE_GENERATOR_PYTHON, configJson], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (existsSync(outputPath)) {
        const fileStat = await stat(outputPath);
        if (fileStat.size > 1000) {
          console.log(
            `[FfmpegRenderer] Scene ${sceneIndex} (${scene.type}) image generated: ${outputPath} (${Math.round(fileStat.size / 1024)}KB)`
          );
          return;
        }
      }

      console.warn(
        `[FfmpegRenderer] Python scene generation produced invalid output for scene ${sceneIndex}, falling back`
      );
    } catch (error) {
      console.warn(
        `[FfmpegRenderer] Python/Pillow scene generation failed for scene ${sceneIndex}: ${error instanceof Error ? error.message : error}`
      );
    }

    // Fallback: generate simple scene image using ffmpeg
    await this.generateFallbackSceneImage(scene, config, sceneIndex, totalScenes, outputPath);
  }

  /**
   * Fallback scene image generation using ffmpeg (simpler but still professional)
   */
  private async generateFallbackSceneImage(
    scene: SceneData,
    config: RemotionConfig,
    sceneIndex: number,
    totalScenes: number,
    outputPath: string
  ): Promise<void> {
    const colors = SCENE_COLORS[scene.type] || SCENE_COLORS.transition;
    const progressWidth = Math.floor(((sceneIndex + 1) / totalScenes) * config.width);
    const safeText = (scene.text || 'Loading...')
      .replace(/'/g, '')
      .replace(/:/g, '')
      .replace(/\n/g, ' ')
      .substring(0, 60);

    try {
      // Try gradient background with text overlay
      await execFileAsync(this.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `gradients=s=${config.width}x${config.height}:c0=${colors.c0}:c1=${colors.c1}:duration=1:direction=diagonal`,
        '-vf', [
          `drawbox=x=0:y=0:w=${progressWidth}:h=4:color=0xEC4899@1:t=fill`,
          `drawtext=fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:text='${safeText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.6:shadowx=3:shadowy=3:box=1:boxcolor=black@0.3:boxborderw=16`,
        ].join(','),
        '-frames:v', '1',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ], { timeout: 15000 });
      return;
    } catch {
      // gradients filter not available
    }

    // Solid color fallback
    try {
      await execFileAsync(this.ffmpegPath, [
        '-f', 'lavfi',
        '-i', `color=c=${colors.c0}:s=${config.width}x${config.height}:d=1`,
        '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:text='${safeText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.6:shadowx=3:shadowy=3`,
        '-frames:v', '1',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ], { timeout: 15000 });
      return;
    } catch {
      // Even solid color failed
    }

    // Last resort: write a minimal valid PNG
    const MINIMAL_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await writeFile(outputPath, MINIMAL_PNG);
  }

  /**
   * Create a video clip from a scene image with subtle Ken Burns zoom effect
   */
  private async createVideoFromImage(
    imagePath: string,
    duration: number,
    fps: number,
    outputPath: string
  ): Promise<void> {
    const safeFps = fps || 30;
    const totalFrames = Math.ceil(duration * safeFps);

    // Ken Burns zoom: slowly zoom from 1.0 to 1.06 over the duration
    // zoompan formula: zoom starts at 1 and increases by 0.0002 per frame
    const zoomRate = 0.06 / totalFrames; // total zoom of 6% over the clip
    const zoomFilter = `zoompan=z='min(zoom+${zoomRate.toFixed(8)},1.06)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${safeFps}`;

    const args = [
      '-loop', '1',
      '-i', imagePath,
      '-vf', zoomFilter,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '20',
      '-t', duration.toString(),
      '-y',
      outputPath,
    ];

    console.log(`[FfmpegRenderer] Creating clip from image (${duration}s, ${safeFps}fps)`);

    try {
      await execFileAsync(this.ffmpegPath, args, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      // If zoompan fails, fall back to simple static image clip
      console.warn(
        `[FfmpegRenderer] zoompan filter failed, using static image: ${error instanceof Error ? error.message : error}`
      );
      await this.createStaticImageClip(imagePath, duration, safeFps, outputPath);
    }
  }

  /**
   * Create a simple static image video clip (no zoom)
   */
  private async createStaticImageClip(
    imagePath: string,
    duration: number,
    fps: number,
    outputPath: string
  ): Promise<void> {
    const args = [
      '-loop', '1',
      '-i', imagePath,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '20',
      '-r', fps.toString(),
      '-t', duration.toString(),
      '-y',
      outputPath,
    ];

    await execFileAsync(this.ffmpegPath, args, {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  /**
   * Resolve image URL to a filesystem path, or download if external
   */
  private resolveImagePath(
    imageUrl: string | undefined,
    tempDir: string,
    sceneIndex: number
  ): string {
    if (!imageUrl) return '';

    // Local upload path
    if (imageUrl.startsWith('/api/upload/')) {
      const localPath = path.join(UPLOAD_DIR, imageUrl.replace('/api/upload/', ''));
      if (existsSync(localPath)) return localPath;
    }

    if (imageUrl.startsWith('/upload/')) {
      const localPath = path.join(UPLOAD_DIR, imageUrl.replace('/upload/', ''));
      if (existsSync(localPath)) return localPath;
    }

    // Absolute filesystem path
    if (imageUrl.startsWith('/') && existsSync(imageUrl)) {
      return imageUrl;
    }

    // External URL - can't use directly, skip
    if (imageUrl.startsWith('http')) {
      return '';
    }

    // Relative path that might exist
    if (existsSync(imageUrl)) {
      return imageUrl;
    }

    return '';
  }

  /**
   * Convert a URL path to a filesystem path
   */
  private urlToFilePath(url: string | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('/api/upload/')) {
      return path.join(UPLOAD_DIR, url.replace('/api/upload/', ''));
    }
    if (url.startsWith('/upload/')) {
      return path.join(UPLOAD_DIR, url.replace('/upload/', ''));
    }
    if (url.startsWith('http')) return null;
    return url;
  }

  /**
   * Concatenate multiple video clips into one
   */
  private async concatenateClips(
    clipPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (clipPaths.length === 0) {
      throw new Error('No clips to concatenate');
    }

    // If only one clip, just copy it
    if (clipPaths.length === 1) {
      await copyFile(clipPaths[0], outputPath);
      return;
    }

    // Create concat file
    const concatContent = clipPaths.map((p) => `file '${p}'`).join('\n');
    const concatFilePath = path.join(path.dirname(outputPath), 'concat.txt');
    await writeFile(concatFilePath, concatContent);

    // Try fast copy first, fall back to re-encode
    try {
      await execFileAsync(
        this.ffmpegPath,
        ['-f', 'concat', '-safe', '0', '-i', concatFilePath, '-c', 'copy', '-y', outputPath],
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );
    } catch {
      console.warn('[FfmpegRenderer] Concat copy failed, re-encoding...');
      await execFileAsync(
        this.ffmpegPath,
        [
          '-f', 'concat', '-safe', '0', '-i', concatFilePath,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          '-preset', 'medium', '-crf', '20', '-y', outputPath,
        ],
        { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
      );
    }

    // Clean up concat file
    try {
      await unlink(concatFilePath);
    } catch {
      // Ignore
    }
  }

  /**
   * Add audio track to a video
   * Tries direct merge → re-encode audio → copy video without audio
   */
  private async addAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string
  ): Promise<void> {
    // Strategy 1: Direct merge (fastest)
    try {
      await execFileAsync(
        this.ffmpegPath,
        [
          '-i', videoPath, '-i', audioPath,
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
          '-shortest', '-y', outputPath,
        ],
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );
      return;
    } catch {
      console.warn('[FfmpegRenderer] Direct audio merge failed, trying re-encode...');
    }

    // Strategy 2: Re-encode audio first, then merge
    try {
      const tempDir = path.dirname(videoPath);
      const reencodedAudio = path.join(tempDir, 'reencoded-audio.mp3');

      await execFileAsync(
        this.ffmpegPath,
        ['-i', audioPath, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-y', reencodedAudio],
        { timeout: 30000 }
      );

      await execFileAsync(
        this.ffmpegPath,
        [
          '-i', videoPath, '-i', reencodedAudio,
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
          '-shortest', '-y', outputPath,
        ],
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );

      try {
        await unlink(reencodedAudio);
      } catch {}
      return;
    } catch {
      console.warn('[FfmpegRenderer] Re-encoded audio merge also failed');
    }

    // Strategy 3: Use video without audio (better than no output)
    console.warn('[FfmpegRenderer] All audio merge attempts failed, using video without audio');
    await copyFile(videoPath, outputPath);
  }
}

// Scene-type color schemes for ffmpeg fallback
const SCENE_COLORS: Record<string, { c0: string; c1: string; accent: string }> = {
  hook: { c0: '0x0F1A3E', c1: '0x2D1B69', accent: '0xA855F7' },
  problem: { c0: '0x0F1A3E', c1: '0x1A2B5F', accent: '0x22D3EE' },
  solution: { c0: '0x0B1026', c1: '0x1A3A5F', accent: '0x4ADE80' },
  proof: { c0: '0x0F0A1A', c1: '0x2D1B69', accent: '0xFFD700' },
  cta: { c0: '0x0F1A3E', c1: '0x4A1942', accent: '0xEC4899' },
  transition: { c0: '0x0B1026', c1: '0x1A2B5F', accent: '0xA855F7' },
};

/** Convenience function */
export function getFfmpegRenderer(): FfmpegRenderer {
  if (!ffmpegRendererInstance) {
    ffmpegRendererInstance = new FfmpegRenderer();
  }
  return ffmpegRendererInstance;
}
