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
- text (narration, 1-2 punchy sentences - MUST contain specific facts, numbers, or examples about {topic}, NOT generic statements)
- image_prompt (CRITICAL: a CONCRETE, photographable visual description that depicts what THIS SPECIFIC SCENE'S text is talking about - e.g. if text mentions "CO2", image_prompt should be "macro photograph of mosquito with visible breath vapor clouds" - DO NOT write abstract or topic-generic prompts - each scene's image_prompt MUST be unique and depict the specific fact/concept mentioned in the text - include concrete objects, actions, scenes, lighting, mood, colors)
- search_query (3-4 keywords for stock video search)
- duration_hint (3-8 seconds)

RULES:
1. First scene MUST be a hook. Last scene MUST be a CTA.
2. Each scene's text MUST contain a SPECIFIC fact about {topic} (with numbers, examples, or concrete details) - NOT generic statements like "there's a hidden side"
3. Each scene's image_prompt MUST depict the SPECIFIC content of that scene's text - if text says "X attracts Y", the image should show X and Y together
4. NEVER write image_prompt as just the topic name - always describe a specific photographable scene
5. Return ONLY the JSON array, no other text."""

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
        "image_prompt": _generate_image_prompt(hook_text, topic, "hook", 1),
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
            "image_prompt": _generate_image_prompt(fact_data["text"], topic, scene_type, i + 2),
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
        "image_prompt": _generate_image_prompt(cta_text, topic, "cta", num_scenes),
        "search_query": "".join(topic.split()[:2]).lower(),
        "duration_hint": 4
    })

    for i, s in enumerate(scenes):
        s["scene_number"] = i + 1

    logger.info(f"Generated {len(scenes)} topic-specific scenes for: {topic}")
    return scenes


def _get_topic_facts(topic: str) -> List[Dict]:
    """Get topic-specific facts. Uses curated knowledge for common topics.

    Normalizes the topic first by stripping filler phrases like
    'amazing facts about', 'incredible facts about', 'facts about' so that
    a user asking for 'amazing facts about sunlight' is recognized as
    asking about 'sunlight'.
    """
    topic_lower = topic.lower().strip()

    # Normalize: strip filler phrases so curated matching works
    import re as _re
    filler_patterns = [
        r"^(amazing|incredible|interesting|fun|shocking|mind[- ]blowing|crazy|weird|unknown|hidden)\s+facts?\s+(about|on|of|regarding)\s+",
        r"^(facts?|truth|secrets?|things)\s+(about|on|of|regarding)\s+",
        r"^(everything|all)\s+(you|we)\s+(need to know|should know|must know)\s+(about|on|of)\s+",
        r"^(why|how|what)\s+",
        r"^(the)\s+",
    ]
    normalized = topic_lower
    for pat in filler_patterns:
        normalized = _re.sub(pat, "", normalized).strip()
    # Collapse multi-word topics that may be split (e.g. "sun light" -> "sunlight")
    normalized_collapsed = normalized.replace(" ", "")
    # Also try the normalized form with spaces preserved
    candidates = [topic_lower, normalized, normalized_collapsed]

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
        "sunlight": [
            {"text": "Sunlight takes about 8 minutes and 20 seconds to travel from the Sun to Earth. That means you're always seeing the Sun as it was in the past.", "search_query": "sunlight travel time earth"},
            {"text": "Your skin makes vitamin D when ultraviolet UVB rays from sunlight hit it. Just 15 minutes a day is enough to keep your bones strong and healthy.", "search_query": "sunlight vitamin D skin"},
            {"text": "Sunlight is actually made of all the colors of the rainbow mixed together. A prism can split it into red, orange, yellow, green, blue, indigo, and violet.", "search_query": "sunlight spectrum colors rainbow"},
            {"text": "Plants use sunlight to make their own food through photosynthesis. They convert sunlight, water, and carbon dioxide into sugar and oxygen - it's the basis of all life on Earth.", "search_query": "photosynthesis plants sunlight"},
            {"text": "Sunlight boosts your mood by triggering serotonin production in your brain. That's why people feel happier on sunny days and more depressed during dark winter months.", "search_query": "sunlight serotonin mood"},
            {"text": "The Sun loses about 4 million tons of mass every second as it converts hydrogen into helium through nuclear fusion. Don't worry - it has enough fuel for another 5 billion years.", "search_query": "sun nuclear fusion mass loss"},
        ],
        "sun": [
            {"text": "The Sun is so massive that you could fit over 1.3 million Earths inside it. It makes up 99.8% of all the mass in our entire solar system.", "search_query": "sun size earth comparison"},
            {"text": "The surface of the Sun is about 5,500 degrees Celsius, but its core reaches a scorching 15 million degrees - hot enough to sustain nuclear fusion.", "search_query": "sun surface core temperature"},
            {"text": "Light from the Sun takes 8 minutes and 20 seconds to reach Earth. If the Sun suddenly disappeared, we wouldn't know for over 8 minutes.", "search_query": "sun light travel time"},
            {"text": "The Sun is about 4.6 billion years old and is roughly halfway through its life. In about 5 billion years it will expand into a red giant and swallow the inner planets.", "search_query": "sun age red giant"},
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

    # Check each curated key against all candidate forms of the topic
    for key, facts in curated.items():
        for cand in candidates:
            if key in cand:
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


def _generate_image_prompt(scene_text: str, topic: str, scene_type: str, scene_number: int) -> str:
    """Generate a scene-specific image prompt that visually depicts what the scene is actually about.

    CRITICAL: This function looks at the SCENE TEXT (not just the topic) to extract concrete
    visual concepts. Each scene must have a unique, specific, photographable visual - not an
    abstract topic-generic background.
    """
    # Step 1: Extract concrete visual concept from scene text
    visual_concept = _extract_visual_concept(scene_text, topic, scene_type, scene_number)

    # Step 2: Apply scene-type-specific style modifiers
    style_modifiers = {
        "hook": "dramatic cinematic close-up, intense contrast, eye-catching composition, dark moody atmosphere, professional photography",
        "fact": "scientific macro photography, ultra-detailed, professional documentary style, sharp focus, shallow depth of field",
        "story": "narrative scene, emotional mood, warm golden hour lighting, cinematic storytelling, atmospheric haze",
        "insight": "thought-provoking surreal composition, ethereal glow, inspiring atmosphere, dreamy soft focus",
        "cta": "dynamic composition, action-oriented, vibrant energy, dramatic perspective, compelling visual impact",
    }
    style = style_modifiers.get(scene_type, style_modifiers["fact"])

    # Step 3: Vary color palette per scene for visual variety
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
    colors = color_palettes[(scene_number - 1) % len(color_palettes)]

    # Inject a unique scene identifier so the image cache keys are guaranteed
    # distinct per scene even if the visual_concept happens to be identical.
    # This also nudges the AI image generator toward producing a different image.
    scene_tag = f"scene {scene_number} of {scene_number}"

    return (
        f"{scene_tag} | {visual_concept}, {style}, {colors} color palette, "
        f"cinematic lighting, ultra detailed, 4K quality, professional photography, "
        f"vertical 9:16 composition, sharp focus, high detail, no text, no watermark"
    )


def _extract_visual_concept(scene_text: str, topic: str, scene_type: str, scene_number: int = 1) -> str:
    """Extract a concrete, photographable visual description from the scene text.

    Uses keyword matching to find specific visual concepts mentioned in the scene,
    falling back to a topic-aware concrete visual when no keyword matches.
    The fallback varies by scene_number so each scene gets a distinct image.
    """
    text_lower = (scene_text or "").lower()
    topic_lower = (topic or "").lower()

    # For hook and CTA scenes, prefer hook/CTA-specific visuals over topic visuals.
    # This prevents the hook from showing the same image as the fact scenes.
    # We do this by checking hook/CTA keywords FIRST when scene_type is hook or cta.
    is_hook_or_cta = scene_type in ("hook", "cta")

    # Hook scene visuals — checked first for hook scenes
    hook_cta_mappings = [
        ("won't believe", "person with shocked expression looking at glowing discovery, dramatic spotlight, dark background"),
        ("blow your mind", "explosion of colorful particles around human head silhouette, mind-blown visualization, vibrant colors"),
        ("stop scrolling", "vertical smartphone screen with thumb frozen mid-scroll, dramatic lighting, social media concept"),
        ("secret", "mysterious locked door with golden light spilling through keyhole, atmospheric, cinematic intrigue"),
        ("hidden", "partially obscured object glowing softly in darkness, mysterious reveal, dramatic low-key lighting"),
        ("wondered", "person deep in thought with question marks floating around, curious expression, dramatic lighting"),
        ("follow", "person pointing at follow button floating in air, social media interface, vibrant modern aesthetic"),
        ("share", "hands passing glowing smartphone between two people, sharing concept, warm friendly lighting"),
        ("comment", "person typing on phone with comment bubbles floating around, social media interaction, modern aesthetic"),
        ("subscribe", "red subscribe button glowing with energy, call-to-action visual, dynamic composition"),
    ]

    if is_hook_or_cta:
        for keyword, visual in hook_cta_mappings:
            if keyword in text_lower:
                return visual

    # Comprehensive keyword -> concrete visual mapping
    # Each entry is (keyword, visual_description) - the visual MUST be specific and photographable
    # ORDER MATTERS: more specific keywords must come BEFORE generic ones so they match first
    visual_mappings = [
        # === Mosquito / insect visuals ===
        ("carbon dioxide", "macro photograph of a mosquito in flight with visible breath vapor clouds in cold air, scientific visualization of invisible CO2 gas waves around a person"),
        ("co2", "macro photograph of a mosquito in flight with visible breath vapor clouds in cold air, scientific visualization of invisible CO2 gas waves around a person"),
        ("blood type", "extreme close-up of mosquito proboscis piercing human skin, single blood droplet with scientific label overlay showing blood type, medical illustration style"),
        ("type o", "extreme close-up of mosquito proboscis piercing human skin, single blood droplet with scientific label overlay showing blood type O, medical illustration style"),
        ("type a", "extreme close-up of mosquito proboscis piercing human skin, single blood droplet with scientific label overlay showing blood type A, medical illustration style"),
        ("bacteria", "microscope view of glowing bacteria colonies on skin surface, scientific illustration with blue and purple fluorescent tones, microbiology aesthetic"),
        ("skin bacteria", "microscope view of glowing bacteria colonies on human skin, scientific illustration with blue and purple fluorescent tones"),
        ("dark clothing", "split image showing person in black shirt surrounded by mosquitoes next to person in white shirt with none, twilight outdoor setting"),
        ("dark colors", "split image showing person in black shirt surrounded by mosquitoes next to person in white shirt with none, twilight outdoor setting"),
        ("beer", "frosted beer glass with condensation droplets on a wooden bar, mosquito hovering near the glass, warm amber bar lighting"),
        ("alcohol", "frosted beer glass with condensation droplets, mosquito hovering nearby, warm bar lighting"),
        ("pregnant", "elegant silhouette of pregnant woman in golden hour backlight, soft maternal glow, mosquitoes faintly visible in soft focus background"),
        ("body heat", "thermal imaging photograph of person showing heat zones, warm orange and red glow on body, mosquitoes attracted to heat signature"),
        ("sweat", "close-up of athlete sweating during outdoor workout, droplets glistening on skin, mosquito in soft focus background"),
        ("mosquito", "ultra-detailed macro photograph of mosquito on human skin, compound eyes visible, golden hour lighting"),

        # === Brain / neuroscience visuals ===
        ("electricity", "glowing neural pathways inside human brain, electrical sparks between neurons, bioluminescent blue glow, dark background"),
        ("light bulb", "human brain rendered as glowing light bulb filaments, warm electrical glow emanating from within, dark scientific background"),
        ("lightbulb", "human brain rendered as glowing light bulb filaments, warm electrical glow emanating from within, dark scientific background"),
        ("subconscious", "split-view illustration of brain showing conscious surface and deep subconscious layers, ethereal mist, scientific surreal"),
        ("7 seconds", "high-speed photograph of brain processing visual information, motion blur trails of neural activity, neon data streams"),
        ("13 milliseconds", "high-speed photograph of brain processing visual information, motion blur trails of neural activity, neon data streams"),
        ("memory", "human brain with glowing memory fragments floating around it, dreamlike atmosphere, golden particles, surreal"),
        ("recall", "human brain with glowing memory fragments floating around it, dreamlike atmosphere, golden particles, surreal"),
        ("dream", "person sleeping with translucent dream imagery floating above head, soft moonlight, surreal atmosphere"),
        ("glymphatic", "scientific illustration of brain fluid cleaning system, blue fluid flowing through neural pathways, microscopic view"),
        ("brain", "anatomical human brain glowing with bioluminescent neural activity, scientific illustration, dark background"),

        # === Space / astronomy visuals ===
        ("venus", "planet Venus rotating slowly in space, thick yellow atmospheric clouds, sun in distance, NASA photograph style"),
        ("stars", "deep space photograph of countless stars in Milky Way galaxy, nebula clouds in purple and pink, long exposure"),
        ("neutron star", "scientific illustration of incredibly dense neutron star, glowing blue-white with intense gravity lensing, space backdrop"),
        ("sound", "visualization of sound waves dissipating in vacuum of space, scientific illustration, dark cosmos background"),
        ("vacuum", "astronaut floating in absolute emptiness of space, no stars, no sound, infinite black void"),
        ("black hole", "scientific visualization of black hole with accretion disk, gravitational lensing bending light, interstellar style"),
        ("mars", "red rocky surface of Mars with rover tracks, dusty orange atmosphere, NASA photograph"),
        ("moon", "close-up of lunar surface with craters, earth visible in distance, NASA Apollo photograph style"),

        # === Ocean visuals ===
        ("mariana trench", "deep ocean trench with bioluminescent creatures, pitch black with rare glowing organisms, scientific deep sea photograph"),
        ("everest", "Mount Everest summit rendered underwater with schools of fish swimming around it, surreal scientific illustration"),
        ("mount everest", "Mount Everest summit rendered underwater with schools of fish swimming around it, surreal scientific illustration"),
        ("phytoplankton", "microscopic view of glowing blue phytoplankton, ocean water sample, bioluminescent microorganisms"),
        ("oxygen", "underwater photograph of phytoplankton releasing oxygen bubbles, blue bioluminescent glow, scientific"),
        ("underwater river", "surreal photograph of underwater river on ocean floor with visible shoreline and methane ice trees, deep sea scientific"),
        ("ocean", "deep ocean photograph with sun rays piercing through blue water, mysterious depths below, professional underwater photography"),

        # === Sleep visuals ===
        ("rem sleep", "person sleeping with EEG brainwave visualization overlay, REM phase indicator, soft bedroom lighting"),
        ("paralyzed", "silhouette of person sleeping with translucent ghostly figure showing paralysis, dreamlike atmosphere"),
        ("hallucinating", "surreal image of sleep-deprived person seeing shadowy figures, distorted perception, psychological horror aesthetic"),
        ("11 days", "exhausted person at desk with clock showing 264 hours, dark circles under eyes, dim lighting"),
        ("sleep", "peaceful person sleeping in soft moonlit bedroom, gentle blue light, calm serene atmosphere"),

        # === Dog visuals ===
        ("sense of smell", "close-up of dog's wet nose with scent particle visualization, scientific illustration of olfactory receptors"),
        ("nose print", "extreme close-up of dog's nose with unique pattern, scientific comparison to fingerprint, macro photography"),
        ("cancer", "dog sniffing patient's hand in medical setting, scientific visualization of disease detection, hopeful atmosphere"),
        ("dog", "professional portrait of golden retriever with intelligent eyes, soft natural lighting, shallow depth of field"),

        # === Coffee visuals ===
        ("traded commodity", "stacks of coffee bean bags in warehouse next to oil barrels, global trade visualization, industrial lighting"),
        ("espresso", "close-up of espresso machine pouring rich crema into small cup, steam rising, dark café atmosphere"),
        ("caffeine", "molecular visualization of caffeine molecule next to coffee cup, scientific illustration, blue glow"),
        ("coffee cherry", "close-up of bright red coffee cherries on branch, lush green plantation background, agricultural photography"),
        ("finland", "cozy Finnish cabin in snow with person drinking coffee by fire window, warm interior glow, winter scene"),
        ("coffee", "artisan barista pouring latte art into cup, rich brown crema, café atmosphere, professional food photography"),

        # === Water visuals ===
        ("71%", "Earth viewed from space showing blue oceans dominating the surface, NASA photograph, scientific"),
        ("fresh water", "crystal clear mountain stream flowing over rocks, pristine wilderness, golden hour lighting"),
        ("mpemba", "scientific illustration of hot and cold water freezing, side-by-side beakers with temperature visualization"),
        ("60% water", "human body silhouette with water percentage visualization, scientific anatomical illustration, blue tones"),
        ("water", "macro photograph of water droplet hitting calm surface, ripples expanding, blue tones, high speed photography"),

        # === Generic scientific visuals ===
        ("scientists", "scientists in white lab coats examining specimen under microscope, laboratory setting, professional documentary photography"),
        ("research", "scientist writing equations on glass board in modern laboratory, dramatic side lighting, documentary style"),
        ("discovered", "scientist looking through telescope or microscope with expression of wonder, dramatic lighting, discovery moment"),
        ("myth", "ancient mythology book open on table next to modern scientific journal, comparison visualization, atmospheric lighting"),
        ("evolution", "evolutionary timeline illustration showing gradual species transformation, scientific, warm earth tones"),
        ("data", "person analyzing data on multiple holographic screens, futuristic dashboard, blue and cyan tones"),
        ("numbers", "macro photograph of numbers floating in space, abstract data visualization, cinematic lighting"),
        ("statistics", "infographic style visualization with charts and graphs floating in 3D space, professional data presentation"),

        # === Sun / sunlight visuals — SPECIFIC keywords BEFORE generic 'sun'/'sunlight' ===
        ("vitamin d", "person standing in golden sunlight with skin glowing, scientific visualization of vitamin D absorption, warm tones"),
        ("photosynthesis", "lush green plant leaf macro with sunlight hitting it, scientific visualization of photosynthesis process, vibrant greens"),
        ("serotonin", "human brain glowing with serotonin molecules, scientific visualization of mood chemicals, warm golden tones"),
        ("rainbow", "brilliant rainbow arcing across stormy sky, vivid colors, dramatic clouds, professional landscape photography"),
        ("spectrum", "glass prism splitting white light into rainbow spectrum on dark background, scientific photography"),
        ("prism", "glass prism splitting white light into rainbow spectrum on dark background, scientific photography"),
        ("8 minutes", "Sun in deep space with light beam traveling toward distant Earth, cosmic scale visualization, NASA style"),
        ("nuclear fusion", "Sun's core cross-section showing hydrogen fusing into helium, intense plasma glow, scientific illustration"),
        ("ultraviolet", "person's skin under UV light showing hidden patterns, scientific photography, purple and blue tones"),
        ("uvb", "scientific illustration of UVB rays hitting skin, ultraviolet light visualization, medical aesthetic"),
        ("photon", "scientific visualization of photons as glowing particles traveling through space, physics concept art"),
        ("light beam", "single dramatic light beam cutting through dark forest, atmospheric, cinematic photography"),
        ("light rays", "god rays streaming through cloudy sky, dramatic atmospheric lighting, professional photography"),
        ("sun light", "golden sunlight beams piercing through forest canopy, god rays, dust particles floating in light, warm atmospheric photography"),
        ("sunlight", "golden sunlight beams piercing through forest canopy, god rays, dust particles floating in light, warm atmospheric photography"),
        ("sun", "close-up of Sun surface with solar flares and sunspots, intense orange and yellow glow, NASA photograph"),
    ]

    # Check each keyword against the scene text
    for keyword, visual in visual_mappings:
        if keyword in text_lower:
            return visual

    # Fallback: build a concrete visual from the topic itself, varied by scene_number
    # so each scene gets a visually distinct image even on the same topic.
    # Use the normalized topic (without filler phrases) as the visual subject.
    import re as _re
    topic_normalized = topic_lower
    filler_patterns = [
        r"^(amazing|incredible|interesting|fun|shocking|mind[- ]blowing|crazy|weird|unknown|hidden)\s+facts?\s+(about|on|of|regarding)\s+",
        r"^(facts?|truth|secrets?|things)\s+(about|on|of|regarding)\s+",
        r"^(everything|all)\s+(you|we)\s+(need to know|should know|must know)\s+(about|on|of)\s+",
        r"^(why|how|what)\s+",
        r"^(the)\s+",
    ]
    for pat in filler_patterns:
        topic_normalized = _re.sub(pat, "", topic_normalized).strip()

    # Variety framings per scene_number so AI image gen produces distinct images
    framings = [
        "dramatic close-up",
        "wide establishing shot",
        "macro detail photograph",
        "aerial drone view",
        "cinematic portrait",
        "abstract artistic interpretation",
        "documentary behind-the-scenes",
        "scientific visualization",
    ]
    framing = framings[(scene_number - 1) % len(framings)]

    lighting_moods = [
        "golden hour backlight",
        "moody low-key lighting",
        "bright daylight illumination",
        "dramatic rim lighting",
        "soft diffused window light",
        "neon cyberpunk glow",
        "warm candlelit atmosphere",
        "cold blue twilight",
    ]
    lighting = lighting_moods[(scene_number - 1) % len(lighting_moods)]

    if topic_normalized:
        return (
            f"{framing} of {topic_normalized}, {lighting}, "
            f"scene {scene_number} of a documentary series, "
            f"each scene visually distinct, professional photography"
        )

    return f"cinematic abstract visualization scene {scene_number}, {lighting}, professional photography"


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
