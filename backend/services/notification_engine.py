from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Dict, Iterable, List, Optional, Tuple

import requests

from .creator_monitor import is_major_upload
from .signal_algorithms import is_within_quiet_hours, isoformat_utc, utcnow


DEFAULT_NOTIFICATION_PREFERENCES = {
    "enabled": True,
    "breakingStory": True,
    "risingStory": True,
    "creatorLive": True,
    "creatorUpload": True,
    "quietHoursStart": None,
    "quietHoursEnd": None,
    "minSeverity": 20,
    "dailyCap": 12,
    "personalizedOnly": False,
}


def _notification_id(user_id: str, dedupe_key: str) -> str:
    return hashlib.sha1(f"{user_id}:{dedupe_key}".encode("utf-8")).hexdigest()[:22]


def _severity_from_story(story: Dict[str, object]) -> int:
    hotness = float(story.get("hotnessScore", 0))
    velocity = float(story.get("velocityScore", 0))
    score = int(min(100, max(0, hotness * 1.5 + velocity * 6)))
    return score


def _can_send_by_preferences(
    prefs: Dict[str, object],
    *,
    now: datetime,
    severity: int,
    notifications_today: int,
    type_name: str,
) -> Tuple[bool, str]:
    if not bool(prefs.get("enabled", True)):
        return False, "prefs_disabled"
    if notifications_today >= int(prefs.get("dailyCap", DEFAULT_NOTIFICATION_PREFERENCES["dailyCap"])):
        return False, "daily_cap_reached"
    if severity < int(prefs.get("minSeverity", DEFAULT_NOTIFICATION_PREFERENCES["minSeverity"])):
        return False, "below_min_severity"
    if is_within_quiet_hours(
        now,
        quiet_start=str(prefs.get("quietHoursStart") or ""),
        quiet_end=str(prefs.get("quietHoursEnd") or ""),
    ) and severity < 85:
        return False, "quiet_hours"

    type_gate_map = {
        "breaking_story": "breakingStory",
        "rising_story": "risingStory",
        "favorite_creator_live": "creatorLive",
        "favorite_creator_upload": "creatorUpload",
        "topic_alert": "breakingStory",
    }
    pref_key = type_gate_map.get(type_name)
    if pref_key and not bool(prefs.get(pref_key, True)):
        return False, f"{pref_key}_disabled"

    return True, "ok"


def build_story_notifications_for_user(
    *,
    user_id: str,
    stories_ranked: Iterable[Dict[str, object]],
    dedupe_keys_sent: set,
    preferences: Dict[str, object],
    now: Optional[datetime] = None,
    notifications_today: int = 0,
) -> List[Dict[str, object]]:
    current = now or utcnow()
    notifications: List[Dict[str, object]] = []
    today_count = notifications_today

    for story in stories_ranked:
        if not bool(story.get("isFresh", True)):
            continue
        hotness = float(story.get("hotnessScore", 0))
        interest_match = float(story.get("userInterestMatch", 0))
        reason_codes = list(story.get("reasonCodes", []))

        if hotness >= 45:
            notif_type = "breaking_story"
            dedupe_key = f"story:{story.get('id')}:breaking"
        elif hotness >= 28 and float(story.get("velocityScore", 0)) >= 2:
            notif_type = "rising_story"
            dedupe_key = f"story:{story.get('id')}:rising"
        elif interest_match >= 5:
            notif_type = "topic_alert"
            dedupe_key = f"story:{story.get('id')}:interest"
            reason_codes = reason_codes + ["matches_favorite_topic"]
        else:
            continue

        if dedupe_key in dedupe_keys_sent:
            continue

        if bool(preferences.get("personalizedOnly", False)) and interest_match < 2:
            continue

        severity = _severity_from_story(story)
        allowed, blocked_reason = _can_send_by_preferences(
            preferences,
            now=current,
            severity=severity,
            notifications_today=today_count,
            type_name=notif_type,
        )
        if not allowed:
            continue

        reason_code = reason_codes[0] if reason_codes else blocked_reason
        explanation = (
            f"Story is trending with hotness {hotness:.1f}; "
            f"interest match {interest_match:.1f}; reasons: {', '.join(reason_codes[:3]) or 'ranked'}."
        )

        notification = {
            "id": _notification_id(user_id, dedupe_key),
            "userId": user_id,
            "type": notif_type,
            "title": str(story.get("title") or "Trending story"),
            "body": explanation,
            "url": str(story.get("url") or ""),
            "imageUrl": story.get("imageUrl"),
            "createdAt": isoformat_utc(current),
            "sentAt": None,
            "openedAt": None,
            "deliveryStatus": "queued",
            "dedupeKey": dedupe_key,
            "reasonCode": reason_code,
            "reasonMetadata": {
                "hotnessScore": hotness,
                "velocityScore": float(story.get("velocityScore", 0)),
                "popularityScore": float(story.get("popularityScore", 0)),
                "interestMatch": interest_match,
                "sourceCount": len(story.get("sources", [])),
            },
            "severity": severity,
        }
        notifications.append(notification)
        dedupe_keys_sent.add(dedupe_key)
        today_count += 1

    return notifications


