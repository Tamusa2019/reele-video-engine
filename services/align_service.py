"""
Alignment Service - Word-level timestamp alignment for subtitles.
Uses faster-whisper for accurate alignment, with linear heuristic fallback.
"""

import logging
import os
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        logger.info("Loading faster-whisper tiny model...")
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
        logger.info("Whisper model loaded.")
    return _whisper_model


def align_words(
    audio_path: str,
    text: str,
    start_offset: float = 0.0
) -> List[Dict]:
    """Align words in text to audio timestamps."""
    if not os.path.exists(audio_path):
        logger.warning(f"Audio file not found: {audio_path}, using linear alignment")
        return _linear_align(text, 3.0, start_offset)

    duration = _get_audio_duration(audio_path)
    if duration <= 0:
        duration = 3.0

    try:
        words = _whisper_align(audio_path, text, start_offset)
        if words and len(words) > 0:
            return words
    except Exception as e:
        logger.warning(f"Whisper alignment failed: {e}, using linear fallback")

    return _linear_align(text, duration, start_offset)


def _whisper_align(audio_path: str, text: str, start_offset: float) -> Optional[List[Dict]]:
    """Use faster-whisper for word-level alignment."""
    model = _get_whisper_model()

    segments, info = model.transcribe(audio_path, word_timestamps=True)

    aligned_words = []
    for segment in segments:
        for w in segment.words:
            word = w.word.strip()
            if word:
                aligned_words.append({
                    "word": word,
                    "start": round(start_offset + w.start, 2),
                    "end": round(start_offset + w.end, 2)
                })

    return aligned_words if aligned_words else None


def _linear_align(text: str, duration: float, start_offset: float) -> List[Dict]:
    """Simple linear word alignment as fallback."""
    import re
    words = re.findall(r'\S+', text)
    if not words:
        return []

    pad_start = 0.3
    pad_end = 0.2
    effective_duration = duration - pad_start - pad_end

    if effective_duration <= 0:
        effective_duration = duration

    word_duration = effective_duration / len(words)

    aligned = []
    for idx, word in enumerate(words):
        w_start = start_offset + pad_start + (idx * word_duration)
        w_end = w_start + word_duration
        aligned.append({
            "word": word,
            "start": round(w_start, 2),
            "end": round(w_end, 2)
        })

    return aligned


def _get_audio_duration(path: str) -> float:
    """Get audio file duration."""
    import subprocess
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
