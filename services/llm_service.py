"""
LLM Service - Generates structured scene data from a topic/prompt.
Uses Google Gemini (free tier) with a smart topic-aware mock fallback.
Also generates Facebook-optimized captions with hashtags.
"""

import json
import re
import os
import logging
import hashlib
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


async def generate_scenes(topic: str, style: str = "energetic", num_scenes: int = 5) -> List[Dict]:
    """
    Generate structured scene data for a video from a topic.
    Tries Gemini API first, falls back to topic-aware mock generation.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")

    if api_key:
        try:
            return await _generate_with_gemini(topic, style, num_scenes, api_key)
        except Exception as e:
            logger.warning(f"Gemini API failed, using smart mock: {e}")

    # Always generate topic-specific scenes
    return _generate_topic_scenes(topic, style, num_scenes)


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
- image_prompt (detailed cinematic visual description for AI image generation, include lighting, mood, composition, colors - make each scene's image prompt unique and visually distinct)
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

    if not isinstance(scenes, list) or len(scenes) == 0:
        raise ValueError("Invalid scene data from LLM")

    for s in scenes:
        if "scene_type" not in s or "text" not in s or "image_prompt" not in s:
            raise ValueError("Missing required fields in scene data")

    logger.info(f"Generated {len(scenes)} scenes via Gemini for topic: {topic}")
    return scenes


def _generate_topic_scenes(topic: str, style: str, num_scenes: int) -> List[Dict]:
    """
    Generate topic-specific scenes as fallback.
    Creates unique, topic-relevant content for ANY topic.
    """
    topic_facts = _get_topic_facts(topic)
    scenes = []

    # Scene 1: Hook
    hook_templates = [
        "You won't believe what scientists just discovered about {topic}.",
        "Here's something about {topic} that will completely change how you think.",
        "Stop scrolling - this fact about {topic} is going to blow your mind.",
        "Nobody talks about this, but {topic} has a secret that affects you daily.",
        "If you've ever wondered about {topic}, the answer is more wild than you think.",
    ]
    hook_idx = abs(hash(topic.lower().strip())) % len(hook_templates)
    hook_text = hook_templates[hook_idx].format(topic=topic)

    scenes.append({
        "scene_number": 1,
        "scene_type": "hook",
        "text": hook_text,
        "image_prompt": _generate_image_prompt(topic, "hook", 1),
        "search_query": "".join(topic.split()[:3]).lower(),
        "duration_hint": 4
    })

    # Middle scenes
    middle_count = num_scenes - 2
    for i in range(middle_count):
        fact_idx = i % len(topic_facts)
        fact_data = topic_facts[fact_idx]

        scene_type = "fact"
        if i == middle_count - 1 and middle_count > 1:
            scene_type = "insight"
        elif i == middle_count // 2 and middle_count > 2:
            scene_type = "story"

        scenes.append({
            "scene_number": i + 2,
            "scene_type": scene_type,
            "text": fact_data["text"],
            "image_prompt": _generate_image_prompt(topic, scene_type, i + 2),
            "search_query": fact_data.get("search_query", topic.replace(" ", "")),
            "duration_hint": 5 if scene_type == "fact" else 6
        })

    # Last scene: CTA
    cta_templates = [
        "Follow for more amazing facts about {topic} that will change your perspective. Share this with someone who needs to know!",
        "Want more incredible facts about {topic}? Hit follow and share this with a friend who'd love it!",
        "If this blew your mind, follow for more. There's so much more about {topic} that nobody tells you!",
        "Drop a comment if you learned something new! Follow for more {topic} content that'll make you the smartest person in the room.",
        "Share this with someone who always talks about {topic}! Follow for more content that makes you think differently.",
    ]
    cta_idx = abs(hash(topic.lower().strip() + "cta")) % len(cta_templates)
    cta_text = cta_templates[cta_idx].format(topic=topic)

    scenes.append({
        "scene_number": num_scenes,
        "scene_type": "cta",
        "text": cta_text,
        "image_prompt": _generate_image_prompt(topic, "cta", num_scenes),
        "search_query": "".join(topic.split()[:2]).lower(),
        "duration_hint": 4
    })

    for i, s in enumerate(scenes):
        s["scene_number"] = i + 1

    logger.info(f"Generated {len(scenes)} topic-specific scenes for: {topic}")
    return scenes


def _get_topic_facts(topic: str) -> List[Dict]:
    """Get topic-specific facts. Uses curated knowledge for common topics."""
    topic_lower = topic.lower().strip()

    curated = {
        "mosquito": [
            {"text": "Mosquitoes are attracted to carbon dioxide, and some people just exhale more of it than others. That's why they seem to target you specifically.", "search_query": "mosquito CO2 attraction"},
            {"text": "Your blood type matters more than you think. Type O blood attracts mosquitoes nearly twice as much as Type A. If you're Type O, you're their favorite meal.", "search_query": "mosquito blood type preference"},
            {"text": "The bacteria on your skin creates a unique scent signature. Some bacteria produce chemicals that mosquitoes absolutely love, making certain people irresistible to them.", "search_query": "skin bacteria mosquito attraction"},
            {"text": "Dark clothing makes you a bigger target. Mosquitoes use vision to find hosts, and dark colors stand out against the horizon. Wear light colors and you'll get fewer bites.", "search_query": "mosquito dark clothing attraction"},
            {"text": "Drinking just one beer can make you more attractive to mosquitoes. Alcohol raises your body temperature and changes your skin chemistry, making you a magnet for bites.", "search_query": "alcohol mosquito attraction"},
            {"text": "Pregnant women attract mosquitoes about twice as much as non-pregnant people. The extra body heat and CO2 output make them an irresistible target.", "search_query": "pregnancy mosquito attraction"},
        ],
        "brain": [
            {"text": "Your brain generates enough electricity to power a small light bulb. Every single thought you have is literally a spark of energy.", "search_query": "brain electricity power"},
            {"text": "Scientists found that your brain makes decisions up to 7 seconds before you're even aware of them. Your subconscious is running the show.", "search_query": "brain subconscious decisions"},
            {"text": "Your brain can process an image in just 13 milliseconds. That's faster than you can blink, which takes about 300 milliseconds.", "search_query": "brain image processing speed"},
            {"text": "Every time you recall a memory, your brain reconstructs it from scratch. This means your memories are never exact replays - they're rebuilt every single time.", "search_query": "memory reconstruction brain"},
        ],
        "space": [
            {"text": "A day on Venus is longer than a year on Venus. It takes 243 Earth days to rotate once, but only 225 Earth days to orbit the Sun.", "search_query": "venus day longer than year"},
            {"text": "There are more stars in the universe than grains of sand on all of Earth's beaches. Scientists estimate roughly 70 sextillion stars exist.", "search_query": "stars universe sand beaches"},
            {"text": "Neutron stars are so dense that a teaspoon of their material would weigh about 6 billion tons - that's heavier than Mount Everest.", "search_query": "neutron star density weight"},
            {"text": "Space is completely silent because there's no atmosphere for sound waves to travel through. No one would hear you scream in space.", "search_query": "space silence sound vacuum"},
        ],
        "ocean": [
            {"text": "We've explored less than 5% of the ocean. That means we know more about the surface of Mars than we do about our own ocean floor.", "search_query": "ocean exploration percentage"},
            {"text": "The Mariana Trench is so deep that if you placed Mount Everest at the bottom, its peak would still be over a mile underwater.", "search_query": "mariana trench depth everest"},
            {"text": "The ocean produces over 50% of the world's oxygen. Tiny phytoplankton in the water do the heavy lifting, not trees.", "search_query": "ocean oxygen phytoplankton"},
            {"text": "There are underwater rivers and lakes that exist on the ocean floor. They have their own shorelines, waves, and even trees of methane ice.", "search_query": "underwater rivers lakes ocean"},
        ],
        "sleep": [
            {"text": "Your brain cleans out toxins while you sleep. The glymphatic system flushes away waste products that build up during the day.", "search_query": "brain cleaning sleep glymphatic"},
            {"text": "Humans are the only mammals that willingly delay sleep. Every other animal sleeps when it needs to - we're the only ones fighting it.", "search_query": "humans delay sleep unique"},
            {"text": "Dreaming usually happens during REM sleep, and during this phase your body is essentially paralyzed so you don't act out your dreams.", "search_query": "REM sleep paralysis dreaming"},
            {"text": "The record for the longest time without sleep is 11 days. After just 3 days without sleep, you can start hallucinating.", "search_query": "longest time without sleep record"},
        ],
        "dog": [
            {"text": "Dogs can understand up to 250 words and gestures, and their intelligence level is comparable to a 2-year-old human child.", "search_query": "dog intelligence vocabulary"},
            {"text": "A dog's sense of smell is at least 10,000 times more powerful than yours. They can even detect diseases like cancer through scent alone.", "search_query": "dog smell cancer detection"},
            {"text": "Dogs dream just like humans do. Small dogs dream more frequently than large dogs, and puppies dream the most.", "search_query": "dogs dreaming sleep patterns"},
            {"text": "Your dog's nose print is unique, just like your fingerprint. No two dogs have the same nose pattern.", "search_query": "dog nose print unique"},
        ],
        "coffee": [
            {"text": "Coffee is the second most traded commodity in the world, right after crude oil. Over 2.25 billion cups are consumed every single day.", "search_query": "coffee traded commodity world"},
            {"text": "Espresso actually has less caffeine than a regular cup of coffee. A shot of espresso has about 65mg, while a regular cup has around 95mg.", "search_query": "espresso vs coffee caffeine"},
            {"text": "Coffee beans are actually the seeds of a fruit called a coffee cherry. The cherries turn bright red when they're ripe and ready to harvest.", "search_query": "coffee cherry fruit bean"},
            {"text": "Finland consumes more coffee per person than any other country. The average Finn drinks about 4 cups a day - that's nearly 12kg per person annually.", "search_query": "finland coffee consumption per capita"},
        ],
        "water": [
            {"text": "Water covers about 71% of Earth's surface, but only 2.5% of it is fresh water. And less than 1% of that freshwater is accessible to humans.", "search_query": "water earth surface percentage"},
            {"text": "A human can survive about 3 days without water, but only about 3 weeks without food. Water is far more critical to survival than food.", "search_query": "human survival without water days"},
            {"text": "Hot water freezes faster than cold water in certain conditions. This is known as the Mpemba effect, and scientists still don't fully understand why it happens.", "search_query": "mpemba effect hot water freeze"},
            {"text": "Your body is about 60% water. Your brain and heart are 73% water, your lungs are 83% water, and even your bones are 31% water.", "search_query": "human body water percentage"},
        ],
    }

    for key, facts in curated.items():
        if key in topic_lower:
            return facts

    return _generate_generic_facts(topic)


def _generate_generic_facts(topic: str) -> List[Dict]:
    """Generate unique facts for any topic using smart templates."""
    templates = [
        {
            "text": "Most people have no idea that {topic} has this hidden side that changes everything you thought you knew.",
            "search_query": topic.replace(" ", "").lower()[:20] + "facts"
        },
        {
            "text": "Scientists recently discovered something about {topic} that contradicts what we've believed for decades. The truth is far more fascinating.",
            "search_query": topic.replace(" ", "").lower()[:20] + "research"
        },
        {
            "text": "The reason {topic} works the way it does comes down to an evolutionary trick that most people never notice in their daily lives.",
            "search_query": topic.replace(" ", "").lower()[:20] + "evolution"
        },
        {
            "text": "Here's the part about {topic} that experts always mention but nobody actually talks about publicly. It changes the whole picture.",
            "search_query": topic.replace(" ", "").lower()[:20] + "secrets"
        },
        {
            "text": "When you look at the data on {topic}, the numbers tell a completely different story than what most people assume. The gap is shocking.",
            "search_query": topic.replace(" ", "").lower()[:20] + "statistics"
        },
        {
            "text": "There's a common myth about {topic} that's been debunked by research, yet millions of people still believe it. Are you one of them?",
            "search_query": topic.replace(" ", "").lower()[:20] + "myths"
        },
    ]

    topic_hash = abs(hash(topic.lower().strip()))
    selected = []
    used_indices = set()

    for i in range(min(4, len(templates))):
        idx = (topic_hash + i * 3) % len(templates)
        while idx in used_indices:
            idx = (idx + 1) % len(templates)
        used_indices.add(idx)

        template = templates[idx]
        text = template["text"].format(topic=topic)
        selected.append({
            "text": text,
            "search_query": template["search_query"]
        })

    return selected


def _generate_image_prompt(topic: str, scene_type: str, scene_number: int) -> str:
    """Generate a unique, cinematic image prompt for a topic and scene type."""
    visual_map = {
        "hook": [
            "dramatic close-up, bold composition, eye-catching, intense colors, dark moody background",
            "striking macro shot, vivid contrast, mysterious atmosphere, cinematic lighting from above",
            "dynamic angle, sharp focus, high contrast, dramatic shadows, professional photography",
        ],
        "fact": [
            "clean composition, informative feel, clear subject isolation, soft bokeh background, studio lighting",
            "detailed visualization, sharp detail, clean background gradient, scientific aesthetic, 4K macro",
            "documentary style, natural lighting, authentic feel, shallow depth of field, professional quality",
        ],
        "story": [
            "narrative scene, emotional mood, warm golden hour lighting, cinematic wide shot, atmospheric haze",
            "storytelling composition, dramatic silhouette, sunset backlight, movie still quality, evocative",
            "intimate close-up, emotional depth, Rembrandt lighting, rich color palette, film grain texture",
        ],
        "insight": [
            "inspiring composition, ethereal glow, surreal atmosphere, dreamy soft focus, heavenly light rays",
            "thought-provoking scene, contemplative mood, soft ambient lighting, artistic interpretation, magical",
            "enlightening visualization, radiant energy, prismatic light, transcendent quality, visionary art",
        ],
        "cta": [
            "bold dynamic composition, action-oriented, vibrant energy, dramatic perspective, powerful stance",
            "attention-grabbing, high impact, electrifying colors, explosive composition, compelling visual",
            "dynamic motion, powerful presence, intense focus, commanding attention, strong visual impact",
        ],
    }

    color_palettes = [
        "deep purple and electric blue",
        "warm amber and rich burgundy",
        "emerald green and golden yellow",
        "midnight blue and silver",
        "crimson red and dark teal",
        "sunset orange and deep violet",
        "forest green and warm copper",
        "arctic blue and soft pink",
    ]

    visuals = visual_map.get(scene_type, visual_map["fact"])
    visual_idx = (abs(hash(topic.lower() + scene_type)) + scene_number) % len(visuals)
    color_idx = (scene_number - 1) % len(color_palettes)

    visual = visuals[visual_idx]
    colors = color_palettes[color_idx]

    return f"{topic}, {visual}, {colors} color palette, cinematic lighting, ultra detailed, 4K quality, professional photography, vertical composition"


async def generate_facebook_caption(
    topic: str,
    scenes: List[Dict],
    style: str = "energetic",
    page_name: str = "",
) -> Dict:
    """Generate an optimized Facebook caption with hashtags."""
    api_key = os.environ.get("GEMINI_API_KEY", "")

    scene_texts = [s.get("text", "") for s in scenes]
    scene_summary = " | ".join(scene_texts)

    if api_key:
        try:
            return await _generate_caption_with_gemini(topic, scene_summary, style, page_name, api_key)
        except Exception as e:
            logger.warning(f"Gemini caption generation failed, using smart mock: {e}")

    return _generate_caption_mock(topic, style, page_name)


async def _generate_caption_with_gemini(
    topic: str,
    scene_summary: str,
    style: str,
    page_name: str,
    api_key: str
) -> Dict:
    """Generate Facebook caption using Gemini API."""
    import httpx

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

    page_context = f" for the Facebook page '{page_name}'" if page_name else ""

    user_prompt = f"""Generate an optimized Facebook Reel caption{page_context} for a short-form video about: "{topic}"

