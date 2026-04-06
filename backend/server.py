from __future__ import annotations

import asyncio
import contextlib
from datetime import datetime, timedelta
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from urllib.parse import quote, urlparse
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from services.creator_monitor import poll_youtube_creator_events
from services.ai_search import AiSearchError, run_ai_search
from services.home_data_providers import (
    ProviderError,
    get_market_quote,
    get_verse_of_day,
    get_weather_snapshot,
)
from services.news_pipeline import compute_story_rankings, ingest_feeds, merge_stories
from services.notification_engine import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    build_creator_notifications_for_user,
    build_story_notifications_for_user,
    send_expo_push,
)
from services.signal_algorithms import (
    create_interest_vector,
    decay_interest_vector,
    isoformat_utc,
    parse_iso,
    tokenize,
    update_interest_vector,
    utcnow,
)
from services.state_store import JsonStateStore
from services.media_downloader import media_worker_loop


ROOT_DIR = Path(__file__).parent
MEDIA_DIR = Path(os.environ.get("FINCHWIRE_MEDIA_DIR", ROOT_DIR / "media"))
MEDIA_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("finchwire.api")
logging.basicConfig(level=logging.INFO)

STATE_FILE = Path(os.environ.get("FINCHWIRE_STATE_FILE", ROOT_DIR / "finchwire_state.json"))
store = JsonStateStore(STATE_FILE)

