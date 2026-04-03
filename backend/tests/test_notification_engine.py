from datetime import datetime, timezone

from services.notification_engine import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    build_creator_notifications_for_user,
    build_story_notifications_for_user,
)


def test_story_notifications_respect_dedupe_and_daily_cap():
    now = datetime(2026, 4, 3, 12, 0, 0, tzinfo=timezone.utc)
    prefs = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    prefs["dailyCap"] = 1
    story = {
        "id": "story-1",
        "title": "Major market shock",
        "url": "https://example.com/a",
        "isFresh": True,
        "hotnessScore": 55,
        "velocityScore": 6,
        "popularityScore": 70,
        "userInterestMatch": 5.0,
        "reasonCodes": ["rapidly_rising"],
        "sources": ["reuters.com", "bbc.com"],
    }

    sent_keys = set()
    first = build_story_notifications_for_user(
        user_id="admin",
        stories_ranked=[story],
        dedupe_keys_sent=sent_keys,
        preferences=prefs,
        now=now,
        notifications_today=0,
    )
    assert len(first) == 1

    second = build_story_notifications_for_user(
        user_id="admin",
        stories_ranked=[story],
        dedupe_keys_sent=sent_keys,
        preferences=prefs,
        now=now,
        notifications_today=1,
    )
    assert len(second) == 0


def test_creator_notifications_require_matching_watch():
    now = datetime(2026, 4, 3, 12, 0, 0, tzinfo=timezone.utc)
    prefs = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    event = {
        "id": "e1",
        "channelId": "abc123",
        "eventType": "live_started",
        "title": "We are live",
        "url": "https://youtube.com/watch?v=xyz",
        "dedupeKey": "yt:abc123:live_started:xyz",
    }
    watch = {
        "channelId": "abc123",
        "displayName": "Sample Creator",
        "enabled": True,
        "notifyOnLive": True,
        "notifyOnUpload": True,
        "notifyOnMajorUploadOnly": False,
    }

    results = build_creator_notifications_for_user(
        user_id="admin",
        creator_events=[event],
        user_watches=[watch],
        dedupe_keys_sent=set(),
        preferences=prefs,
        now=now,
        notifications_today=0,
    )

    assert len(results) == 1
    assert results[0]["type"] == "favorite_creator_live"
    assert results[0]["reasonCode"] == "matches_favorite_creator"
