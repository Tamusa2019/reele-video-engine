"""
Reele Video Engine v2 - Main FastAPI Application
A short-form video generation engine that creates viral Reels/TikTok/Shorts videos
with AI images, word-by-word subtitles, voiceover, and smooth transitions.
"""

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from services.llm_service import generate_scenes
from services.image_service import generate_scene_image
from services.tts_service import synthesize, get_audio_duration, get_available_voices
from services.align_service import align_words
from services.render_service import RenderService
from services.music_service import get_bg_music

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("reele")

# Global state
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/reele_output")
render_service = RenderService(output_dir=OUTPUT_DIR)
active_jobs = {}  # job_id -> status info


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    # Startup
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs("/tmp/reele_cache/images", exist_ok=True)
    os.makedirs("/tmp/reele_cache/tts", exist_ok=True)
    os.makedirs("/tmp/reele_cache/music", exist_ok=True)
    logger.info("🎬 Reele Video Engine v2 started")
    yield
    # Shutdown
    logger.info("🎬 Reele Video Engine v2 stopped")


app = FastAPI(
    title="Reele Video Engine v2",
    description="AI-powered short-form video generation engine",
    version="2.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── API Routes ───────────────────────────────────────────────────────────


@app.get("/")
async def root():
    """Serve the frontend UI."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Reele Video Engine v2</h1><p>Frontend not found</p>")


@app.post("/api/generate")
async def generate_video(
    topic: str = "amazing facts about the human brain",
    style: str = "energetic",
    voice: str = "bella",
    num_scenes: int = 5,
    add_music: bool = True
):
    """
    Generate a complete short-form video from a topic.
    This is the main pipeline endpoint.
    """
    job_id = str(uuid.uuid4())[:8]
    active_jobs[job_id] = {"status": "starting", "topic": topic}

    try:
        # Step 1: Generate scene script
        active_jobs[job_id]["status"] = "generating_script"
        logger.info(f"[{job_id}] Generating scenes for: {topic}")
        scenes = await generate_scenes(topic, style, num_scenes)
        logger.info(f"[{job_id}] Generated {len(scenes)} scenes")

        # Step 2: Generate images for each scene (in parallel)
        active_jobs[job_id]["status"] = "generating_images"
        image_tasks = []
        for scene in scenes:
            image_tasks.append(
                generate_scene_image(
                    scene["image_prompt"],
                    scene["scene_type"]
                )
            )
        scene_images = await asyncio.gather(*image_tasks, return_exceptions=True)

        # Handle any image generation failures
        valid_images = []
        for i, result in enumerate(scene_images):
            if isinstance(result, Exception):
                logger.error(f"[{job_id}] Image generation failed for scene {i}: {result}")
                # Fallback to gradient
                from services.image_service import _generate_gradient
                fallback = _generate_gradient(
                    f"/tmp/reele_cache/images/fallback_{i}.png",
                    scenes[i]["scene_type"]
                )
                valid_images.append(fallback)
            else:
                valid_images.append(result)

        logger.info(f"[{job_id}] Generated {len(valid_images)} images")

        # Step 3: Generate voiceover for each scene
        active_jobs[job_id]["status"] = "generating_voiceover"
        audio_tasks = []
        for scene in scenes:
            audio_tasks.append(
                synthesize(scene["text"], voice_key=voice)
            )
        scene_audios = await asyncio.gather(*audio_tasks, return_exceptions=True)

        # Handle TTS failures
        valid_audios = []
        for i, result in enumerate(scene_audios):
            if isinstance(result, Exception):
                logger.error(f"[{job_id}] TTS failed for scene {i}: {result}")
                # Fallback to silent audio
                from services.tts_service import _generate_silent_audio
                fallback = _generate_silent_audio(
                    f"/tmp/reele_cache/tts/silent_{i}.mp3", duration=4.0
                )
                valid_audios.append(fallback)
            else:
                valid_audios.append(result)

        logger.info(f"[{job_id}] Generated {len(valid_audios)} audio files")

        # Step 4: Align words for subtitles
        active_jobs[job_id]["status"] = "aligning_subtitles"
        word_alignments = []
        for i, (scene, audio_path) in enumerate(zip(scenes, valid_audios)):
            words = align_words(audio_path, scene["text"])
            word_alignments.append(words)

        # Step 5: Get background music
        bg_music = None
        if add_music:
            try:
                bg_music = get_bg_music(style)
            except Exception as e:
                logger.warning(f"[{job_id}] BGM generation failed: {e}")

        # Step 6: Render the final video
        active_jobs[job_id]["status"] = "rendering"
        output_path = await render_service.render_video(
            scenes=scenes,
            scene_images=valid_images,
            scene_audios=valid_audios,
            scene_word_alignments=word_alignments,
            bg_music_path=bg_music
        )

        active_jobs[job_id]["status"] = "complete"
        active_jobs[job_id]["output"] = output_path

        filename = os.path.basename(output_path)
        return {
            "job_id": job_id,
            "status": "complete",
            "video_url": f"/api/video/{filename}",
            "scenes": scenes,
            "num_scenes": len(scenes)
        }

    except Exception as e:
        logger.error(f"[{job_id}] Video generation failed: {e}", exc_info=True)
        active_jobs[job_id]["status"] = "failed"
        active_jobs[job_id]["error"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/video/{filename}")
async def get_video(filename: str):
    """Serve a generated video file."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(
        filepath,
        media_type="video/mp4",
        filename=filename,
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@app.get("/api/voices")
async def list_voices():
    """List available TTS voices."""
    return {"voices": get_available_voices()}


@app.get("/api/status/{job_id}")
async def job_status(job_id: str):
    """Get the status of a video generation job."""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return active_jobs[job_id]


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "output_dir": OUTPUT_DIR,
        "ffmpeg": _check_ffmpeg()
    }


def _check_ffmpeg() -> bool:
    """Check if FFmpeg is available."""
    import subprocess
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


# Mount static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