SECRET_KEY = os.environ.get("FINCHWIRE_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

DEFAULT_FEEDS = [
    "https://www.theverge.com/rss/index.xml",
    "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "https://www.reuters.com/world/rss",
    "https://www.wired.com/feed/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
]


def _state() -> Dict[str, Any]:
    return store.state


def _collection(key: str):
    return store.get_collection(key)


def _save_state() -> None:
    store.save()


def _users() -> Dict[str, Dict[str, Any]]:
    users = _collection("users")
    if not isinstance(users, dict):
        users = {}
        store.replace_collection("users", users)
    return users


def ensure_admin_user() -> None:
    users = _users()
    admin_password = os.environ.get("FINCHWIRE_ADMIN_PASSWORD", "admin123")
    admin = users.get("admin")
    should_replace = True
    if admin and admin.get("password"):
        try:
            should_replace = not pwd_context.verify(admin_password, admin["password"])
        except Exception:
            should_replace = True
    if should_replace:
        users["admin"] = {
            "username": "admin",
            "password": pwd_context.hash(admin_password),
            "createdAt": users.get("admin", {}).get("createdAt") or isoformat_utc(utcnow()),
            "updatedAt": isoformat_utc(utcnow()),
        }
        _save_state()
        logger.info("Ensured FinchWire admin user exists.")


ensure_admin_user()


def create_access_token(data: Dict[str, Any]) -> str:
    payload = data.copy()
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user(
    token: Optional[str] = Query(None),
    x_token: Optional[str] = Header(None, alias="x-finchwire-token"),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    actual_token = None
    if auth and auth.credentials:
        actual_token = auth.credentials
    elif x_token:
        actual_token = x_token
    elif token:
        actual_token = token

    username = verify_token(actual_token or "")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return username


def _extract_username_from_optional_auth(
    token: Optional[str],
    x_token: Optional[str],
    auth: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    actual = auth.credentials if auth and auth.credentials else (x_token or token or "")
    return verify_token(actual)


def _public_base_url(request: Request) -> str:
    configured = os.environ.get("FINCHWIRE_PUBLIC_BASE_URL")
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")


def _build_media_url(base_url: str, path: str, token: str) -> str:
    normalized = str(path or "").replace("\\", "/").strip("/")
    encoded = "/".join(quote(part) for part in normalized.split("/") if part)
    return f"{base_url}/media/{encoded}?token={quote(token)}"


def _default_settings() -> Dict[str, Any]:
    ai_provider = os.environ.get("FINCHWIRE_AI_PROVIDER", "none")
    tts_provider = os.environ.get("FINCHWIRE_TTS_PROVIDER", "none")
    return {
        "ai_provider": ai_provider,
        "tts_provider": tts_provider,
        "ai_api_key": os.environ.get("GEMINI_API_KEY", ""),
        "tts_api_key": os.environ.get("GEMINI_API_KEY", ""),  # Fallback for voice too
        "yt_download_url": os.environ.get("YT_DOWNLOAD_URL", ""),
        "weather_provider": "open_meteo",
        "market_provider": "coingecko_yahoo",
        "weather_api_key": "",
        "market_api_key": "",
        "youtube_api_key": "",
        "weather_location": os.environ.get("FINCHWIRE_WEATHER_LOCATION", "Omaha, NE"),
        "weather_lat": os.environ.get("FINCHWIRE_WEATHER_LAT", "41.2565"),
        "weather_lon": os.environ.get("FINCHWIRE_WEATHER_LON", "-95.9345"),
        "has_ai_api_key": bool(os.environ.get("GEMINI_API_KEY")),
        "has_tts_api_key": bool(os.environ.get("GEMINI_API_KEY")),
        "has_weather_api_key": False,
        "has_market_api_key": False,
        "has_youtube_api_key": False,
    }


def _settings_state() -> Dict[str, Any]:
    settings = _collection("settings")
    if not isinstance(settings, dict):
        settings = _default_settings()
        store.replace_collection("settings", settings)
    for key, value in _default_settings().items():
        settings.setdefault(key, value)
    return settings


def _safe_settings_payload(settings: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "ai_provider": settings.get("ai_provider", "none"),
        "tts_provider": settings.get("tts_provider", "none"),
        "yt_download_url": settings.get("yt_download_url", ""),
        "weather_provider": settings.get("weather_provider", "open_meteo"),
        "market_provider": settings.get("market_provider", "coingecko_yahoo"),
        "weather_location": settings.get("weather_location", "Omaha, NE"),
        "weather_lat": settings.get("weather_lat", "41.2565"),
        "weather_lon": settings.get("weather_lon", "-95.9345"),
        "has_ai_api_key": bool(settings.get("ai_api_key") or settings.get("has_ai_api_key")),
        "has_tts_api_key": bool(settings.get("tts_api_key") or settings.get("has_tts_api_key")),
        "has_weather_api_key": bool(settings.get("weather_api_key") or settings.get("has_weather_api_key")),
        "has_market_api_key": bool(settings.get("market_api_key") or settings.get("has_market_api_key")),
        "has_youtube_api_key": bool(settings.get("youtube_api_key") or settings.get("has_youtube_api_key")),
    }


def _normalized_ai_provider(provider: str) -> str:
    value = str(provider or "none").strip().lower()
    # Backward compatibility with previous naming in parts of the UI.
    if value == "xai":
        return "grok"
    return value


def _resolve_ai_api_key(provider: str, settings: Dict[str, Any]) -> str:
    configured = str(settings.get("ai_api_key") or "").strip()
    if configured:
        return configured

    env_lookup = {
        "gemini": os.environ.get("GEMINI_API_KEY", ""),
        "openai": os.environ.get("OPENAI_API_KEY", ""),
        "anthropic": os.environ.get("ANTHROPIC_API_KEY", ""),
        "groq": os.environ.get("GROQ_API_KEY", ""),
        "grok": os.environ.get("XAI_API_KEY", "") or os.environ.get("GROK_API_KEY", ""),
        "google": os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GOOGLE_TTS_API_KEY", "") or os.environ.get("GEMINI_API_KEY", ""),
    }
    return str(env_lookup.get(provider, "") or "").strip()


def _interest_profile_for_user(user_id: str) -> Dict[str, Any]:
    profiles = _collection("interest_profiles")
    if not isinstance(profiles, dict):
        profiles = {}
        store.replace_collection("interest_profiles", profiles)
    if user_id not in profiles:
        profiles[user_id] = create_interest_vector()
    profiles[user_id] = decay_interest_vector(profiles[user_id])
    return profiles[user_id]


def _set_interest_profile_for_user(user_id: str, profile: Dict[str, Any]) -> None:
    profiles = _collection("interest_profiles")
    profiles[user_id] = profile


def _map_feed_event_to_interaction(event_type: str, raw_value: Optional[float]) -> tuple[str, float]:
    normalized = str(event_type or "").strip().lower()
    numeric_value = 0.0
    if raw_value is not None:
        try:
            numeric_value = float(raw_value)
        except Exception:
            numeric_value = 0.0

    if normalized == "impression":
        return "story_impression", 1.0
    if normalized == "open":
        return "story_opened", 1.0
    if normalized == "click":
        return "story_clicked", 1.0
    if normalized == "dwell":
        # Value is expected in seconds. Do not overweight a single long session.
        # 0-20s => 0.35x, ~60s => 1.0x, >=180s => 2.2x
        if numeric_value <= 0:
            return "story_dwell", 0.35
        scale = max(0.35, min(2.2, numeric_value / 60.0))
        return "story_dwell", scale
    if normalized == "follow_topic":
        return "topic_followed", 1.0
    if normalized == "follow_source":
        return "source_followed", 1.0
    if normalized == "follow_creator":
        return "creator_followed", 1.0
    if normalized == "save":
        return "story_bookmarked", 1.0
    if normalized in {"hide", "not_interested"}:
        return "story_dismissed", 1.0
    return "story_opened", 0.5


def _notification_preferences_for_user(user_id: str) -> Dict[str, Any]:
    prefs = _collection("notification_preferences")
    if user_id not in prefs or not isinstance(prefs.get(user_id), dict):
        prefs[user_id] = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    normalized = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    normalized.update(prefs[user_id])
    prefs[user_id] = normalized
    return normalized


def _creator_watches_for_user(user_id: str) -> List[Dict[str, Any]]:
    watches = _collection("creator_watches")
    if user_id not in watches or not isinstance(watches.get(user_id), list):
        watches[user_id] = []
    return watches[user_id]


def _collect_global_interest_topics(limit_per_user: int = 5) -> List[str]:
    profiles = _collection("interest_profiles")
    topics: List[str] = []
    if not isinstance(profiles, dict):
        return topics
    for profile in profiles.values():
        topic_scores = profile.get("topics", {}) if isinstance(profile, dict) else {}
        if not isinstance(topic_scores, dict):
            continue
        ranked = sorted(topic_scores.items(), key=lambda item: item[1], reverse=True)[:limit_per_user]
        topics.extend([topic for topic, score in ranked if float(score) > 0.8])
    return list(dict.fromkeys(topics))


def _feed_urls_for_ingestion() -> List[str]:
    env_value = os.environ.get("FINCHWIRE_NEWS_FEEDS", "").strip()
    if env_value:
        base = [url.strip() for url in env_value.split(",") if url.strip()]
    else:
        base = list(DEFAULT_FEEDS)

    topics = _collect_global_interest_topics(5)
    for topic in topics[:8]:
        q = quote(topic)
        base.append(f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en")

    return list(dict.fromkeys(base))


def ingest_story_cycle() -> Dict[str, int]:
    stories = _collection("stories")
    mentions = _collection("story_mentions")
    feed_urls = _feed_urls_for_ingestion()
    incoming = ingest_feeds(feed_urls)
    merged = merge_stories(stories, mentions, incoming)
    store.replace_collection("stories", merged["stories"])
    store.replace_collection("story_mentions", merged["story_mentions"])
    return {
        "ingested": len(incoming),
        "stories": len(merged["stories"]),
        "mentions": len(merged["story_mentions"]),
    }


def poll_creator_events_cycle() -> Dict[str, int]:
    creator_watches = _collection("creator_watches")
    creator_events = _collection("creator_events")
    all_watches: List[Dict[str, Any]] = []
    if isinstance(creator_watches, dict):
        for watches in creator_watches.values():
            if isinstance(watches, list):
                all_watches.extend(watches)

    settings = _settings_state()
    youtube_api_key = (
        str(settings.get("youtube_api_key") or "").strip()
        or os.environ.get("YOUTUBE_API_KEY", "").strip()
    )
    generated = poll_youtube_creator_events(
        watches=all_watches,
        existing_events=creator_events,
        api_key=youtube_api_key,
    )
    if generated:
        creator_events.extend(generated)
        # Keep bounded event history.
        creator_events[:] = creator_events[-2000:]
        _save_state()

    return {
        "watchesChecked": len(all_watches),
        "eventsGenerated": len(generated),
    }


def _notifications_today_count(user_id: str, notifications: List[Dict[str, Any]]) -> int:
    now = utcnow().astimezone()
    today = now.date()
    total = 0
    for item in notifications:
        if item.get("userId") != user_id:
            continue
        created = str(item.get("createdAt") or "")
        if not created:
            continue
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone()
        except Exception:
            continue
        if created_dt.date() == today:
            total += 1
    return total


def _dispatch_push_notifications() -> Dict[str, int]:
    notifications = _collection("notifications")
    subscriptions = _collection("push_subscriptions")
    deliveries = _collection("notification_deliveries")
    push_access_token = os.environ.get("EXPO_PUSH_ACCESS_TOKEN", "").strip() or None

    sent = 0
    failed = 0
    skipped = 0

    by_user: Dict[str, List[Dict[str, Any]]] = {}
    for sub in subscriptions:
        if not bool(sub.get("enabled", True)):
            continue
        user_id = str(sub.get("userId") or "")
        if not user_id:
            continue
        by_user.setdefault(user_id, []).append(sub)

    for notification in notifications:
        if notification.get("deliveryStatus") != "queued":
            continue
        user_id = str(notification.get("userId") or "")
        targets = by_user.get(user_id, [])
        if not targets:
            notification["deliveryStatus"] = "skipped"
            skipped += 1
            continue

        delivered_any = False
        for sub in targets:
            token = str(sub.get("expoPushToken") or "")
            if not token:
                continue
            result = send_expo_push(
                expo_push_token=token,
                title=str(notification.get("title") or "FinchWire Alert"),
                body=str(notification.get("body") or ""),
                data={
                    "url": notification.get("url"),
                    "type": notification.get("type"),
                    "notificationId": notification.get("id"),
                },
                access_token=push_access_token,
            )
            delivery = {
                "id": str(uuid.uuid4()),
                "notificationId": notification.get("id"),
                "userId": user_id,
                "subscriptionId": sub.get("id"),
                "status": "sent" if result["ok"] else "failed",
                "response": result.get("response"),
                "createdAt": isoformat_utc(utcnow()),
            }
            deliveries.append(delivery)
            if result["ok"]:
                delivered_any = True
                sent += 1
            else:
                failed += 1

        if delivered_any:
            notification["deliveryStatus"] = "sent"
            notification["sentAt"] = isoformat_utc(utcnow())
        else:
            notification["deliveryStatus"] = "failed"

    _save_state()
    return {"sent": sent, "failed": failed, "skipped": skipped}


def run_notification_cycle() -> Dict[str, int]:
    users = _users()
    stories = _collection("stories")
    mentions = _collection("story_mentions")
    creator_events = _collection("creator_events")
    notifications = _collection("notifications")
    dedupe_rows = _collection("notification_dedupe")

    generated = 0
    now = utcnow()

    for user_id in users.keys():
        profile = _interest_profile_for_user(user_id)
        ranked_stories = compute_story_rankings(stories, mentions, profile)
        prefs = _notification_preferences_for_user(user_id)
        user_watches = _creator_watches_for_user(user_id)
        user_events = [
            event
            for event in creator_events
            if str(event.get("channelId") or "")
            in {str(w.get("channelId") or "") for w in user_watches}
        ]

        sent_keys = {
            str(row.get("dedupeKey"))
            for row in dedupe_rows
            if row.get("userId") == user_id
        }
        today_count = _notifications_today_count(user_id, notifications)

        story_notifs = build_story_notifications_for_user(
            user_id=user_id,
            stories_ranked=ranked_stories[:40],
            dedupe_keys_sent=sent_keys,
            preferences=prefs,
            now=now,
            notifications_today=today_count,
        )
        today_count += len(story_notifs)
        creator_notifs = build_creator_notifications_for_user(
            user_id=user_id,
            creator_events=user_events[-120:],
            user_watches=user_watches,
            dedupe_keys_sent=sent_keys,
            preferences=prefs,
            now=now,
            notifications_today=today_count,
        )

        fresh = story_notifs + creator_notifs
        if not fresh:
            continue
        notifications.extend(fresh)
        generated += len(fresh)
        for notif in fresh:
            dedupe_rows.append(
                {
                    "userId": user_id,
                    "dedupeKey": notif.get("dedupeKey"),
                    "createdAt": notif.get("createdAt"),
                }
            )

    notifications[:] = notifications[-5000:]
    dedupe_rows[:] = dedupe_rows[-20000:]
    _save_state()

    dispatch_stats = _dispatch_push_notifications()
    return {"generated": generated, **dispatch_stats}


def run_alert_cycle() -> Dict[str, Any]:
    ingest_stats = ingest_story_cycle()
    creator_stats = poll_creator_events_cycle()
    notification_stats = run_notification_cycle()
    return {
        "ingest": ingest_stats,
        "creators": creator_stats,
        "notifications": notification_stats,
    }


class LoginRequest(BaseModel):
    username: str = "admin"
    password: str


class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    error: Optional[str] = None


class SessionResponse(BaseModel):
    authenticated: bool
    username: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str
    filename: Optional[str] = None
    subfolder: Optional[str] = None
    is_audio: Optional[bool] = False


class MediaJob(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    original_url: str
    status: str = "queued"
    progress_percent: int = 0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    filename: str
    safe_filename: str
    relative_path: str = ""
    absolute_path: str = ""
    mime_type: Optional[str] = None
    file_size: int = 0
    source_domain: str = ""
    created_at: str = Field(default_factory=lambda: isoformat_utc(utcnow()))
    updated_at: str = Field(default_factory=lambda: isoformat_utc(utcnow()))
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    is_audio: bool = False
    keep_forever: bool = False
    view_count: int = 0


class UpdateServerSettingsRequest(BaseModel):
    ai_provider: Optional[str] = None
    tts_provider: Optional[str] = None
    ai_api_key: Optional[str] = None
    tts_api_key: Optional[str] = None
    yt_download_url: Optional[str] = None
    weather_provider: Optional[str] = None
    market_provider: Optional[str] = None
    weather_api_key: Optional[str] = None
    market_api_key: Optional[str] = None
    youtube_api_key: Optional[str] = None
    weather_location: Optional[str] = None
    weather_lat: Optional[str] = None
    weather_lon: Optional[str] = None


class AiSearchRequest(BaseModel):
    prompt: str


class AiSpeechRequest(BaseModel):
    audio_base64: str
    mime_type: str
    prompt: Optional[str] = None


class TtsRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None


class StoryFeedbackRequest(BaseModel):
    interaction_type: str
    story_id: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = None
    topics: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    creators: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    ai_query: Optional[str] = None
    ai_answer: Optional[str] = None
    value: Optional[float] = None
    occurred_at: Optional[str] = None


class FeedInteractionRequest(BaseModel):
    item_id: str
    item_type: str = "article"
    event_type: str
    title: Optional[str] = None
    source: Optional[str] = None
    topics: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    creators: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    value: Optional[float] = None
    occurred_at: Optional[str] = None


class PushSubscriptionRequest(BaseModel):
    expo_push_token: str
    platform: str = "android"
    device_id: Optional[str] = None
    enabled: bool = True


class NotificationPreferencesRequest(BaseModel):
    enabled: Optional[bool] = None
    breakingStory: Optional[bool] = None
    risingStory: Optional[bool] = None
    creatorLive: Optional[bool] = None
    creatorUpload: Optional[bool] = None
    quietHoursStart: Optional[str] = None
    quietHoursEnd: Optional[str] = None
    minSeverity: Optional[int] = None
    dailyCap: Optional[int] = None
    personalizedOnly: Optional[bool] = None


class CreatorWatchRequest(BaseModel):
    provider: str = "youtube"
    channelId: str
    displayName: str
    enabled: bool = True
    notifyOnLive: bool = True
    notifyOnUpload: bool = True
    notifyOnMajorUploadOnly: bool = False
    highPriority: bool = False
    tags: List[str] = Field(default_factory=list)


app = FastAPI(title="FinchWire API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "FinchWire API is running"}


@api_router.get("/health")
async def health():
    return {"status": "ok", "timestamp": isoformat_utc(utcnow())}


@api_router.get("/cors-proxy")
async def cors_proxy(url: str = Query(...)):
    import requests
    from fastapi.responses import Response
    try:
        res = requests.get(url, timeout=10)
        return Response(content=res.content, media_type=res.headers.get("content-type"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    users = _users()
    user = users.get(req.username)
    if not user or not pwd_context.verify(req.password, user.get("password", "")):
        return AuthResponse(success=False, error="Invalid username or password")
    token = create_access_token({"sub": req.username})
    return AuthResponse(success=True, token=token)


@api_router.post("/logout")
async def logout():
    return {"success": True}


@api_router.get("/session", response_model=SessionResponse)
async def session(
    token: Optional[str] = Query(None),
    x_token: Optional[str] = Header(None, alias="x-finchwire-token"),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    username = _extract_username_from_optional_auth(token, x_token, auth)
    if not username:
        return SessionResponse(authenticated=False)
    return SessionResponse(authenticated=True, username=username)


@api_router.post("/account/password")
async def change_password(
    payload: Dict[str, str],
    user: str = Depends(get_current_user),
):
    current_password = str(payload.get("current_password") or "")
    new_password = str(payload.get("new_password") or "")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    users = _users()
    current = users.get(user)
    if not current or not pwd_context.verify(current_password, current.get("password", "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    users[user]["password"] = pwd_context.hash(new_password)
    users[user]["updatedAt"] = isoformat_utc(utcnow())
    _save_state()
    return {"success": True}


@api_router.get("/settings")
async def get_settings(user: str = Depends(get_current_user)):
    return {"success": True, "settings": _safe_settings_payload(_settings_state())}


@api_router.patch("/settings")
async def patch_settings(payload: UpdateServerSettingsRequest, user: str = Depends(get_current_user)):
    settings = _settings_state()
    if payload.ai_provider is not None:
        settings["ai_provider"] = payload.ai_provider
    if payload.tts_provider is not None:
        settings["tts_provider"] = payload.tts_provider
    if payload.ai_api_key is not None:
        settings["ai_api_key"] = payload.ai_api_key.strip()
        settings["has_ai_api_key"] = bool(settings["ai_api_key"])
    if payload.tts_api_key is not None:
        settings["tts_api_key"] = payload.tts_api_key.strip()
        settings["has_tts_api_key"] = bool(settings["tts_api_key"])
    if payload.yt_download_url is not None:
        settings["yt_download_url"] = payload.yt_download_url.strip()
    if payload.weather_provider is not None:
        settings["weather_provider"] = payload.weather_provider
    if payload.market_provider is not None:
        settings["market_provider"] = payload.market_provider
    if payload.weather_api_key is not None:
        settings["weather_api_key"] = payload.weather_api_key.strip()
        settings["has_weather_api_key"] = bool(settings["weather_api_key"])
    if payload.market_api_key is not None:
        settings["market_api_key"] = payload.market_api_key.strip()
        settings["has_market_api_key"] = bool(settings["market_api_key"])
    if payload.youtube_api_key is not None:
        settings["youtube_api_key"] = payload.youtube_api_key.strip()
        settings["has_youtube_api_key"] = bool(settings["youtube_api_key"])
    if payload.weather_location is not None:
        settings["weather_location"] = payload.weather_location.strip()
    if payload.weather_lat is not None:
        settings["weather_lat"] = payload.weather_lat.strip()
    if payload.weather_lon is not None:
        settings["weather_lon"] = payload.weather_lon.strip()
    settings["updatedAt"] = isoformat_utc(utcnow())
    _save_state()
    return {"success": True, "settings": _safe_settings_payload(settings)}


@api_router.post("/ai/search")
async def ai_search(payload: AiSearchRequest, user: str = Depends(get_current_user)):
    settings = _settings_state()
    provider = _normalized_ai_provider(settings.get("ai_provider", "none"))
    if provider == "none":
        raise HTTPException(
            status_code=400,
            detail="AI provider is disabled. Set provider in Settings first.",
        )

    api_key = _resolve_ai_api_key(provider, settings)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"{provider.upper()} API key is missing. Add it in Settings → AI + Voice.",
        )

    try:
        result = run_ai_search(
            prompt=payload.prompt,
            provider=provider,
            api_key=api_key,
        )
    except AiSearchError as exc:
        logger.error(f"AI search failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "success": True,
        "provider": provider,
        **result.as_dict(),
    }


@api_router.post("/ai/tts")
async def ai_tts(payload: TtsRequest, user: str = Depends(get_current_user)):
    settings = _settings_state()
    provider = settings.get("tts_provider", "none")
    if provider == "none":
        raise HTTPException(
            status_code=400,
            detail="TTS provider is not configured. Enable it in Settings → AI + Voice.",
        )

    api_key = _resolve_ai_api_key(provider, settings)
    if not api_key:
        api_key = settings.get("tts_api_key", "")
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"{provider.title()} API key is missing. Add it in Settings → AI + Voice.",
        )

    try:
        from services.ai_voice import run_tts
        audio_base64 = run_tts(
            text=payload.text,
            provider=provider,
            api_key=api_key,
            voice_id=payload.voice_id,
        )
    except Exception as exc:
        logger.error(f"TTS failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Voice Generation Unavailable: {str(exc)}")

    return {
        "success": True,
        "provider": provider,
        "audio_base64": audio_base64,
        "format": "mp3",
    }


@api_router.post("/ai/speech")
async def ai_speech(payload: AiSpeechRequest, user: str = Depends(get_current_user)):
    settings = _settings_state()
    provider = _normalized_ai_provider(settings.get("ai_provider", "none"))
    if provider != "gemini":
        raise HTTPException(
            status_code=400,
            detail="Speech AI is currently only supported via Gemini. Switch provider in Settings.",
        )

    api_key = _resolve_ai_api_key(provider, settings)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is missing. Add it in Settings → AI + Voice.",
        )

    try:
        from services.ai_search import run_ai_speech_search
        result = run_ai_speech_search(
            api_key=api_key,
            audio_base64=payload.audio_base64,
            mime_type=payload.mime_type,
            prompt=payload.prompt or "Transcribe and answer concisely.",
        )
    except Exception as exc:
        logger.error(f"AI speech failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Voice AI Unavailable: {str(exc)}")

    return {
        "success": True,
        "provider": provider,
        **result.as_dict(),
    }


@api_router.get("/stories/{story_id}/insight")
async def get_story_insight(story_id: str, user: str = Depends(get_current_user)):
    stories = _collection("stories")
    story = next((s for s in stories if s.get("id") == story_id), None)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    settings = _settings_state()
    provider = _normalized_ai_provider(settings.get("ai_provider", "none"))
    api_key = _resolve_ai_api_key(provider, settings)

    if not api_key or provider == "none":
        return {"answer": "I would love to give you my thoughts, but you haven't given me an AI key yet. Typical."}

    # Generate a sassy TL;DR
    prompt = (
        f"Give me a sassy, opinionated 1-sentence insight about this news story:\n"
        f"Title: {story.get('title')}\n"
        f"Source: {story.get('source')}\n"
        f"Summary: {story.get('summary')[:300]}"
    )
    
    try:
        from services.ai_search import run_ai_search
        res = run_ai_search(prompt, provider, api_key)
        return {"answer": res.answer}
    except Exception as e:
        logger.error(f"Story insight failed: {e}")
        return {"answer": "I'm too busy being fabulous to read this right now. Try again later."}


@api_router.get("/home/weather")
async def get_home_weather(unit: str = Query("f"), user: str = Depends(get_current_user)):
    normalized_unit = str(unit or "f").strip().lower()
    if normalized_unit not in {"f", "c"}:
        raise HTTPException(status_code=400, detail="unit must be f or c")
    settings = _settings_state()
    try:
        snapshot = get_weather_snapshot(
            unit=normalized_unit,
            config={
                "weather_provider": settings.get("weather_provider"),
                "weather_api_key": settings.get("weather_api_key"),
                "weather_location": settings.get("weather_location"),
                "weather_lat": settings.get("weather_lat"),
                "weather_lon": settings.get("weather_lon"),
            },
        )
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, "snapshot": snapshot.as_dict()}


@api_router.get("/home/market")
async def get_home_market(
    symbol: str = Query(..., min_length=1),
    assetType: str = Query("crypto"),
    user: str = Depends(get_current_user),
):
    normalized_asset_type = str(assetType or "").strip().lower()
    if normalized_asset_type not in {"stock", "crypto"}:
        raise HTTPException(status_code=400, detail="assetType must be stock or crypto")
    settings = _settings_state()
    try:
        quote = get_market_quote(
            symbol=symbol,
            asset_type=normalized_asset_type,
            config={
                "market_provider": settings.get("market_provider"),
                "market_api_key": settings.get("market_api_key"),
            },
        )
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, "quote": quote.as_dict()}


@api_router.get("/home/verse")
async def get_home_verse(user: str = Depends(get_current_user)):
    try:
        verse = get_verse_of_day()
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, "verse": verse.as_dict()}


@api_router.get("/downloads", response_model=List[MediaJob])
async def get_downloads(user: str = Depends(get_current_user)):
    return _collection("downloads")


@api_router.post("/downloads", response_model=MediaJob)
async def submit_download(req: DownloadRequest, user: str = Depends(get_current_user)):
    raw_name = req.filename or req.url.split("/")[-1] or "download"
    safe_name = raw_name.replace(" ", "_").strip() or f"download_{uuid.uuid4().hex[:8]}"
    source_domain = ""
    try:
        source_domain = urlparse(req.url).netloc.replace("www.", "")
    except Exception:
        source_domain = ""

    job = MediaJob(
        url=req.url.strip(),
        original_url=req.url.strip(),
        filename=raw_name,
        safe_filename=safe_name,
        relative_path=safe_name,
        source_domain=source_domain,
        status="queued",
        is_audio=bool(req.is_audio),
    )
    downloads = _collection("downloads")
    downloads.append(job.model_dump())

    # Capture interest signal from submitted URL/query terms.
    keywords = tokenize(req.url)
    profile = _interest_profile_for_user(user)
    profile = update_interest_vector(
        profile,
        "video_downloaded",
        topics=keywords[:6],
        keywords=keywords[:12],
        sources=[source_domain] if source_domain else [],
    )
    _set_interest_profile_for_user(user, profile)
    _save_state()
    return job


@api_router.delete("/downloads/{job_id}")
async def delete_download(job_id: str, user: str = Depends(get_current_user)):
    downloads = _collection("downloads")
    downloads[:] = [job for job in downloads if str(job.get("id")) != job_id]
    _save_state()
    return {"success": True}


@api_router.post("/downloads/{job_id}/retry")
async def retry_download(job_id: str, user: str = Depends(get_current_user)):
    downloads = _collection("downloads")
    for job in downloads:
        if str(job.get("id")) == job_id:
            job["status"] = "queued"
            job["progress_percent"] = 0
            job["updated_at"] = isoformat_utc(utcnow())
    _save_state()
    return {"success": True}


@api_router.patch("/downloads/{job_id}/keep")
async def keep_download(job_id: str, payload: Dict[str, Any], user: str = Depends(get_current_user)):
    keep_forever = bool(payload.get("keep_forever", False))
    downloads = _collection("downloads")
    found = None
    for job in downloads:
        if str(job.get("id")) == job_id:
            job["keep_forever"] = keep_forever
            job["updated_at"] = isoformat_utc(utcnow())
            found = job
            break
    if not found:
        raise HTTPException(status_code=404, detail="Download not found")
    _save_state()
    return {"success": True, "job": found}


@api_router.get("/downloads/{job_id}/share")
async def get_download_share(job_id: str, request: Request, user: str = Depends(get_current_user)):
    downloads = _collection("downloads")
    target = next((job for job in downloads if str(job.get("id")) == job_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Download not found")
    media_path = str(target.get("relative_path") or target.get("safe_filename") or "")
    if not media_path:
        raise HTTPException(status_code=404, detail="No playable media path")
    token = create_access_token({"sub": user})
    base_url = _public_base_url(request)
    media_url = _build_media_url(base_url, media_path, token)
    return {"success": True, "media_url": media_url, "share_url": media_url}


@api_router.get("/interests/me")
async def get_my_interests(user: str = Depends(get_current_user)):
    profile = _interest_profile_for_user(user)
    top_topics = sorted(
        profile.get("topics", {}).items(),
        key=lambda item: item[1],
        reverse=True,
    )[:12]
    return {
        "success": True,
        "interestVector": profile,
        "topTopics": [{"topic": topic, "score": round(float(score), 3)} for topic, score in top_topics],
    }


@api_router.post("/interests/feedback")
async def post_interest_feedback(payload: StoryFeedbackRequest, user: str = Depends(get_current_user)):
    vector = _interest_profile_for_user(user)
    
    # Extract AI-specific intent tokens if available
    keywords = list(payload.keywords or [])
    if payload.ai_query:
        # Boost keywords from user's AI questions
        keywords.extend(tokenize(payload.ai_query))
    if payload.ai_answer:
        # Include keywords from AI's generated knowledge
        keywords.extend(tokenize(payload.ai_answer))

    updated = update_interest_vector(
        vector,
        payload.interaction_type,
        topics=payload.topics,
        sources=[payload.source] if payload.source else [],
        creators=payload.creators,
        categories=payload.categories,
        keywords=keywords,
        weight_scale=1.0 if payload.interaction_type != "ai_interaction" else 1.5, # AI is highest signal
        occurred_at=parse_iso(payload.occurred_at) if payload.occurred_at else None,
    )
    _set_interest_profile_for_user(user, updated)
    _save_state()

    # Log interaction
    interactions = _collection("user_story_interactions")
    interactions.append({
        "id": str(uuid.uuid4()),
        "userId": user,
        "interactionType": payload.interaction_type,
        "storyId": payload.story_id,
        "aiQuery": payload.ai_query,
        "createdAt": isoformat_utc(utcnow()),
    })
    
    # Trigger background auto-sync/discovery based on new interest vector
    if payload.interaction_type == "ai_interaction":
        _trigger_auto_media_sync(user, updated)

    return {"success": True}


def _trigger_auto_media_sync(user: str, vector: Dict[str, Any]) -> None:
    """
    Search for highly relevant recent stories or videos and trigger auto-downloads.
    """
    try:
        from services.signal_algorithms import keyword_overlap_score
        
        # 1. Check Creator Events (YouTube)
        events = _collection("creator_events") or []
        downloads = _collection("downloads") or []
        existing_urls = {str(d.get("url", "")) for d in downloads}
        
        matches = []
        for ev in events:
            url = str(ev.get("url", ""))
            if not url or url in existing_urls:
                continue
            
            # Score match against user's interest vector
            text = f"{ev.get('title', '')} {' '.join(ev.get('topics', []))}"
            score = keyword_overlap_score(text, vector)
            if score >= 10.0: # Very strong match
                matches.append((score, url, str(ev.get("title", "")), "video"))
        
        # 2. Check Live Stories (Top Trending / Relevant)
        stories = _collection("stories") or []
        for story in stories:
            url = str(story.get("url", ""))
            if not url or url in existing_urls:
                continue
            
            text = f"{story.get('title', '')} {story.get('summary', '')}"
            score = keyword_overlap_score(text, vector)
            if score >= 14.0: # Extremely high interest
                 matches.append((score, url, str(story.get("title", "")), "article"))
        
        # Sort and take top 2
        matches.sort(key=lambda x: x[0], reverse=True)
        top_picks = matches[:2]
        
        if not top_picks:
            return

        for score, url, title, ktype in top_picks:
            _init_download_from_internal(url, title, ktype == "video")
            logger.info(f"Auto-sync triggered for {user}: Found {ktype} '{title[:40]}...' (score {score:.1f})")
            
    except Exception as exc:
        logger.error(f"Auto-sync logic failure: {exc}")


def _init_download_from_internal(url: str, title: str, is_video: bool) -> MediaJob:
    """Internal helper to bypass uvicorn dependency injection for background tasks."""
    raw_name = title.strip() or url.split("/")[-1] or "download"
    safe_name = raw_name.replace(" ", "_").strip() or f"sync_{uuid.uuid4().hex[:8]}"
    
    try:
        source_domain = urlparse(url).netloc.replace("www.", "")
    except Exception:
        source_domain = ""

    job = MediaJob(
        url=url.strip(),
        original_url=url.strip(),
        filename=raw_name,
        safe_filename=safe_name,
        relative_path=safe_name,
        source_domain=source_domain,
        status="queued",
        is_audio=not is_video,
    )
    _collection("downloads").append(job.model_dump())
    _save_state()
    return job


@api_router.post("/interactions/feed")
async def post_feed_interaction(payload: FeedInteractionRequest, user: str = Depends(get_current_user)):
    mapped_type, weight_scale = _map_feed_event_to_interaction(payload.event_type, payload.value)
    profile = _interest_profile_for_user(user)
    keyword_fallback = payload.keywords or tokenize(
        f"{payload.title or ''} {payload.source or ''} {' '.join(payload.topics or [])}"
    )
    profile = update_interest_vector(
        profile,
        mapped_type,
        topics=payload.topics,
        sources=[payload.source] if payload.source else [],
        creators=payload.creators,
        categories=payload.categories,
        keywords=keyword_fallback,
        weight_scale=weight_scale,
    )
    _set_interest_profile_for_user(user, profile)

    interactions = _collection("user_story_interactions")
    interactions.append(
        {
            "id": str(uuid.uuid4()),
            "userId": user,
            "itemId": payload.item_id,
            "itemType": payload.item_type,
            "eventType": payload.event_type,
            "mappedInteractionType": mapped_type,
            "value": payload.value,
            "weightScale": weight_scale,
            "title": payload.title,
            "source": payload.source,
            "topics": payload.topics,
            "categories": payload.categories,
            "creators": payload.creators,
            "keywords": keyword_fallback,
            "occurredAt": payload.occurred_at or isoformat_utc(utcnow()),
            "createdAt": isoformat_utc(utcnow()),
        }
    )
    interactions[:] = interactions[-12000:]
    _save_state()
    return {"success": True, "interestVector": profile}


@api_router.get("/live/stories")
async def get_live_stories(limit: int = 50, user: str = Depends(get_current_user)):
    profile = _interest_profile_for_user(user)
    ranked = compute_story_rankings(_collection("stories"), _collection("story_mentions"), profile)
    return {"success": True, "stories": ranked[: max(1, min(limit, 200))]}


@api_router.get("/live/stories/trending")
async def get_live_trending(limit: int = 30, user: str = Depends(get_current_user)):
    profile = _interest_profile_for_user(user)
    ranked = compute_story_rankings(_collection("stories"), _collection("story_mentions"), profile)
    trending = [story for story in ranked if float(story.get("hotnessScore", 0)) >= 20]
    return {"success": True, "stories": trending[: max(1, min(limit, 100))]}


@api_router.post("/live/stories/refresh")
async def refresh_live_stories(user: str = Depends(get_current_user)):
    stats = run_alert_cycle()
    return {"success": True, "stats": stats}


@api_router.get("/creators/watches")
async def get_creator_watches(user: str = Depends(get_current_user)):
    return {"success": True, "watches": _creator_watches_for_user(user)}


@api_router.post("/creators/watches")
async def upsert_creator_watch(payload: CreatorWatchRequest, user: str = Depends(get_current_user)):
    watches = _creator_watches_for_user(user)
    existing = next((w for w in watches if str(w.get("channelId")) == payload.channelId), None)
    watch_data = payload.model_dump()
    watch_data["id"] = existing.get("id") if existing else str(uuid.uuid4())
    watch_data["updatedAt"] = isoformat_utc(utcnow())
    watch_data["createdAt"] = existing.get("createdAt") if existing else isoformat_utc(utcnow())
    if existing:
        existing.update(watch_data)
    else:
        watches.append(watch_data)
    _save_state()
    return {"success": True, "watch": watch_data}


@api_router.delete("/creators/watches/{watch_id}")
async def delete_creator_watch(watch_id: str, user: str = Depends(get_current_user)):
    watches = _creator_watches_for_user(user)
    watches[:] = [watch for watch in watches if str(watch.get("id")) != watch_id]
    _save_state()
    return {"success": True}


@api_router.get("/creators/events")
async def get_creator_events(limit: int = 100, user: str = Depends(get_current_user)):
    channel_ids = {str(w.get("channelId")) for w in _creator_watches_for_user(user)}
    events = [
        event
        for event in _collection("creator_events")
        if str(event.get("channelId")) in channel_ids
    ]
    events.sort(key=lambda item: str(item.get("detectedAt", "")), reverse=True)
    return {"success": True, "events": events[: max(1, min(limit, 500))]}


@api_router.post("/push/subscribe")
async def subscribe_push(payload: PushSubscriptionRequest, user: str = Depends(get_current_user)):
    subscriptions = _collection("push_subscriptions")
    existing = next(
        (
            sub
            for sub in subscriptions
            if sub.get("userId") == user and sub.get("expoPushToken") == payload.expo_push_token
        ),
        None,
    )
    if existing:
        existing.update(
            {
                "platform": payload.platform,
                "deviceId": payload.device_id,
                "enabled": payload.enabled,
                "updatedAt": isoformat_utc(utcnow()),
            }
        )
        saved = existing
    else:
        saved = {
            "id": str(uuid.uuid4()),
            "userId": user,
            "expoPushToken": payload.expo_push_token,
            "platform": payload.platform,
            "deviceId": payload.device_id,
            "enabled": payload.enabled,
            "createdAt": isoformat_utc(utcnow()),
            "updatedAt": isoformat_utc(utcnow()),
        }
        subscriptions.append(saved)
    _save_state()
    return {"success": True, "subscription": saved}


@api_router.delete("/push/unsubscribe")
async def unsubscribe_push(token: str = Query(...), user: str = Depends(get_current_user)):
    subscriptions = _collection("push_subscriptions")
    subscriptions[:] = [
        sub for sub in subscriptions
        if not (sub.get("userId") == user and sub.get("expoPushToken") == token)
    ]
    _save_state()
    return {"success": True}


@api_router.get("/notifications/preferences")
async def get_notification_preferences(user: str = Depends(get_current_user)):
    prefs = _notification_preferences_for_user(user)
    return {"success": True, "preferences": prefs}


@api_router.post("/notifications/preferences")
async def update_notification_preferences(payload: NotificationPreferencesRequest, user: str = Depends(get_current_user)):
    prefs = _notification_preferences_for_user(user)
    updates = payload.model_dump(exclude_none=True)
    prefs.update(updates)
    _collection("notification_preferences")[user] = prefs
    _save_state()
    return {"success": True, "preferences": prefs}


@api_router.get("/notifications")
async def get_notifications(limit: int = 100, user: str = Depends(get_current_user)):
    rows = [item for item in _collection("notifications") if item.get("userId") == user]
    rows.sort(key=lambda item: str(item.get("createdAt", "")), reverse=True)
    return {"success": True, "notifications": rows[: max(1, min(limit, 500))]}


@api_router.patch("/notifications/{notification_id}/open")
async def mark_notification_open(notification_id: str, user: str = Depends(get_current_user)):
    rows = _collection("notifications")
    found = None
    for row in rows:
        if row.get("id") == notification_id and row.get("userId") == user:
            row["openedAt"] = isoformat_utc(utcnow())
            found = row
            break
    if not found:
        raise HTTPException(status_code=404, detail="Notification not found")
    _save_state()
    return {"success": True}


@api_router.post("/jobs/run-alert-cycle")
async def manual_alert_cycle(user: str = Depends(get_current_user)):
    stats = run_alert_cycle()
    return {"success": True, "stats": stats}


app.include_router(api_router)


@app.get("/media/{file_path:path}")
async def serve_media(
    file_path: str,
    token: Optional[str] = Query(None),
    x_token: Optional[str] = Header(None, alias="x-finchwire-token"),
):
    actual_token = token or x_token or ""
    if not verify_token(actual_token):
        raise HTTPException(status_code=401, detail="Unauthorized - valid token required")

    # 🎥 Handle legacy 'watch' paths to avoid 404s
    if file_path == "watch":
        # FinchWire HLS player and live channels use specific routes under /api/live
        raise HTTPException(status_code=400, detail="Use the /api/live endpoint for HLS playback")

    full_path = MEDIA_DIR / file_path
    
    # 🕵️ Smart extension lookup (checks for .mp4, .mp3, etc. automatically)
    if not full_path.exists():
        for ext in ['.mp4', '.mp3', '.m4a', '.mkv', '.webm', '.ts']:
            alt_path = Path(str(full_path) + ext)
            if alt_path.exists():
                full_path = alt_path
                break
                
    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    return FileResponse(full_path)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _background_alert_scheduler() -> None:
    interval_sec = max(60, int(os.environ.get("FINCHWIRE_ALERT_POLL_INTERVAL_SEC", "300")))
    while True:
        try:
            stats = await asyncio.to_thread(run_alert_cycle)
            logger.info("FinchWire alert cycle completed: %s", json.dumps(stats))
        except Exception as exc:
            logger.exception("FinchWire alert cycle failed: %s", exc)
        await asyncio.sleep(interval_sec)


@app.on_event("startup")
async def startup_event():
    app.state.alert_task = asyncio.create_task(_background_alert_scheduler())
    app.state.download_task = asyncio.create_task(media_worker_loop(store, MEDIA_DIR))


@app.on_event("shutdown")
async def shutdown_event():
    task = getattr(app.state, "alert_task", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
# Setup Static Directories
FRONTEND_DIST = ROOT_DIR.parent / "frontend" / "dist"
WEBSITE_DIR = ROOT_DIR.parent / "website"

# 1. Mount Terms & Privacy from the marketing folder first
if WEBSITE_DIR.is_dir():
    if (WEBSITE_DIR / "privacy").is_dir():
        app.mount("/privacy", StaticFiles(directory=str(WEBSITE_DIR / "privacy"), html=True), name="privacy")
    if (WEBSITE_DIR / "terms").is_dir():
        app.mount("/terms", StaticFiles(directory=str(WEBSITE_DIR / "terms"), html=True), name="terms")

# 2. Mount the Main Media Player Dashboard as the Root
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="dashboard")
elif WEBSITE_DIR.is_dir():
    # Fallback to Landing Page if Player isn't built/pushed yet
    app.mount("/", StaticFiles(directory=str(WEBSITE_DIR), html=True), name="website")
