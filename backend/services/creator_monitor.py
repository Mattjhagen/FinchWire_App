from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
from typing import Dict, Iterable, List, Optional

import requests

from .signal_algorithms import isoformat_utc, parse_iso, utcnow


@dataclass
class CreatorEvent:
    id: str
    provider: str
    channel_id: str
    event_type: str
    title: str
    url: str
    thumbnail_url: Optional[str]
    published_at: str
    detected_at: str
    dedupe_key: str


def _event_id(channel_id: str, event_type: str, url: str) -> str:
    seed = f"{channel_id}:{event_type}:{url}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:20]


def _dedupe_key(channel_id: str, event_type: str, video_id: str) -> str:
    return f"yt:{channel_id}:{event_type}:{video_id}"


def _youtube_search(
    *,
    api_key: str,
    channel_id: str,
    max_results: int = 5,
) -> List[Dict[str, object]]:
    if not api_key:
        return []
    params = {
        "part": "snippet",
        "channelId": channel_id,
        "order": "date",
        "type": "video",
        "maxResults": str(max_results),
        "key": api_key,
    }
    response = requests.get("https://www.googleapis.com/youtube/v3/search", params=params, timeout=10)
    if response.status_code >= 400:
        return []
    payload = response.json()
    return payload.get("items", []) if isinstance(payload, dict) else []


def _event_type_from_snippet(snippet: Dict[str, object]) -> str:
    broadcast = str(snippet.get("liveBroadcastContent") or "").lower()
    if broadcast == "live":
        return "live_started"
    if broadcast == "upcoming":
        return "livestream_scheduled"
    return "video_published"


def poll_youtube_creator_events(
    *,
    watches: Iterable[Dict[str, object]],
    existing_events: Iterable[Dict[str, object]],
    api_key: str,
) -> List[Dict[str, object]]:
    existing_dedupe = {
        str(event.get("dedupeKey"))
        for event in existing_events
        if event.get("dedupeKey")
    }
    generated: List[Dict[str, object]] = []
    now = utcnow()
    since = now - timedelta(hours=48)

    for watch in watches:
        if not bool(watch.get("enabled", True)):
            continue
        provider = str(watch.get("provider") or "youtube")
        if provider != "youtube":
            continue
        channel_id = str(watch.get("channelId") or "").strip()
        if not channel_id:
            continue

        try:
            items = _youtube_search(api_key=api_key, channel_id=channel_id)
        except Exception:
            items = []

        for item in items:
            if not isinstance(item, dict):
                continue
            id_info = item.get("id", {}) if isinstance(item.get("id"), dict) else {}
            snippet = item.get("snippet", {}) if isinstance(item.get("snippet"), dict) else {}
            video_id = str(id_info.get("videoId") or "")
            if not video_id:
                continue
            published_at = parse_iso(str(snippet.get("publishedAt") or isoformat_utc(now)))
            if published_at < since:
                continue
            event_type = _event_type_from_snippet(snippet)
            dedupe_key = _dedupe_key(channel_id, event_type, video_id)
            if dedupe_key in existing_dedupe:
                continue

            url = f"https://www.youtube.com/watch?v={video_id}"
            event = CreatorEvent(
                id=_event_id(channel_id, event_type, url),
                provider="youtube",
                channel_id=channel_id,
                event_type=event_type,
                title=str(snippet.get("title") or "Untitled upload"),
                url=url,
                thumbnail_url=(
                    snippet.get("thumbnails", {})
                    .get("high", {})
                    .get("url")
                    if isinstance(snippet.get("thumbnails"), dict)
                    else None
                ),
                published_at=isoformat_utc(published_at),
                detected_at=isoformat_utc(now),
                dedupe_key=dedupe_key,
            )
            generated.append(
                {
                    "id": event.id,
                    "provider": event.provider,
                    "channelId": event.channel_id,
                    "eventType": event.event_type,
                    "title": event.title,
                    "url": event.url,
                    "thumbnailUrl": event.thumbnail_url,
                    "publishedAt": event.published_at,
                    "detectedAt": event.detected_at,
                    "dedupeKey": event.dedupe_key,
                }
            )
            existing_dedupe.add(dedupe_key)

    return generated


def is_major_upload(event: Dict[str, object], watch: Dict[str, object]) -> bool:
    if str(event.get("eventType")) != "video_published":
        return True

    title = str(event.get("title") or "").lower()
    keywords = (
        "full",
        "episode",
        "podcast",
        "interview",
        "breaking",
        "live",
        "documentary",
    )
    if any(keyword in title for keyword in keywords):
        return True

    if bool(watch.get("highPriority")):
        return True

    return len(title) >= 40

