import logging
import os
import requests
from typing import List, Dict, Any
from .ai_search import run_ai_search, AiSearchError

logger = logging.getLogger("finchwire.rss_discovery")

def discover_rss_feeds_for_interests(interests: List[str], provider: str, api_key: str) -> List[str]:
    """
    Uses AI to find specialized RSS feed URLs for given interests.
    Returns a list of discovered RSS feed URLs.
    """
    discovered_urls = []
    
    if not interests:
        return []

    # Prompt the AI to find SPECIFIC RSS feed URLs for these interests.
    # We'll ask it to provide a list of URLs that are known to work.
    prompt = (
        f"I need specialized RSS feed URLs for these interests: {', '.join(interests)}. "
        "Please provide a list of 5-8 valid, high-quality RSS feed URLs (one for each topic if possible). "
        "Return the result as a comma-separated list of ONLY the URLs."
    )
    
    try:
        res = run_ai_search(prompt, provider, api_key)
        # The AI might return more text, but we'll try to extract URLs
        import re
        urls = re.findall(r'https?://[^\s,]+', res.answer)
        if urls:
            # Filter for likely RSS looking things or common news sites
            rss_keywords = ['rss', 'xml', 'feed', 'atom']
            for url in urls:
                url = url.strip().rstrip('.')
                if any(k in url.lower() for k in rss_keywords) or any(d in url.lower() for d in ['reuters', 'apnews', 'bbc', 'wired']):
                    discovered_urls.append(url)
                    
        logger.info(f"Discovered {len(discovered_urls)} feeds for interests: {interests}")
    except AiSearchError as e:
        logger.error(f"RSS discovery failed: {e}")
    except Exception as e:
        logger.error(f"Error during RSS discovery: {e}")
        
    return list(set(discovered_urls))

def update_suggested_feeds(store: Any):
    """
    Check if we need new feeds based on updated interests.
    """
    settings = store.get_collection("settings") or {}
    profiles = store.get_collection("interest_profiles") or {}
    
    ai_provider = settings.get("ai_provider", "none")
    ai_key = settings.get("ai_api_key", "") # This is resolved in server.py, but we'll try to find it.
    
    if ai_provider == "none" or not ai_key:
        logger.warning("AI not configured for RSS discovery.")
        return

    # Get top interests across all users
    all_interests = []
    for profile in profiles.values():
        topics = profile.get("topics", {})
        sorted_topics = sorted(topics.items(), key=lambda x: x[1], reverse=True)[:3]
        all_interests.extend([t for t, s in sorted_topics if s > 0.8])
    
    unique_interests = list(set(all_interests))[:10]
    if not unique_interests:
        return
        
    # Discover 
    new_feeds = discover_rss_feeds_for_interests(unique_interests, ai_provider, ai_key)
    if new_feeds:
        # Save to settings or a dedicated 'discovered_feeds' collection
        current_feeds = settings.get("discovered_feeds", [])
        updated_feeds = list(set(current_feeds + new_feeds))
        settings["discovered_feeds"] = updated_feeds
        store.replace_collection("settings", settings)
        logger.info(f"Added {len(new_feeds)} discovered feeds.")
