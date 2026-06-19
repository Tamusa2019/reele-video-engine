"""
Reele Video Engine v2 - Main FastAPI Application
AI-powered short-form video generation engine with per-scene images and branding.
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

from services.llm_service import generate_scenes, generate_facebook_caption
from services.image_service import generate_scene_image
from services.tts_service import synthesize, get_audio_duration, get_available_voices
from services.align_service import align_words
from services.render_service import RenderService
from services.music_service import get_bg_music
from services.branding_service import apply_branding, create_default_logo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("reele")

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp/reele_output")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/reele_uploads")
render_service = RenderService(output_dir=OUTPUT_DIR)
active_jobs = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs("/tmp/reele_cache/images", exist_ok=True)
    os.makedirs("/tmp/reele_cache/tts", exist_ok=True)
    os.makedirs("/tmp/reele_cache/music", exist_ok=True)
    os.makedirs("/tmp/reele_cache/logos", exist_ok=True)
    logger.info("Reele Video Engine v2.1 started")
    yield
    logger.info("Reele Video Engine v2.1 stopped")


app = FastAPI(
    title="Reele Video Engine v2",
    description="AI-powered short-form video generation engine with per-scene images and branding",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Reele Video Engine v2</h1><p>Frontend not found</p>")


@app.api_route("/api/generate", methods=["GET", "POST"])
async def generate_video(
    topic: str = "amazing facts about the human brain",
    style: str = "energetic",
    voice: str = "bella",
    num_scenes: int = 5,
    add_music: bool = True,
    watermark_text: str = "",
    page_name: str = "",
    logo_url: str = ""
):
    """Generate a complete short-form video from a topic."""
    job_id = str(uuid.uuid4())[:8]
    active_jobs[job_id] = {"status": "starting", "topic": topic}

    try:
        # Step 1: Generate scene script (topic-specific)
        active_jobs[job_id]["status"] = "generating_script"
        logger.info(f"[{job_id}] Generating scenes for: {topic}")
        scenes = await generate_scenes(topic, style, num_scenes)
        logger.info(f"[{job_id}] Generated {len(scenes)} scenes. First scene text: {scenes[0].get('text', '')[:80]}")

        # Step 2: Generate AI images for each scene
        active_jobs[job_id]["status"] = "generating_images"
        image_tasks = []
        for i, scene in enumerate(scenes):
            image_tasks.append(
                generate_scene_image(
                    scene["image_prompt"],
                    scene["scene_type"],
                    scene_number=i + 1
                )
            )
        scene_images = await asyncio.gather(*image_tasks, return_exceptions=True)

        valid_images = []
        for i, result in enumerate(scene_images):
            if isinstance(result, Exception):
                logger.error(f"[{job_id}] Image generation failed for scene {i}: {result}")
                from services.image_service import _generate_gradient
                fallback = _generate_gradient(
                    f"/tmp/reele_cache/images/fallback_{job_id}_{i}.jpg",
                    scenes[i]["scene_type"],
                    scene_number=i + 1
                )
                valid_images.append(fallback)
            else:
                valid_images.append(result)

        logger.info(f"[{job_id}] Generated {len(valid_images)} unique scene images")

        # Step 3: Generate voiceover
        active_jobs[job_id]["status"] = "generating_voiceover"
        audio_tasks = []
        for scene in scenes:
            audio_tasks.append(
                synthesize(scene["text"], voice_key=voice)
            )
        scene_audios = await asyncio.gather(*audio_tasks, return_exceptions=True)

        valid_audios = []
        for i, result in enumerate(scene_audios):
            if isinstance(result, Exception):
                logger.error(f"[{job_id}] TTS failed for scene {i}: {result}")
                from services.tts_service import _generate_silent_audio
                fallback = _generate_silent_audio(
                    f"/tmp/reele_cache/tts/silent_{job_id}_{i}.mp3", duration=4.0
                )
                valid_audios.append(fallback)
            else:
                valid_audios.append(result)

        logger.info(f"[{job_id}] Generated {len(valid_audios)} audio files")

        # Step 4: Align words
        active_jobs[job_id]["status"] = "aligning_subtitles"
        word_alignments = []
        for i, (scene, audio_path) in enumerate(zip(scenes, valid_audios)):
            words = align_words(audio_path, scene["text"])
            word_alignments.append(words)

        # Step 5: Background music
        bg_music = None
        if add_music:
            try:
                bg_music = get_bg_music(style)
            except Exception as e:
                logger.warning(f"[{job_id}] BGM generation failed: {e}")

        # Step 6: Branding
        logo_path = None
        actual_watermark = watermark_text

        if page_name and not actual_watermark:
            actual_watermark = f"@{page_name}"
        elif page_name and actual_watermark:
            actual_watermark = f"{actual_watermark} | @{page_name}"
        elif not actual_watermark and not page_name:
            # Default branding: always show a pill so the video feels branded
            actual_watermark = "@reele"

        if logo_url:
            logo_path = await _download_logo(logo_url, job_id)
        elif page_name:
            try:
                logo_path = create_default_logo(
                    page_name,
                    f"/tmp/reele_cache/logos/{job_id}_logo.png"
                )
            except Exception as e:
                logger.warning(f"[{job_id}] Default logo creation failed: {e}")

        # Step 7: Render
        active_jobs[job_id]["status"] = "rendering"
        output_path = await render_service.render_video(
            scenes=scenes,
            scene_images=valid_images,
            scene_audios=valid_audios,
            scene_word_alignments=word_alignments,
            bg_music_path=bg_music,
            watermark_text=actual_watermark,
            logo_path=logo_path,
            page_name=page_name,
            topic=topic,
        )

        # Step 8: Facebook caption
        active_jobs[job_id]["status"] = "generating_caption"
        caption_data = await generate_facebook_caption(
            topic=topic,
            scenes=scenes,
            style=style,
            page_name=page_name,
        )

        active_jobs[job_id]["status"] = "complete"
        active_jobs[job_id]["output"] = output_path

        filename = os.path.basename(output_path)
        return {
            "job_id": job_id,
            "status": "complete",
            "video_url": f"/api/video/{filename}",
            "scenes": scenes,
            "scene_images": valid_images,
            "num_scenes": len(scenes),
            "caption": caption_data,
            "branding": {
                "watermark": actual_watermark,
                "page_name": page_name,
                "has_logo": logo_path is not None,
            }
        }

    except Exception as e:
        logger.error(f"[{job_id}] Video generation failed: {e}", exc_info=True)
        active_jobs[job_id]["status"] = "failed"
        active_jobs[job_id]["error"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/diagnose")
async def diagnose():
    """Diagnostic endpoint to verify deployed code version."""
    from services import llm_service
    has_topic_scenes = hasattr(llm_service, '_generate_topic_scenes')
    has_mock = hasattr(llm_service, '_generate_mock')
    has_get_topic_facts = hasattr(llm_service, '_get_topic_facts')

    try:
        test_scenes = await llm_service.generate_scenes(
            'why mosquitoes prefer you over your friend',
            'energetic',
            3
        )
        first_scene_text = test_scenes[0].get('text', '') if test_scenes else 'EMPTY'
        is_topic_specific = 'mosquit' in first_scene_text.lower()
    except Exception as e:
        first_scene_text = f'ERROR: {e}'
        is_topic_specific = False

    return {
        "version": "2.1.0",
        "has_topic_scenes_function": has_topic_scenes,
        "has_mock_function": has_mock,
        "has_get_topic_facts_function": has_get_topic_facts,
        "test_topic": "why mosquitoes prefer you over your friend",
        "test_first_scene": first_scene_text,
        "is_topic_specific": is_topic_specific,
        "gemini_api_key_set": bool(os.environ.get("GEMINI_API_KEY", "")),
    }


@app.post("/api/caption")
async def generate_caption_only(
    topic: str = "",
    scenes: str = "[]",
    style: str = "energetic",
    page_name: str = ""
):
    """Generate a Facebook caption for a topic/scenes without generating a video."""
    try:
        scene_list = json.loads(scenes) if scenes else []
        result = await generate_facebook_caption(
            topic=topic,
            scenes=scene_list,
            style=style,
            page_name=page_name,
        )
        return result
    except Exception as e:
        logger.error(f"Caption generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    """Upload a logo image for branding."""
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        file_ext = os.path.splitext(file.filename or "logo.png")[1]
        logo_filename = f"logo_{uuid.uuid4().hex[:8]}{file_ext}"
        logo_path = os.path.join(UPLOAD_DIR, logo_filename)

        content = await file.read()
        with open(logo_path, "wb") as f:
            f.write(content)

        logger.info(f"Logo uploaded: {logo_path} ({len(content)} bytes)")
        return {
            "logo_url": f"/api/logo/{logo_filename}",
            "filename": logo_filename
        }
    except Exception as e:
        logger.error(f"Logo upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/logo/{filename}")
async def get_logo(filename: str):
    """Serve an uploaded logo file."""
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(filepath)


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
        "version": "2.1.0",
        "output_dir": OUTPUT_DIR,
        "ffmpeg": _check_ffmpeg()
    }


async def _download_logo(url: str, job_id: str) -> Optional[str]:
    """Download a logo image from a URL."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code == 200 and len(response.content) > 100:
                ext = ".png"
                if "jpeg" in response.headers.get("content-type", ""):
                    ext = ".jpg"
                logo_path = f"/tmp/reele_cache/logos/{job_id}_downloaded{ext}"
                with open(logo_path, "wb") as f:
                    f.write(response.content)
                logger.info(f"Downloaded logo: {logo_path}")
                return logo_path
    except Exception as e:
        logger.warning(f"Logo download failed: {e}")
    return None


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


static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
