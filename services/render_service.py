"""
Render Service - FFmpeg video composition pipeline (engagement-optimized overlay).

Handles scene rendering, crossfade transitions, multi-layer ASS overlays
(hook title card, chapter badges, progress bar cue, word-pop subtitles,
end-card CTA, dim background), color grading, and branding composition.
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
import shutil
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

WIDTH = 1080
HEIGHT = 1920

CROSSFADE_DURATION = 0.5

# Typography
SUBTITLE_FONT = "DejaVu Sans"
SUBTITLE_SIZE = 80
SUBTITLE_OUTLINE = 7
SUBTITLE_MARGIN_V = 280  # lower-third, above branding pill

# Brand palette (display RGB → ASS AABBGGRR conversions used inline)
BRAND_PURPLE = "E75C6C"     # #6C5CE7  (R=6C G=5C B=E7)
BRAND_PINK   = "6633FF"     # #FF3366  (R=FF G=33 B=66)
ACCENT_YELLOW = "3DD9FF"    # #FFD93D  (R=FF G=D9 B=3D)
COLOR_WHITE = "&H00FFFFFF"
COLOR_BLACK = "&H00000000"
COLOR_HIGHLIGHT = "&H003DD9FF"   # yellow
COLOR_DIM_BG = "&HC0000000"      # ~75% transparent black

HOOK_DURATION = 2.2          # seconds the hook title card stays visible
ENDCARD_DURATION = 2.6       # seconds the end-card CTA stays visible
BADGE_HOLD = 2.2             # seconds the chapter badge stays visible per scene


class RenderService:
    """Handles all FFmpeg video rendering operations."""

    def __init__(self, output_dir: str = "/tmp/reele_output"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    async def render_video(
        self,
        scenes: List[Dict],
        scene_images: List[str],
        scene_audios: List[str],
        scene_word_alignments: List[List[Dict]],
        bg_music_path: Optional[str] = None,
        watermark_text: Optional[str] = None,
        logo_path: Optional[str] = None,
        page_name: Optional[str] = None,
        topic: Optional[str] = None,
        progress_callback=None
    ) -> str:
        """Render the final video from all scene components."""
        job_dir = tempfile.mkdtemp(prefix="reele_render_", dir=self.output_dir)

        try:
            scene_durations = []
            for audio_path in scene_audios:
                dur = self._get_duration(audio_path)
                scene_durations.append(max(dur, 2.0))

            logger.info(f"Scene durations: {scene_durations}")

            if progress_callback:
                await progress_callback(5, "Creating scene video clips with AI images...")

            scene_videos = []
            for i, (img_path, audio_path, duration) in enumerate(
                zip(scene_images, scene_audios, scene_durations)
            ):
                video_path = os.path.join(job_dir, f"scene_{i:02d}.mp4")
                await self._create_scene_video(
                    img_path, audio_path, duration, video_path, scene_index=i
                )
                scene_videos.append(video_path)

                if progress_callback:
                    pct = 5 + int(35 * (i + 1) / len(scene_videos))
                    await progress_callback(pct, f"Rendered scene {i+1}/{len(scene_videos)} with AI image")

            if progress_callback:
                await progress_callback(45, "Adding transitions...")

            if len(scene_videos) > 1:
                concat_video = os.path.join(job_dir, "concat_video.mp4")
                await self._concatenate_with_crossfade(scene_videos, scene_durations, concat_video)
            else:
                concat_video = scene_videos[0]

            if progress_callback:
                await progress_callback(60, "Building engagement overlay...")

            # Compute scene offsets (start times in the final concatenated video)
            scene_offsets = self._compute_scene_offsets(scene_durations)
            total_duration = scene_offsets[-1] + scene_durations[-1]

            subtitle_path = os.path.join(job_dir, "engagement.ass")
            self._compile_engagement_ass(
                scenes=scenes,
                all_word_alignments=scene_word_alignments,
                scene_durations=scene_durations,
                scene_offsets=scene_offsets,
                total_duration=total_duration,
                topic=topic or (scenes[0].get("text", "") if scenes else "Reele"),
                page_name=page_name or "",
                output_path=subtitle_path,
            )

            if progress_callback:
                await progress_callback(70, "Final composition + color grade...")

            composite_path = os.path.join(job_dir, "composite_video.mp4")
            await self._final_composite(
                concat_video, subtitle_path, bg_music_path, composite_path,
                total_duration=total_duration,
            )

            if progress_callback:
                await progress_callback(85, "Applying branding...")

            if watermark_text or logo_path:
                from services.branding_service import apply_branding
                final_path = os.path.join(job_dir, "branded_video.mp4")
                apply_branding(
                    composite_path,
                    final_path,
                    watermark_text=watermark_text,
                    logo_path=logo_path,
                    page_name=page_name,
                )
            else:
                final_path = composite_path

            if progress_callback:
                await progress_callback(95, "Finalizing...")

            import time
            output_name = f"reele_{int(time.time())}.mp4"
            output_path = os.path.join(self.output_dir, output_name)
            shutil.copy2(final_path, output_path)

            if progress_callback:
                await progress_callback(100, "Done!")

            logger.info(f"Final video: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Render failed: {e}")
            raise
        finally:
            pass

    # ------------------------------------------------------------------
    # Scene clip rendering
    # ------------------------------------------------------------------

    async def _create_scene_video(
        self,
        image_path: str,
        audio_path: str,
        duration: float,
        output_path: str,
        scene_index: int = 0
    ):
        """Create a video clip from an image + audio with Ken Burns motion."""
        fps = 30
        iw = WIDTH
        ih = HEIGHT
        use_ken_burns = os.environ.get("ENABLE_KEN_BURNS", "1") != "0"

        if use_ken_burns:
            total_frames = max(int(duration * fps), 30)
            if scene_index % 2 == 0:
                zoom_expr = f"min(zoom+0.0005,1.15)"
                x_expr = "iw/2-(iw/zoom/2)"
                y_expr = "ih/2-(ih/zoom/2)"
            else:
                zoom_expr = f"if(eq(on,1),1.15,max(zoom-0.0005,1.0))"
                x_expr = "iw/2-(iw/zoom/2)"
                y_expr = "ih/2-(ih/zoom/2)"

            zoompan_filter = (
                f"zoompan="
                f"z='{zoom_expr}':"
                f"x='{x_expr}':"
                f"y='{y_expr}':"
                f"d={total_frames}:"
                f"s={iw}x{ih}:"
                f"fps={fps}"
            )
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", f"[0:v]{zoompan_filter}[v]",
                "-map", "[v]", "-map", "1:a",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "superfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if result.returncode == 0:
                logger.info(f"Scene video (Ken Burns, scene {scene_index}) created: {output_path}")
                return
            logger.warning(f"Ken Burns failed, using simple loop: {result.stderr[:200]}")

        cmd_simple = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", image_path,
            "-i", audio_path,
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "superfast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-r", str(fps),
            "-s", f"{iw}x{ih}",
            "-shortest",
            output_path
        ]
        result = subprocess.run(cmd_simple, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"Scene video creation failed: {result.stderr[:300]}")

        logger.info(f"Scene video created: {output_path}")

    # ------------------------------------------------------------------
    # Transitions
    # ------------------------------------------------------------------

    async def _concatenate_with_crossfade(
        self,
        video_paths: List[str],
        durations: List[float],
        output_path: str
    ):
        """Concatenate video clips with varied crossfade transitions."""
        if len(video_paths) <= 1:
            shutil.copy2(video_paths[0], output_path)
            return

        num_videos = len(video_paths)
        fade_dur = CROSSFADE_DURATION

        transitions = [
            "fade", "slideleft", "circleopen", "wipeup",
            "dissolve", "slideright", "radial", "wipeleft",
        ]

        inputs = []
        for vp in video_paths:
            inputs.extend(["-i", vp])

        offsets = []
        accumulated_dur = durations[0]
        for i in range(num_videos - 1):
            if i == 0:
                offsets.append(max(0, durations[0] - fade_dur))
            else:
                offsets.append(max(0, accumulated_dur - fade_dur))
            accumulated_dur = accumulated_dur + durations[i + 1] - fade_dur

        filter_parts = []
        audio_filter_parts = []

        if num_videos == 2:
            t = transitions[0]
            filter_parts.append(
                f"[0:v][1:v]xfade=transition={t}:duration={fade_dur}:offset={offsets[0]:.2f}[vout]"
            )
            audio_filter_parts.append(
                f"[0:a][1:a]acrossfade=d={fade_dur}[aout]"
            )
        else:
            prev_vlabel = "0:v"
            prev_alabel = "0:a"
            for i in range(num_videos - 1):
                t = transitions[i % len(transitions)]
                if i < num_videos - 2:
                    out_vlabel = f"v{i}"
                    out_alabel = f"a{i}"
                    filter_parts.append(
                        f"[{prev_vlabel}][{i+1}:v]xfade=transition={t}:duration={fade_dur}:offset={offsets[i]:.2f}[{out_vlabel}]"
                    )
                    audio_filter_parts.append(
                        f"[{prev_alabel}][{i+1}:a]acrossfade=d={fade_dur}[{out_alabel}]"
                    )
                    prev_vlabel = out_vlabel
                    prev_alabel = out_alabel
                else:
                    filter_parts.append(
                        f"[{prev_vlabel}][{i+1}:v]xfade=transition={t}:duration={fade_dur}:offset={offsets[i]:.2f}[vout]"
                    )
                    audio_filter_parts.append(
                        f"[{prev_alabel}][{i+1}:a]acrossfade=d={fade_dur}[aout]"
                    )

        filter_complex = ";".join(filter_parts + audio_filter_parts)

        cmd = [
            "ffmpeg", "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            output_path
        ]

        logger.info(f"Crossfade concat: {num_videos} clips, offsets={offsets}")

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            logger.warning(f"Crossfade concat failed: {result.stderr[:300]}")
            logger.info("Falling back to simple concat...")
            await self._simple_concat(video_paths, output_path)
            return

        logger.info(f"Crossfade concat complete: {output_path}")

    async def _simple_concat(self, video_paths: List[str], output_path: str):
        """Simple concatenation without transitions as fallback."""
        job_dir = os.path.dirname(output_path)
        uniform_videos = []

        for i, vp in enumerate(video_paths):
            uniform_path = os.path.join(job_dir, f"uniform_{i:02d}.mp4")
            cmd = [
                "ffmpeg", "-y", "-i", vp,
                "-c:v", "libx264", "-preset", "fast", "-crf", "22",
                "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                "-r", "30",
                "-s", f"{WIDTH}x{HEIGHT}",
                uniform_path
            ]
            subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            uniform_videos.append(uniform_path)

        list_path = os.path.join(job_dir, "concat_list.txt")
        with open(list_path, "w") as f:
            for vp in uniform_videos:
                f.write(f"file '{os.path.abspath(vp)}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"Simple concat failed: {result.stderr[:300]}")

        logger.info(f"Simple concat complete: {output_path}")

    # ------------------------------------------------------------------
    # Timing helpers
    # ------------------------------------------------------------------

    def _compute_scene_offsets(self, scene_durations: List[float]) -> List[float]:
        """Return start time of each scene in the final concatenated video."""
        offsets = []
        accumulated = 0.0
        for i, dur in enumerate(scene_durations):
            offsets.append(accumulated)
            if i == 0:
                accumulated += dur
            else:
                accumulated += dur - CROSSFADE_DURATION
        return offsets

    # ------------------------------------------------------------------
    # Engagement overlay ASS compiler (the heart of the upgrade)
    # ------------------------------------------------------------------

    def _compile_engagement_ass(
        self,
        scenes: List[Dict],
        all_word_alignments: List[List[Dict]],
        scene_durations: List[float],
        scene_offsets: List[float],
        total_duration: float,
        topic: str,
        page_name: str,
        output_path: str,
    ):
        """Compile the full engagement overlay ASS file.

        Layers (low to high):
          Layer 0: end-card dim background (last ENDCARD_DURATION)
          Layer 1: hook title card + hook label (first HOOK_DURATION)
          Layer 2: chapter badges (per scene)
          Layer 3: end-card text (last ENDCARD_DURATION)
          Layer 4: word-pop subtitles (whole video)
          Layer 5: progress bar at top (whole video)
        """
        lines: List[str] = []

        lines.append("[Script Info]")
        lines.append("Title: Reele Engagement Overlay")
        lines.append("ScriptType: v4.00+")
        lines.append(f"PlayResX: {WIDTH}")
        lines.append(f"PlayResY: {HEIGHT}")
        lines.append("WrapStyle: 2")  # no auto-wrap; we wrap manually with \\N
        lines.append("ScaledBorderAndShadow: yes")
        lines.append("YCbCr Matrix: TV.709")
        lines.append("")

        lines.append("[V4+ Styles]")
        lines.append(
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
            "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
            "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
            "Alignment, MarginL, MarginR, MarginV, Encoding"
        )

        # Subtitle style — bigger, bolder, lower-third, with shadow
        lines.append(
            f"Style: Subtitle,{SUBTITLE_FONT},{SUBTITLE_SIZE},"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H80000000,"
            f"-1,0,0,0,100,100,0,0,1,"
            f"{SUBTITLE_OUTLINE},2,"
            f"2,80,80,{SUBTITLE_MARGIN_V},1"
        )

        # Chapter badge — purple filled box (BorderStyle=3), white text, top-left
        lines.append(
            f"Style: Badge,{SUBTITLE_FONT},38,"
            f"{COLOR_WHITE},&H000000FF,&H00{BRAND_PURPLE}&,&H00{BRAND_PURPLE}&,"
            f"-1,0,0,0,100,100,2,0,3,0,3,"
            f"7,30,30,90,1"
        )

        # Hook label — "DID YOU KNOW?" accent yellow, centered
        lines.append(
            f"Style: HookLabel,{SUBTITLE_FONT},48,"
            f"&H00{ACCENT_YELLOW}&,&H000000FF,{COLOR_BLACK},&H80000000,"
            f"0,1,0,0,100,100,8,0,1,5,2,"
            f"8,0,0,0,1"
        )

        # Hook title — huge white title, centered, with shadow
        lines.append(
            f"Style: HookTitle,{SUBTITLE_FONT},86,"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H80000000,"
            f"-1,0,0,0,100,100,0,0,1,6,3,"
            f"8,0,0,0,1"
        )

        # End-card label — "FOLLOW FOR MORE", white, centered
        lines.append(
            f"Style: EndCardLabel,{SUBTITLE_FONT},48,"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H80000000,"
            f"0,1,0,0,100,100,8,0,1,5,2,"
            f"8,0,0,0,1"
        )

        # End-card handle — big accent yellow, centered, bold
        lines.append(
            f"Style: EndCardHandle,{SUBTITLE_FONT},104,"
            f"&H00{ACCENT_YELLOW}&,&H000000FF,{COLOR_BLACK},&H80000000,"
            f"-1,0,0,0,100,100,0,0,1,7,3,"
            f"8,0,0,0,1"
        )

        # End-card hint — "Save this video" small white text
        lines.append(
            f"Style: EndCardHint,{SUBTITLE_FONT},40,"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H80000000,"
            f"0,1,0,0,100,100,4,0,1,4,2,"
            f"8,0,0,0,1"
        )

        # DimBackground — for drawing the dark overlay rectangle behind end-card
        # Uses BorderStyle=1 (just a placeholder; actual draw via \\p1 polygons)
        lines.append(
            f"Style: DimBG,{SUBTITLE_FONT},40,"
            f"{COLOR_BLACK},&H000000FF,{COLOR_BLACK},&H00000000,"
            f"0,0,0,0,100,100,0,0,1,0,0,"
            f"7,0,0,0,1"
        )

        # ProgressBar style — used for drawing-mode rectangles
        lines.append(
            f"Style: Progress,{SUBTITLE_FONT},20,"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H00000000,"
            f"0,0,0,0,100,100,0,0,1,0,0,"
            f"7,0,0,0,1"
        )

        lines.append("")
        lines.append("[Events]")
        lines.append(
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
        )

        # --------------------------------------------------------------
        # Layer 5: Progress bar (top), smooth per-frame via drawbox in ffmpeg
        # --------------------------------------------------------------
        # Progress bar is rendered by ffmpeg drawbox in _final_composite for smoothness.
        # Nothing emitted here.

        # --------------------------------------------------------------
        # Layer 0: End-card dim background (dark overlay rectangle)
        # --------------------------------------------------------------
        end_start = max(0.0, total_duration - ENDCARD_DURATION)
        end_end = total_duration
        # Filled dark rectangle, 60% transparent so the underlying video still shows
        lines.append(
            f"Dialogue: 0,{self._fmt(end_start)},{self._fmt(end_end)},"
            f"DimBG,,0,0,0,,{{\\p1\\1a&H60&\\1c{COLOR_BLACK}}}"
            f"m 0 0 l {WIDTH} 0 l {WIDTH} {HEIGHT} l 0 {HEIGHT}"
            f"{{\\p0}}"
        )

        # --------------------------------------------------------------
        # Layer 1: Hook title card (first HOOK_DURATION of scene 0)
        # --------------------------------------------------------------
        if scenes:
            hook_start = scene_offsets[0] if scene_offsets else 0.0
            hook_end = hook_start + HOOK_DURATION
            # Fade in 250ms, hold, fade out 350ms
            fi = 250
            fo = 350
            # "DID YOU KNOW?" label, slightly above center
            lines.append(
                f"Dialogue: 1,{self._fmt(hook_start)},{self._fmt(hook_end)},"
                f"HookLabel,,0,0,0,,"
                f"{{\\pos({WIDTH//2},720)\\fad({fi},{fo})\\1c&H00{ACCENT_YELLOW}&}}"
                f"DID YOU KNOW?"
            )
            # Topic title — wrapped to max 2 lines, centered just below label
            topic_wrapped = self._wrap_text(topic, max_chars=22, max_lines=2)
            topic_lines = topic_wrapped.split("\n")
            if len(topic_lines) == 1:
                title_y = 880
                topic_text = self._escape_ass(topic_lines[0])
            else:
                title_y = 870
                # Join with \N for ASS line break
                topic_text = "\\N".join(self._escape_ass(ln) for ln in topic_lines)

            # Scale-in from 0.85 → 1.0 over 350ms then hold
            lines.append(
                f"Dialogue: 1,{self._fmt(hook_start)},{self._fmt(hook_end)},"
                f"HookTitle,,0,0,0,,"
                f"{{\\pos({WIDTH//2},{title_y})\\fad({fi},{fo})"
                f"\\fscx85\\fscy85\\t(0,350,\\fscx100\\fscy100)}}"
                f"{topic_text}"
            )

        # --------------------------------------------------------------
        # Layer 2: Chapter badges per scene (skip first hook scene & last cta)
        # --------------------------------------------------------------
        for i, scene in enumerate(scenes):
            scene_type = (scene.get("scene_type") or "").lower()
            # Skip badge on first hook scene (title card already there)
            # and on last cta scene (end-card already there).
            if i == 0 and scene_type == "hook":
                continue
            if i == len(scenes) - 1 and scene_type == "cta":
                continue

            badge_label = self._badge_label(scene_type, i, len(scenes))
            if not badge_label:
                continue

            s_start = scene_offsets[i]
            s_end = s_start + min(BADGE_HOLD, scene_durations[i])
            fi = 200
            fo = 300

            # Use \an7 (top-left) anchor + \pos to place badge precisely.
            # Badge box position: x=40, y=110 (below progress bar at top)
            badge_text = self._escape_ass(badge_label)
            lines.append(
                f"Dialogue: 2,{self._fmt(s_start)},{self._fmt(s_end)},"
                f"Badge,,0,0,0,,"
                f"{{\\pos(50,120)\\fad({fi},{fo})\\an7}}"
                f"{badge_text}"
            )

        # --------------------------------------------------------------
        # Layer 3: End-card text (last ENDCARD_DURATION)
        # --------------------------------------------------------------
        if scenes and page_name:
            handle = page_name if page_name.startswith("@") else f"@{page_name}"
            handle_text = self._escape_ass(handle)
            # FOLLOW FOR MORE (top of end-card stack)
            lines.append(
                f"Dialogue: 3,{self._fmt(end_start)},{self._fmt(end_end)},"
                f"EndCardLabel,,0,0,0,,"
                f"{{\\pos({WIDTH//2},780)\\fad(300,300)}}FOLLOW FOR MORE"
            )
            # @handle — pulsing scale animation
            lines.append(
                f"Dialogue: 3,{self._fmt(end_start)},{self._fmt(end_end)},"
                f"EndCardHandle,,0,0,0,,"
                f"{{\\pos({WIDTH//2},920)\\fad(300,300)"
                f"\\t(0,800,\\fscx108\\fscy108)\\t(800,1600,\\fscx100\\fscy100)"
                f"\\t(1600,2400,\\fscx108\\fscy108)\\t(2400,3200,\\fscx100\\fscy100)}}"
                f"{handle_text}"
            )
            # Save this video hint
            lines.append(
                f"Dialogue: 3,{self._fmt(end_start)},{self._fmt(end_end)},"
                f"EndCardHint,,0,0,0,,"
                f"{{\\pos({WIDTH//2},1070)\\fad(500,300)}}Save this video for later"
            )

        # --------------------------------------------------------------
        # Layer 4: Word-pop subtitles (whole video)
        # --------------------------------------------------------------
        for scene_idx, (scene, words) in enumerate(zip(scenes, all_word_alignments)):
            if not words:
                continue

            scene_offset = scene_offsets[scene_idx]
            scene_words = [w["word"] for w in words]

            # Pre-wrap the scene's words into max 2 lines for cleaner display
            line_chunks = self._chunk_words_for_subtitle(scene_words, max_chars=28)

            for w_idx, active_word in enumerate(words):
                start_time = scene_offset + active_word["start"]
                end_time = scene_offset + active_word["end"]

                # Build the displayed text with the active word highlighted + pop
                # Each line is joined with \N; the active word is highlighted yellow
                # and scaled 110% via \t() for a subtle "pop" while spoken.
                rendered_lines = []
                for chunk in line_chunks:
                    parts = []
                    for word in chunk:
                        if word == scene_words[w_idx]:
                            parts.append(
                                f"{{\\c{COLOR_HIGHLIGHT}\\b1"
                                f"\\fscx100\\fscy100\\t(0,180,\\fscx112\\fscy112)}}"
                                f"{self._escape_ass(word)}"
                                f"{{\\c{COLOR_WHITE}\\b0\\fscx100\\fscy100}}"
                            )
                        else:
                            parts.append(f"{{\\c{COLOR_WHITE}}}{self._escape_ass(word)}")
                    rendered_lines.append(" ".join(parts))

                text_line = "\\N".join(rendered_lines)

                # Small fade-in/out (60ms in, 60ms out) for smoother visual rhythm
                lines.append(
                    f"Dialogue: 4,{self._fmt(start_time)},{self._fmt(end_time)},"
                    f"Subtitle,,0,0,0,,{{\\fad(60,60)}}{text_line}"
                )

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        logger.info(f"Engagement ASS compiled: {output_path} ({len(lines)} lines)")

    # ------------------------------------------------------------------
    # Final composite: burn ASS + progress bar + color grade + BGM
    # ------------------------------------------------------------------

    async def _final_composite(
        self,
        video_path: str,
        subtitle_path: str,
        bg_music_path: Optional[str],
        output_path: str,
        total_duration: float,
    ):
        """Burn engagement overlay + dynamic progress bar + vignette + grade,
        then mix background music if present.
        """
        has_bg_music = bg_music_path and os.path.exists(bg_music_path)

        # Copy ASS to a known-safe path (no colons in path on Linux is fine, but
        # the subtitles filter requires escaping for Windows-style paths; on Linux
        # we just need to escape colons inside filtergraph).
        safe_sub_path = subtitle_path
        escaped_sub_path = safe_sub_path.replace("\\", "\\\\").replace(":", "\\:")

        # Sub-expressions for the progress bar.
        # drawbox doesn't support eval=frame in our ffmpeg version, so we emit
        # one drawbox per second, each progressively wider and enabled from
        # that second onwards. They stack visually (last drawn wins) producing
        # a smoothly growing bar at 1Hz update rate.
        dur = max(total_duration, 0.1)
        num_steps = max(1, int(dur) + 1)
        bar_w_per_step = WIDTH / num_steps

        # Track (thin dark bar at top — full width, always visible)
        track = "drawbox=x=0:y=0:w=iw:h=6:color=0x000000@0.45:t=fill"

        # Build N filling drawboxes, each enabled from t=k onwards
        fill_parts = []
        for k in range(num_steps + 1):
            w = int(bar_w_per_step * k)
            if w < 1:
                continue
            fill_parts.append(
                f"drawbox=x=0:y=0:w={w}:h=6:color=0xFF3366@0.95:t=fill:"
                f"enable='gte(t,{k:.1f})'"
            )
        fill = ",".join(fill_parts)

        # Color grade: slight saturation + contrast boost
        grade = "eq=contrast=1.08:saturation=1.18:brightness=0.02:gamma=0.98"

        # Vignette: dark bands top & bottom to focus center + improve overlay readability
        vignette = (
            "drawbox=x=0:y=0:w=iw:h=180:color=0x000000@0.35:t=fill,"
            "drawbox=x=0:y=ih-260:w=iw:h=260:color=0x000000@0.45:t=fill"
        )

        # Build the video filter chain:
        # 1. color grade
        # 2. burn ASS subtitles (engagement overlay)
        # 3. vignette top/bottom bands
        # 4. progress bar track + fill
        filter_complex = (
            f"[0:v]{grade},"
            f"subtitles={escaped_sub_path},"
            f"{vignette},"
            f"{track},{fill}"
            f"[outv]"
        )

        subbed_path = output_path.replace(".mp4", "_overlay.mp4")
        cmd_overlay = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            subbed_path
        ]

        logger.info(f"Burning engagement overlay + progress bar + vignette")

        result = subprocess.run(cmd_overlay, capture_output=True, text=True, timeout=420)

        if result.returncode != 0:
            logger.error(f"Overlay burn failed: {result.stderr[:800]}")
            logger.warning("Falling back to video without overlay")
            subbed_path = video_path

        # Mix background music if present
        if has_bg_music and subbed_path != video_path:
            logger.info("Mixing background music with voiceover")
            filter_complex_audio = (
                f"[0:a]volume=1.0[speech];"
                f"[1:a]volume=0.10[bg];"
                f"[speech][bg]amix=inputs=2:duration=first:dropout_transition=3[outa]"
            )

            cmd_audio = [
                "ffmpeg", "-y",
                "-i", subbed_path,
                "-stream_loop", "-1",
                "-i", bg_music_path,
                "-filter_complex", filter_complex_audio,
                "-map", "0:v", "-map", "[outa]",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                output_path
            ]

            result = subprocess.run(cmd_audio, capture_output=True, text=True, timeout=300)

            if result.returncode != 0:
                logger.warning(f"Audio mixing failed: {result.stderr[:300]}")
                shutil.copy2(subbed_path, output_path)
            else:
                logger.info(f"Final composite with overlay + bgm: {output_path}")
                try:
                    os.remove(subbed_path)
                except Exception:
                    pass
                return

        elif subbed_path != video_path:
            shutil.copy2(subbed_path, output_path)
            try:
                os.remove(subbed_path)
            except Exception:
                pass
        else:
            shutil.copy2(video_path, output_path)

        logger.info(f"Final composite: {output_path}")

    # ------------------------------------------------------------------
    # Text helpers
    # ------------------------------------------------------------------

    def _wrap_text(self, text: str, max_chars: int = 24, max_lines: int = 2) -> str:
        """Greedy word-wrap text to at most `max_lines` lines of ~max_chars."""
        if not text:
            return ""
        words = text.split()
        if not words:
            return ""

        lines = []
        current = []
        current_len = 0
        for w in words:
            wlen = len(w) + (1 if current else 0)
            if current_len + wlen > max_chars and current:
                lines.append(" ".join(current))
                current = [w]
                current_len = len(w)
            else:
                current.append(w)
                current_len += wlen
        if current:
            lines.append(" ".join(current))

        if len(lines) > max_lines:
            # Merge overflow into last line (with ellipsis on first if very long)
            lines = lines[:max_lines]
            # Ensure last line ends cleanly (no ellipsis — topic is important)
        return "\n".join(lines)

    def _chunk_words_for_subtitle(
        self, words: List[str], max_chars: int = 28
    ) -> List[List[str]]:
        """Split a scene's word list into at most 2 display chunks for subtitles."""
        if not words:
            return [[]]
        chunks: List[List[str]] = []
        current: List[str] = []
        current_len = 0
        for w in words:
            wlen = len(w) + (1 if current else 0)
            if current_len + wlen > max_chars and current:
                chunks.append(current)
                current = [w]
                current_len = len(w)
            else:
                current.append(w)
                current_len += wlen
        if current:
            chunks.append(current)

        # Cap at 2 lines — keep first chunk as-is, merge the rest into one tail chunk
        if len(chunks) > 2:
            first = chunks[0]
            rest: List[str] = []
            for c in chunks[1:]:
                rest.extend(c)
            chunks = [first, rest]
        return chunks[:2]

    def _badge_label(self, scene_type: str, scene_idx: int, total_scenes: int) -> str:
        """Generate the chapter badge label for a scene."""
        t = (scene_type or "").lower()
        if t == "fact":
            return f"FACT {scene_idx}"
        if t == "story":
            return f"STORY {scene_idx}"
        if t == "insight":
            return f"INSIGHT {scene_idx}"
        if t == "hook":
            return "INTRO"
        if t == "cta":
            return "FINAL"
        # Default — numbered scene
        return f"PART {scene_idx + 1}"

    def _escape_ass(self, text: str) -> str:
        """Escape characters that have special meaning inside ASS dialogue text."""
        if text is None:
            return ""
        # Backslash first, then braces, then newlines (caller should use \N explicitly)
        out = text.replace("\\", "\\\\")
        out = out.replace("{", "\\{").replace("}", "\\}")
        # Colons / semicolons inside text are fine in ASS dialogue (only the
        # dialogue header fields care about them; the text field is the last field).
        return out

    def _fmt(self, seconds: float) -> str:
        """Format seconds to ASS timestamp: H:MM:SS.CC"""
        if seconds < 0:
            seconds = 0.0
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centis = int(round((seconds - int(seconds)) * 100))
        if centis == 100:
            centis = 0
            secs += 1
        return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"

    # Legacy alias kept for any external callers
    def _format_ass_time(self, seconds: float) -> str:
        return self._fmt(seconds)

    def _get_duration(self, path: str) -> float:
        """Get duration of a media file."""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", path
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                info = json.loads(result.stdout)
                return float(info.get("format", {}).get("duration", 3.0))
        except Exception:
            pass
        return 3.0