def build_creator_notifications_for_user(
    *,
    user_id: str,
    creator_events: Iterable[Dict[str, object]],
    user_watches: Iterable[Dict[str, object]],
    dedupe_keys_sent: set,
    preferences: Dict[str, object],
    now: Optional[datetime] = None,
    notifications_today: int = 0,
) -> List[Dict[str, object]]:
    current = now or utcnow()
    by_channel = {
        str(watch.get("channelId")): watch
        for watch in user_watches
        if str(watch.get("channelId") or "")
    }
    notifications: List[Dict[str, object]] = []
    today_count = notifications_today

    for event in creator_events:
        channel_id = str(event.get("channelId") or "")
        watch = by_channel.get(channel_id)
        if not watch or not bool(watch.get("enabled", True)):
            continue

        event_type = str(event.get("eventType") or "")
        if event_type == "live_started":
            notif_type = "favorite_creator_live"
            if not bool(watch.get("notifyOnLive", True)):
                continue
            severity = 82
        elif event_type in {"video_published", "livestream_scheduled"}:
            notif_type = "favorite_creator_upload"
            if not bool(watch.get("notifyOnUpload", True)):
                continue
            if bool(watch.get("notifyOnMajorUploadOnly", False)) and not is_major_upload(event, watch):
                continue
            severity = 58 if event_type == "video_published" else 45
        else:
            continue

        dedupe_key = str(event.get("dedupeKey") or f"creator:{channel_id}:{event.get('id')}")
        if dedupe_key in dedupe_keys_sent:
            continue

        allowed, _ = _can_send_by_preferences(
            preferences,
            now=current,
            severity=severity,
            notifications_today=today_count,
            type_name=notif_type,
        )
        if not allowed:
            continue

        display_name = str(watch.get("displayName") or event.get("channelId") or "Favorite creator")
        title = (
            f"{display_name} is live now"
            if event_type == "live_started"
            else f"New upload from {display_name}"
        )
        body = str(event.get("title") or "New creator activity")

        notification = {
            "id": _notification_id(user_id, dedupe_key),
            "userId": user_id,
            "type": notif_type,
            "title": title,
            "body": body,
            "url": str(event.get("url") or ""),
            "imageUrl": event.get("thumbnailUrl"),
            "createdAt": isoformat_utc(current),
            "sentAt": None,
            "openedAt": None,
            "deliveryStatus": "queued",
            "dedupeKey": dedupe_key,
            "reasonCode": "matches_favorite_creator",
            "reasonMetadata": {
                "eventType": event_type,
                "channelId": channel_id,
                "creator": display_name,
            },
            "severity": severity,
        }
        notifications.append(notification)
        dedupe_keys_sent.add(dedupe_key)
        today_count += 1

    return notifications


def send_expo_push(
    *,
    expo_push_token: str,
    title: str,
    body: str,
    data: Dict[str, object],
    access_token: Optional[str] = None,
) -> Dict[str, object]:
    headers = {
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    payload = {
        "to": expo_push_token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data,
    }
    response = requests.post(
        "https://exp.host/--/api/v2/push/send",
        json=payload,
        headers=headers,
        timeout=8,
    )
    try:
        parsed = response.json()
    except Exception:
        parsed = {"raw": response.text}
    return {
        "statusCode": response.status_code,
        "ok": response.status_code < 300,
        "response": parsed,
    }

