"""
LLM Service - Generates structured scene data from a topic/prompt.
Uses Google Gemini (free tier) with a mock fallback.
"""

import json
import re
import os
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Scene type templates for structured output
SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "scene_number": {"type": "integer"},
        "scene_type": {"type": "string", "enum": ["hook", "fact", "story", "insight", "cta"]},
        "text": {"type": "string", "description": "Narration text (1-2 sentences, punchy, conversational)"},
        "image_prompt": {"type": "string", "description": "Detailed visual prompt for AI image generation"},
        "search_query": {"type": "string", "description": "Short keywords for stock video search fallback"},
        "duration_hint": {"type": "number", "description": "Suggested seconds (3-8)"}
    }
}

SYSTEM_PROMPT = """You are a viral short-form video scriptwriter. Given a topic, you create engaging 4-6 scene scripts optimized for TikTok/Reels/Shorts.

Rules:
- Hook scene: Bold, attention-grabbing opening that stops the scroll
- Fact/Story scenes: Deliver value quickly, one idea per scene
- CTA scene: End with a compelling call to action
- Each scene text should be 1-2 short sentences, conversational and punchy
- Image prompts should be vivid, specific, and cinematic (describe lighting, mood, composition)
- Duration hints: hook=3-4s, facts=4-6s, story=5-7s, insight=4-5s, CTA=3-4s

Return ONLY valid JSON, no markdown fences."""

MOCK_SCRIPTS = {
    "default": [
        {
            "scene_number": 1,
            "scene_type": "hook",
            "text": "You won't believe what scientists just discovered about the human brain.",
            "image_prompt": "dramatic close-up of a glowing human brain with electric neural connections pulsing in neon blue and purple, dark background, cinematic lighting, 4K quality",
            "search_query": "brain neural connections",
            "duration_hint": 4
        },
        {
            "scene_number": 2,
            "scene_type": "fact",
            "text": "Your brain generates enough electricity to power a small light bulb. Every single thought you have is literally a spark of energy.",
            "image_prompt": "vintage light bulb glowing brightly in a dark room with electric sparks and energy flowing from a human silhouette in the background, warm golden lighting, dramatic composition",
            "search_query": "light bulb energy electricity",
            "duration_hint": 5
        },
        {
            "scene_number": 3,
            "scene_type": "fact",
            "text": "Scientists found that your brain makes decisions up to 7 seconds before you're even aware of them. Your subconscious is running the show.",
            "image_prompt": "abstract visualization of time and decision-making with floating clock faces and neural pathways, deep blue and gold color palette, surreal dreamlike atmosphere",
            "search_query": "time decision subconscious",
            "duration_hint": 6
        },
        {
            "scene_number": 4,
            "scene_type": "insight",
            "text": "This means every habit you form is literally rewiring your brain. The question is: are you wiring it on purpose or by accident?",
            "image_prompt": "person meditating with visible golden neural network patterns radiating from their head, serene sunset background, inspirational atmosphere, cinematic composition",
            "search_query": "meditation mindfulness brain",
            "duration_hint": 6
        },
        {
            "scene_number": 5,
            "scene_type": "cta",
            "text": "Follow for more mind-blowing science facts that will change how you see yourself. Share this with someone who needs to know.",
            "image_prompt": "dramatic futuristic brain hologram floating above human hands reaching toward it, vibrant cyan and magenta lights, sci-fi aesthetic, inspiring and awe-inspiring",
            "search_query": "futuristic technology hologram",
            "duration_hint": 4
        }
    ]
}


async def generate_scenes(topic: str, style: str = "energetic", num_scenes: int = 5) -> List[Dict]:
    """
    Generate structured scene data for a video from a topic.
    Tries Gemini API first, falls back to mock data.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")

    if api_key:
        try:
            return await _generate_with_gemini(topic, style, num_scenes, api_key)
        except Exception as e:
            logger.warning(f"Gemini API failed, using mock: {e}")

    return _generate_mock(topic, style, num_scenes)


async def _generate_with_gemini(topic: str, style: str, num_scenes: int, api_key: str) -> List[Dict]:
    """Generate scenes using Google Gemini API."""
    import httpx

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

    user_prompt = f"""Create a {num_scenes}-scene viral short-form video script about: "{topic}"
Style: {style}

Return a JSON array of scene objects with these fields:
- scene_number (int)
- scene_type (one of: hook, fact, story, insight, cta)
- text (narration, 1-2 punchy sentences)
- image_prompt (detailed cinematic visual description for AI image generation, include lighting, mood, composition)
- search_query (3-4 keywords for stock video search)
- duration_hint (3-8 seconds)

First scene must be a hook. Last scene must be a CTA. Return ONLY the JSON array."""

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": user_prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    scenes = json.loads(text)

    # Validate structure
    if not isinstance(scenes, list) or len(scenes) == 0:
        raise ValueError("Invalid scene data from LLM")

    for s in scenes:
        if "scene_type" not in s or "text" not in s or "image_prompt" not in s:
            raise ValueError("Missing required fields in scene data")

    logger.info(f"Generated {len(scenes)} scenes via Gemini for topic: {topic}")
    return scenes


def _generate_mock(topic: str, style: str, num_scenes: int) -> List[Dict]:
    """Generate mock scenes as fallback when no API key is available."""
    # Use default mock and adapt the topic
    base = MOCK_SCRIPTS["default"]

    # If we have enough scenes, return subset
    if len(base) >= num_scenes:
        return base[:num_scenes]

    # Otherwise extend with additional fact scenes
    while len(base) < num_scenes:
        idx = len(base)
        base.insert(idx - 1, {
            "scene_number": idx,
            "scene_type": "fact",
            "text": f"Here's something fascinating about {topic} that most people never realize.",
            "image_prompt": f"cinematic scene related to {topic}, dramatic lighting, 4K quality, professional photography",
            "search_query": topic.replace(" ", ""),
            "duration_hint": 5
        })
        # Re-number
        for i, s in enumerate(base):
            s["scene_number"] = i + 1

    return base[:num_scenes]
