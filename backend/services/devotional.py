from __future__ import annotations

import json
import logging
import time
from typing import Dict, Any, Optional

from .home_data_providers import get_verse_of_day
from .ai_search import run_ai_search

logger = logging.getLogger("finchwire.devotional")

_devotional_cache: Dict[str, Any] = {}

def generate_devotional(provider: str, api_key: str) -> Dict[str, Any]:
    global _devotional_cache
    
    # Simple daily cache to avoid redundant AI calls
    today = time.strftime("%Y-%m-%d")
    if _devotional_cache.get("date") == today:
        return _devotional_cache["data"]

    try:
        # Get standard verse of the day
        verse = get_verse_of_day()
        
        # Build AI prompt for christian devotional content
        prompt = (
            f"Verse of the Day: {verse.reference} - \"{verse.text}\"\n\n"
            "Generate a Daily Devotional for this verse. Your response should strictly be a JSON object with this shape:\n"
            '{"context": "Historical/Biblical context of the verse", '
            '"application": "Practical daily application for the user", '
            '"current_events": "How this relates to current challenges/events in the world today", '
            '"prayer": "A short, beautiful closing prayer"}\n\n'
            "Rules:\n"
            "- Be encouraging, grounded, and state-of-the-art.\n"
            "- Keep each section under 60-80 words.\n"
            "- Ensure the JSON is clean and valid."
        )
        
        # Call AI
        result = run_ai_search(prompt, provider, api_key)
        
        # Try to parse the result. normalize_result in ai_search.py might not return JSON.
        # But run_ai_search internally calls normalization.
        # I'll try to extract JSON block manually if needed.
        from .ai_search import _extract_json_block
        parsed = _extract_json_block(result.answer)
        
        devotional = {
            "reference": verse.reference,
            "text": verse.text,
            "translation": verse.translation,
            "context": parsed.get("context", "Context unavailable."),
            "application": parsed.get("application", "Application unavailable."),
            "current_events": parsed.get("current_events", "Relation to current events unavailable."),
            "prayer": parsed.get("prayer", "Heavenly Father, guide us today. Amen."),
            "generatedAt": time.time(),
        }
        
        _devotional_cache = {"date": today, "data": devotional}
        return devotional
        
    except Exception as exc:
        logger.error(f"Devotional generation failed: {exc}")
        # Return fallback with just the verse if AI fails
        verse = get_verse_of_day()
        return {
            "reference": verse.reference,
            "text": verse.text,
            "translation": verse.translation,
            "context": "AI generation is temporarily unavailable.",
            "application": "Focus on God's word today.",
            "current_events": "His truth remains unchanging.",
            "prayer": "Amen.",
            "generatedAt": time.time(),
        }