Video content summary: {scene_summary}
Style: {style}

The caption should:
1. Start with a hook/attention grabber (first line is crucial for Facebook)
2. Be engaging and encourage comments/shares
3. Include a call to action
4. Use emojis strategically (not too many)
5. Be 2-4 lines max (short and punchy works best on Facebook)
6. Include 5-8 relevant hashtags at the end

Return ONLY valid JSON with these fields:
- caption (string, the main caption text without hashtags)
- hashtags (array of strings, 5-8 relevant hashtags without the # symbol)
- full_caption (string, caption + hashtags combined, ready to copy-paste)"""

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": user_prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    result = json.loads(text)

    if "caption" not in result or "hashtags" not in result:
        raise ValueError("Invalid caption data from LLM")

    if "full_caption" not in result:
        hashtag_str = " ".join(f"#{tag.lstrip('#')}" for tag in result["hashtags"])
        result["full_caption"] = f"{result['caption']}\n\n{hashtag_str}"

    logger.info(f"Generated Facebook caption via Gemini for topic: {topic}")
    return result


def _generate_caption_mock(topic: str, style: str, page_name: str) -> Dict:
    """Generate a topic-specific Facebook caption as fallback."""
    topic_words = re.findall(r'\b\w{3,}\b', topic.lower())
    base_hashtags = topic_words[:3]

    style_hashtags = {
        "energetic": ["viral", "mindblown", "fyp", "trending"],
        "calm": ["learnontiktok", "education", "facts", "knowledge"],
        "dramatic": ["shocking", "unbelievable", "mustwatch", "insane"],
        "lofi": ["chill", "vibes", "relaxing", "aesthetic"],
    }
    extra = style_hashtags.get(style, ["viral", "fyp", "trending", "facts"])
    fb_hashtags = ["facebookreels", "reels"]

    all_hashtags = base_hashtags + extra + fb_hashtags
    seen = set()
    unique_hashtags = []
    for h in all_hashtags:
        if h not in seen:
            seen.add(h)
            unique_hashtags.append(h)

    page_tag = f" @{page_name}" if page_name else ""

    display_topic = re.sub(r'^(why|how|what|when|where|who)\s+', '', topic.lower()).strip()
    if not display_topic:
        display_topic = topic

    caption_templates = [
        f"Wait for it... {display_topic.title()} will blow your mind.{page_tag}\nFollow for more amazing content!",
        f"{display_topic.title()} is way more fascinating than you think.{page_tag}\nShare this with someone who needs to know!",
        f"Nobody told you this about {display_topic}? Here's the truth.{page_tag}\nFollow for more eye-opening facts!",
        f"The truth about {display_topic} is wilder than fiction.{page_tag}\nDrop a comment if you learned something new!",
    ]

    caption_idx = abs(hash(topic.lower().strip())) % len(caption_templates)
    caption = caption_templates[caption_idx]

    hashtag_str = " ".join(f"#{tag}" for tag in unique_hashtags[:8])
    full_caption = f"{caption}\n\n{hashtag_str}"

    return {
        "caption": caption,
        "hashtags": unique_hashtags[:8],
        "full_caption": full_caption,
    }
