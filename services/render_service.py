"""
Render Service - FFmpeg video composition pipeline.
Handles scene rendering, crossfade transitions, ASS subtitles, branding, and final composition.
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

SUBTITLE_FONT = "DejaVu Sans"
SUBTITLE_SIZE = 72
SUBTITLE_OUTLINE = 6
SUBTITLE_MARGIN_V = 200

COLOR_WHITE = "&H00FFFFFF"
COLOR_HIGHLIGHT = "&H00FFFF"
COLOR_BLACK = "&H00000000"


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
                await progress_callback(60, "Generating subtitles...")

            subtitle_path = "/tmp/reele_subs.ass"
            self._compile_ass_subtitles(
                scenes, scene_word_alignments, scene_durations, subtitle_path
            )

            if progress_callback:
                await progress_callback(70, "Final composition...")

            composite_path = os.path.join(job_dir, "composite_video.mp4")
            await self._final_composite(
                concat_video, subtitle_path, bg_music_path, composite_path
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

    async def _create_scene_video(
        self,
        image_path: str,
        audio_path: str,
        duration: float,
        output_path: str,
        scene_index: int = 0
    ):
        """Create a video clip from an image + audio with Ken Burns motion.

        Alternates between zoom-in and zoom-out per scene for visual variety.
        """
        fps = 30
        iw = WIDTH
        ih = HEIGHT
        # Enable Ken Burns by default for more dynamic video (was opt-in, now opt-out)
        use_ken_burns = os.environ.get("ENABLE_KEN_BURNS", "1") != "0"

        if use_ken_burns:
            total_frames = max(int(duration * fps), 30)
            # Alternate between zoom-in (even scenes) and zoom-out (odd scenes) for variety
            if scene_index % 2 == 0:
                # Zoom in: start at 1.0, end at 1.12
                zoom_expr = f"min(zoom+0.0005,1.15)"
                # Subtle pan from center
                x_expr = "iw/2-(iw/zoom/2)"
                y_expr = "ih/2-(ih/zoom/2)"
            else:
                # Zoom out: start at 1.15, end at 1.0
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

    async def _concatenate_with_crossfade(
        self,
        video_paths: List[str],
        durations: List[float],
        output_path: str
    ):
        """Concatenate video clips with varied crossfade transitions using xfade filter.

        Uses a different xfade transition per scene cut for visual variety:
        fade, slideleft, circleopen, wipeup, dissolve, etc.
        """
        if len(video_paths) <= 1:
            shutil.copy2(video_paths[0], output_path)
            return

        num_videos = len(video_paths)
        fade_dur = CROSSFADE_DURATION

        # Variety of transitions — cycled per scene cut
        transitions = [
            "fade",        # Classic crossfade
            "slideleft",   # Slide in from right
            "circleopen",  # Circle reveal
            "wipeup",      # Wipe upward
            "dissolve",    # Soft dissolve
            "slideright",  # Slide in from left
            "radial",      # Radial wipe
            "wipeleft",    # Wipe leftward
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

    def _compile_ass_subtitles(
        self,
        scenes: List[Dict],
        all_word_alignments: List[List[Dict]],
        scene_durations: List[float],
        output_path: str
    ):
        """Compile ASS subtitle file with word-by-word highlighting."""
        lines = []

        lines.append("[Script Info]")
        lines.append("Title: Reele Video Engine Subtitles")
        lines.append("ScriptType: v4.00+")
        lines.append(f"PlayResX: {WIDTH}")
        lines.append(f"PlayResY: {HEIGHT}")
        lines.append("WrapStyle: 0")
        lines.append("ScaledBorderAndShadow: yes")
        lines.append("")

        lines.append("[V4+ Styles]")
        lines.append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")

        lines.append(
            f"Style: Default,{SUBTITLE_FONT},{SUBTITLE_SIZE},"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H00000000,"
            f"-1,0,0,0,100,100,0,0,1,"
            f"{SUBTITLE_OUTLINE},2,2,"
            f"50,50,{SUBTITLE_MARGIN_V},1"
        )
        lines.append("")

        lines.append("[Events]")
        lines.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

        scene_offsets = []
        accumulated = 0.0
        for i, dur in enumerate(scene_durations):
            scene_offsets.append(accumulated)
            if i > 0:
                accumulated += dur - CROSSFADE_DURATION
            else:
                accumulated += dur

        for scene_idx, (scene, words) in enumerate(zip(scenes, all_word_alignments)):
            if not words:
                continue

            scene_text = scene.get("text", "")
            scene_words = [w["word"] for w in words]
            scene_offset = scene_offsets[scene_idx]

            for w_idx, active_word in enumerate(words):
                start_time = scene_offset + active_word["start"]
                end_time = scene_offset + active_word["end"]

                styled_words = []
                for idx, word in enumerate(scene_words):
                    if idx == w_idx:
                        styled_words.append(
                            f"{{\\c{COLOR_HIGHLIGHT}\\b1}}{word}{{\\c{COLOR_WHITE}\\b0}}"
                        )
                    else:
                        styled_words.append(f"{{\\c{COLOR_WHITE}}}{word}")

                text_line = " ".join(styled_words)

                start_str = self._format_ass_time(start_time)
                end_str = self._format_ass_time(end_time)

                lines.append(
                    f"Dialogue: 0,{start_str},{end_str},Default,,0000,0000,0000,,{text_line}"
                )

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        logger.info(f"ASS subtitles compiled: {output_path} ({len(lines)} lines)")

    async def _final_composite(
        self,
        video_path: str,
        subtitle_path: str,
        bg_music_path: Optional[str],
        output_path: str
    ):
        """Final composition: burn subtitles and mix background music."""
        has_bg_music = bg_music_path and os.path.exists(bg_music_path)

        safe_sub_path = "/tmp/reele_subs.ass"
        if subtitle_path != safe_sub_path and os.path.exists(subtitle_path):
            shutil.copy2(subtitle_path, safe_sub_path)

        escaped_sub_path = safe_sub_path.replace("\\", "\\\\").replace(":", "\\:")

        subbed_path = output_path.replace(".mp4", "_subbed.mp4")
        filter_complex = f"[0:v]subtitles={escaped_sub_path}[outv]"

        cmd_sub = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "0:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            subbed_path
        ]

        logger.info(f"Step 1: Burning subtitles from {safe_sub_path}")

        result = subprocess.run(cmd_sub, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            logger.error(f"Subtitle burn failed: {result.stderr[:500]}")
            logger.warning("Subtitle burn failed, using video without subtitles")
            subbed_path = video_path

        if has_bg_music and subbed_path != video_path:
            logger.info("Step 2: Mixing background music with voiceover")
            filter_complex_audio = (
                f"[0:a]volume=1.0[speech];"
                f"[1:a]volume=0.06[bg];"
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
                if subbed_path != video_path:
                    shutil.copy2(subbed_path, output_path)
                else:
                    shutil.copy2(video_path, output_path)
            else:
                logger.info(f"Final composite with subtitles + bgm: {output_path}")
                try:
                    os.remove(subbed_path)
                except:
                    pass
                return

        elif subbed_path != video_path:
            shutil.copy2(subbed_path, output_path)
            try:
                os.remove(subbed_path)
            except:
                pass
        else:
            shutil.copy2(video_path, output_path)

        logger.info(f"Final composite: {output_path}")

    def _format_ass_time(self, seconds: float) -> str:
        """Format seconds to ASS timestamp format: H:MM:SS.CC"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centis = int((seconds % 1) * 100)
        return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"

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
