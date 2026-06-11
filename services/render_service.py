"""
Render Service - FFmpeg video composition pipeline.
Handles scene rendering, crossfade transitions, ASS subtitles, and final composition.
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

# Video dimensions
WIDTH = 1080
HEIGHT = 1920

# Transition settings
CROSSFADE_DURATION = 0.5  # seconds

# Font settings for ASS subtitles - use DejaVu Sans which is widely available
SUBTITLE_FONT = "DejaVu Sans"
SUBTITLE_SIZE = 72
SUBTITLE_OUTLINE = 6
SUBTITLE_MARGIN_V = 200  # from bottom

# Colors
COLOR_WHITE = "&H00FFFFFF"
COLOR_HIGHLIGHT = "&H00FFFF"  # Cyan highlight for active word
COLOR_BLACK = "&H000000"


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
        progress_callback=None
    ) -> str:
        """
        Render the final video from all scene components.

        Pipeline:
        1. Create video clips from images (with Ken Burns zoom effect)
        2. Add per-scene audio
        3. Concatenate with crossfade transitions
        4. Compile ASS subtitles from word alignments
        5. Final composite: video + voiceover + bg music (with ducking) + subtitles

        Returns path to the final video file.
        """
        job_dir = tempfile.mkdtemp(prefix="reele_render_", dir=self.output_dir)

        try:
            # Step 1: Get scene durations from audio
            scene_durations = []
            for audio_path in scene_audios:
                dur = self._get_duration(audio_path)
                scene_durations.append(max(dur, 2.0))  # Minimum 2 seconds per scene

            logger.info(f"Scene durations: {scene_durations}")

            if progress_callback:
                await progress_callback(10, "Creating scene video clips...")

            # Step 2: Create individual scene video clips (image + Ken Burns + audio)
            scene_videos = []
            for i, (img_path, audio_path, duration) in enumerate(
                zip(scene_images, scene_audios, scene_durations)
            ):
                video_path = os.path.join(job_dir, f"scene_{i:02d}.mp4")
                await self._create_scene_video(
                    img_path, audio_path, duration, video_path
                )
                scene_videos.append(video_path)

                if progress_callback:
                    pct = 10 + int(40 * (i + 1) / len(scene_videos))
                    await progress_callback(pct, f"Rendered scene {i+1}/{len(scene_videos)}")

            if progress_callback:
                await progress_callback(55, "Adding transitions...")

            # Step 3: Concatenate with crossfade transitions
            if len(scene_videos) > 1:
                concat_video = os.path.join(job_dir, "concat_video.mp4")
                await self._concatenate_with_crossfade(scene_videos, scene_durations, concat_video)
            else:
                concat_video = scene_videos[0]

            if progress_callback:
                await progress_callback(70, "Generating subtitles...")

            # Step 4: Compile ASS subtitles
            subtitle_path = os.path.join(job_dir, "subtitles.ass")
            self._compile_ass_subtitles(
                scenes, scene_word_alignments, scene_durations, subtitle_path
            )

            if progress_callback:
                await progress_callback(80, "Final composition...")

            # Step 5: Final composite
            final_path = os.path.join(job_dir, "final_video.mp4")
            await self._final_composite(
                concat_video, subtitle_path, bg_music_path, final_path
            )

            if progress_callback:
                await progress_callback(95, "Finalizing...")

            # Copy to output directory with unique name
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
            # Clean up temp directory after copying final output
            # Keep temp dir for debugging if needed
            pass

    async def _create_scene_video(
        self,
        image_path: str,
        audio_path: str,
        duration: float,
        output_path: str
    ):
        """
        Create a video clip from an image + audio.
        Uses static image loop by default (fast). Set ENABLE_KEN_BURNS env var for zoom effect.
        All clips are encoded with uniform parameters for seamless xfade transitions.
        """
        fps = 30
        iw = WIDTH
        ih = HEIGHT
        use_ken_burns = os.environ.get("ENABLE_KEN_BURNS", "0") == "1"

        if use_ken_burns:
            # Ken Burns slow zoom - looks great but CPU intensive
            total_frames = int(duration * fps)
            zoompan_filter = (
                f"zoompan=z='min(zoom+0.0003,1.12)':"
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
                logger.info(f"Scene video (Ken Burns) created: {output_path}")
                return
            logger.warning(f"Ken Burns failed, using simple loop: {result.stderr[:200]}")

        # Default: simple static image loop - fast and reliable
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
        """
        Concatenate video clips with crossfade transitions between them.
        Uses FFmpeg xfade filter for smooth transitions.
        """
        if len(video_paths) <= 1:
            shutil.copy2(video_paths[0], output_path)
            return

        num_videos = len(video_paths)
        fade_dur = CROSSFADE_DURATION

        # Build input arguments
        inputs = []
        for vp in video_paths:
            inputs.extend(["-i", vp])

        # Calculate offsets for xfade chain
        # For chained xfade: offset is relative to the current (accumulated) video length
        # After each xfade, the accumulated duration = prev_accum + next_clip_dur - fade_dur
        # The offset for the next xfade = prev_accum - fade_dur
        offsets = []
        accumulated_dur = durations[0]
        for i in range(num_videos - 1):
            if i == 0:
                offsets.append(max(0, durations[0] - fade_dur))
            else:
                offsets.append(max(0, accumulated_dur - fade_dur))
            accumulated_dur = accumulated_dur + durations[i + 1] - fade_dur

        # Build filter_complex
        filter_parts = []
        audio_filter_parts = []

        if num_videos == 2:
            filter_parts.append(
                f"[0:v][1:v]xfade=transition=fade:duration={fade_dur}:offset={offsets[0]:.2f}[vout]"
            )
            audio_filter_parts.append(
                f"[0:a][1:a]acrossfade=d={fade_dur}[aout]"
            )
        else:
            # Chain: v0 xfade v1 -> v0, v0 xfade v2 -> v1, etc.
            prev_vlabel = "0:v"
            prev_alabel = "0:a"
            for i in range(num_videos - 1):
                if i < num_videos - 2:
                    out_vlabel = f"v{i}"
                    out_alabel = f"a{i}"
                    filter_parts.append(
                        f"[{prev_vlabel}][{i+1}:v]xfade=transition=fade:duration={fade_dur}:offset={offsets[i]:.2f}[{out_vlabel}]"
                    )
                    audio_filter_parts.append(
                        f"[{prev_alabel}][{i+1}:a]acrossfade=d={fade_dur}[{out_alabel}]"
                    )
                    prev_vlabel = out_vlabel
                    prev_alabel = out_alabel
                else:
                    filter_parts.append(
                        f"[{prev_vlabel}][{i+1}:v]xfade=transition=fade:duration={fade_dur}:offset={offsets[i]:.2f}[vout]"
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
            # Fallback: simple concat without transitions
            logger.info("Falling back to simple concat...")
            await self._simple_concat(video_paths, output_path)
            return

        logger.info(f"Crossfade concat complete: {output_path}")

    async def _simple_concat(self, video_paths: List[str], output_path: str):
        """Simple concatenation without transitions as fallback."""
        # First, re-encode all videos to uniform parameters
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

        # Concat using concat demuxer
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
        """
        Compile ASS subtitle file with word-by-word highlighting.
        For each word in a scene, creates a dialogue event showing the full sentence
        with the current word highlighted in a different color.

        This creates the popular "Hormozi-style" kinetic subtitle effect.
        """
        lines = []

        # ASS Header
        lines.append("[Script Info]")
        lines.append("Title: Reele Video Engine Subtitles")
        lines.append("ScriptType: v4.00+")
        lines.append(f"PlayResX: {WIDTH}")
        lines.append(f"PlayResY: {HEIGHT}")
        lines.append("WrapStyle: 0")
        lines.append("ScaledBorderAndShadow: yes")
        lines.append("")

        # Styles
        lines.append("[V4+ Styles]")
        lines.append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")

        # Default style - large white text with thick black outline
        lines.append(
            f"Style: Default,{SUBTITLE_FONT},{SUBTITLE_SIZE},"
            f"{COLOR_WHITE},&H000000FF,{COLOR_BLACK},&H00000000,"
            f"-1,0,0,0,100,100,0,0,1,"
            f"{SUBTITLE_OUTLINE},2,2,"
            f"50,50,{SUBTITLE_MARGIN_V},1"
        )
        lines.append("")

        # Events
        lines.append("[Events]")
        lines.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

        # Calculate scene start offsets (accounting for crossfade overlaps)
        scene_offsets = []
        accumulated = 0.0
        for i, dur in enumerate(scene_durations):
            scene_offsets.append(accumulated)
            if i > 0:
                accumulated += dur - CROSSFADE_DURATION
            else:
                accumulated += dur

        # Generate subtitle events
        for scene_idx, (scene, words) in enumerate(zip(scenes, all_word_alignments)):
            if not words:
                continue

            scene_text = scene.get("text", "")
            scene_words = [w["word"] for w in words]
            scene_offset = scene_offsets[scene_idx]

            # For each word, create a dialogue event highlighting that word
            for w_idx, active_word in enumerate(words):
                start_time = scene_offset + active_word["start"]
                end_time = scene_offset + active_word["end"]

                # Build the styled text line with the active word highlighted
                styled_words = []
                for idx, word in enumerate(scene_words):
                    if idx == w_idx:
                        # Active word: highlighted color + slight size increase
                        styled_words.append(
                            f"{{\\c{COLOR_HIGHLIGHT}\\b1}}{word}{{\\c{COLOR_WHITE}\\b0}}"
                        )
                    else:
                        styled_words.append(f"{{\\c{COLOR_WHITE}}}{word}")

                text_line = " ".join(styled_words)

                # Format timestamps
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
        """
        Final composition: video + voiceover + subtitles + background music with ducking.
        Uses sidechain compression for professional audio ducking.
        """
        has_bg_music = bg_music_path and os.path.exists(bg_music_path)

        # Escape the subtitle path for ffmpeg filter (escape colons and backslashes)
        escaped_sub_path = subtitle_path.replace("\\", "\\\\\\\\").replace(":", "\\\\:")

        if has_bg_music:
            # Professional audio mixing with sidechain compression
            # Voice stays at full volume, music ducks when voice is active
            filter_complex = (
                f"[0:a]volume=1.0[speech];"
                f"[1:a]volume=0.08[bg];"
                f"[speech][bg]sidechaincompress=threshold=0.15:ratio=12:level_in=1.0:level_out=1.0[outa];"
                f"[0:v]subtitles='{escaped_sub_path}'[outv]"
            )

            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,                    # 0: video + voiceover
                "-stream_loop", "-1",
                "-i", bg_music_path,                  # 1: bg music (looped)
                "-filter_complex", filter_complex,
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "21",
                "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                "-shortest",
                output_path
            ]
        else:
            # No background music - just video + subtitles + voiceover
            filter_complex = f"[0:v]subtitles='{escaped_sub_path}'[outv]"

            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-filter_complex", filter_complex,
                "-map", "[outv]", "-map", "0:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "21",
                "-c:a", "aac", "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                output_path
            ]

        logger.info(f"Final composite: bgm={has_bg_music}, subs={subtitle_path}")

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            logger.error(f"Final composite failed: {result.stderr[:500]}")

            # Try with ass= filter instead of subtitles=
            logger.warning("Trying with ass= filter...")
            try:
                if has_bg_music:
                    filter_complex = (
                        f"[0:a]volume=1.0[speech];"
                        f"[1:a]volume=0.08[bg];"
                        f"[speech][bg]sidechaincompress=threshold=0.15:ratio=12:level_in=1.0:level_out=1.0[outa];"
                        f"[0:v]ass={escaped_sub_path}[outv]"
                    )
                    cmd = [
                        "ffmpeg", "-y",
                        "-i", video_path,
                        "-stream_loop", "-1",
                        "-i", bg_music_path,
                        "-filter_complex", filter_complex,
                        "-map", "[outv]", "-map", "[outa]",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "21",
                        "-c:a", "aac", "-b:a", "192k",
                        "-pix_fmt", "yuv420p",
                        "-shortest",
                        output_path
                    ]
                else:
                    filter_complex = f"[0:v]ass={escaped_sub_path}[outv]"
                    cmd = [
                        "ffmpeg", "-y",
                        "-i", video_path,
                        "-filter_complex", filter_complex,
                        "-map", "[outv]", "-map", "0:a",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "21",
                        "-c:a", "aac", "-b:a", "192k",
                        "-pix_fmt", "yuv420p",
                        output_path
                    ]

                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if result.returncode == 0:
                    logger.info(f"Final composite with ass= succeeded: {output_path}")
                    return
                else:
                    logger.warning(f"ass= filter also failed: {result.stderr[:300]}")
            except Exception as e:
                logger.warning(f"ass= filter attempt error: {e}")

            # Last resort: just copy the video without subtitles
            logger.warning("All subtitle methods failed, copying video without subtitles...")
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
