from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso(value: str) -> datetime:
    if not value:
        return utcnow()
    candidate = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(candidate)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def isoformat_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def normalize_token(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else " " for ch in str(value)).strip()


def tokenize(value: str) -> List[str]:
    parts = normalize_token(value).split()
    return [p for p in parts if len(p) >= 3]


DEFAULT_INTERACTION_WEIGHTS: Dict[str, float] = {
    "story_impression": 0.35,
    "story_opened": 1.6,
    "story_clicked": 2.2,
    "story_dwell": 2.0,
    "story_bookmarked": 3.2,
    "story_liked": 3.8,
    "source_followed": 3.9,
    "topic_followed": 4.0,
    "creator_followed": 4.5,
    "video_played": 2.4,
    "video_downloaded": 2.8,
    "notification_opened": 2.0,
    "story_dismissed": -3.0,
    "topic_muted": -6.0,
    "creator_muted": -6.0,
    "notification_ignored": -0.7,
}


def create_interest_vector() -> Dict[str, object]:
    return {
        "topics": {},
        "sources": {},
        "creators": {},
        "categories": {},
        "keywords": {},
        "updatedAt": isoformat_utc(utcnow()),
    }


def _apply_weight(
    target: Dict[str, float],
    keys: Iterable[str],
    weight: float,
    clamp_min: float = -12.0,
    clamp_max: float = 30.0,
) -> None:
    for key in keys:
        normalized = normalize_token(key).strip()
        if not normalized:
            continue
        next_value = float(target.get(normalized, 0.0)) + weight
        target[normalized] = clamp(next_value, clamp_min, clamp_max)


def _limit_map_size(target: Dict[str, float], limit: int = 800) -> Dict[str, float]:
    if len(target) <= limit:
        return target
    ranked = sorted(target.items(), key=lambda item: item[1], reverse=True)[:limit]
    return {key: value for key, value in ranked}


def update_interest_vector(
    vector: Dict[str, object],
    interaction_type: str,
    *,
    topics: Optional[Iterable[str]] = None,
    sources: Optional[Iterable[str]] = None,
    creators: Optional[Iterable[str]] = None,
    categories: Optional[Iterable[str]] = None,
    keywords: Optional[Iterable[str]] = None,
    weight_scale: float = 1.0,
    occurred_at: Optional[datetime] = None,
) -> Dict[str, object]:
    base = dict(vector or create_interest_vector())
    base.setdefault("topics", {})
    base.setdefault("sources", {})
    base.setdefault("creators", {})
    base.setdefault("categories", {})
    base.setdefault("keywords", {})

    weight = float(DEFAULT_INTERACTION_WEIGHTS.get(interaction_type, 1.0))
    weight = weight * max(0.05, float(weight_scale))
    _apply_weight(base["topics"], topics or [], weight)
    _apply_weight(base["sources"], sources or [], weight * 0.85)
    _apply_weight(base["creators"], creators or [], weight * 0.95)
    _apply_weight(base["categories"], categories or [], weight * 0.9)
    _apply_weight(base["keywords"], keywords or [], weight * 0.75)

    base["topics"] = _limit_map_size(base["topics"])
    base["sources"] = _limit_map_size(base["sources"], 300)
    base["creators"] = _limit_map_size(base["creators"], 300)
    base["categories"] = _limit_map_size(base["categories"], 200)
    base["keywords"] = _limit_map_size(base["keywords"], 1000)

    base["updatedAt"] = isoformat_utc(occurred_at or utcnow())
    return base


def decay_interest_vector(
    vector: Dict[str, object],
    *,
    now: Optional[datetime] = None,
    half_life_days: float = 14.0,
) -> Dict[str, object]:
    base = dict(vector or create_interest_vector())
    last_updated = parse_iso(str(base.get("updatedAt", "")))
    current = now or utcnow()
    elapsed_hours = max(0.0, (current - last_updated).total_seconds() / 3600.0)

    if elapsed_hours <= 0:
        return base

    half_life_hours = max(1.0, half_life_days * 24.0)
    decay_factor = math.exp(-math.log(2) * (elapsed_hours / half_life_hours))

    def apply_decay(target: Dict[str, float]) -> Dict[str, float]:
        decayed: Dict[str, float] = {}
        for key, score in target.items():
            next_score = float(score) * decay_factor
            if abs(next_score) >= 0.05:
                decayed[key] = next_score
        return decayed

    for field in ("topics", "sources", "creators", "categories", "keywords"):
        target = base.get(field, {})
        if isinstance(target, dict):
            base[field] = apply_decay(target)

    base["updatedAt"] = isoformat_utc(current)
    return base


def keyword_overlap_score(text: str, vector: Dict[str, object]) -> float:
    haystack_tokens = set(tokenize(text))
    if not haystack_tokens:
        return 0.0
    keywords = vector.get("keywords", {}) if isinstance(vector, dict) else {}
    if not isinstance(keywords, dict):
        return 0.0

    score = 0.0
    for token in haystack_tokens:
        if token in keywords:
            score += float(keywords[token])
    return max(0.0, score)


@dataclass
class StoryMetrics:
    unique_source_count: int
    mentions_last_hour: int
    mentions_prev_hour: int
    mentions_last_6h: int
    age_hours: float
    user_interest_match: float
    trusted_source_count: int


def compute_story_scores(metrics: StoryMetrics) -> Dict[str, float]:
    velocity = float(metrics.mentions_last_hour - metrics.mentions_prev_hour)
    velocity_score = max(0.0, velocity)

    freshness_score = max(0.0, 1.0 - (metrics.age_hours / 48.0))
    source_diversity = max(0, metrics.unique_source_count)
    mentions_6h = max(0, metrics.mentions_last_6h)
    trust_bonus = max(0, metrics.trusted_source_count) * 1.2

    popularity_score = (
        source_diversity * 6.0
        + min(mentions_6h, 60) * 1.35
        + trust_bonus
    )

    hotness_score = (
        source_diversity * 2.4
        + velocity_score * 4.0
        + freshness_score * 20.0
        + max(0.0, metrics.user_interest_match) * 3.1
        + trust_bonus
    )

    return {
        "popularityScore": round(popularity_score, 3),
        "velocityScore": round(velocity_score, 3),
        "hotnessScore": round(hotness_score, 3),
        "freshnessScore": round(freshness_score, 3),
    }


def derive_story_reason_codes(
    scores: Dict[str, float],
    *,
    unique_source_count: int,
    user_interest_match: float,
) -> List[str]:
    reasons: List[str] = []
    if scores.get("velocityScore", 0) >= 3:
        reasons.append("rapidly_rising")
    if unique_source_count >= 6:
        reasons.append("high_source_diversity")
    if user_interest_match >= 4:
        reasons.append("matches_favorite_topic")
    if scores.get("hotnessScore", 0) >= 45:
        reasons.append("breaking_news_threshold")
    return reasons or ["baseline_ranked"]


def is_within_quiet_hours(
    now: datetime,
    *,
    quiet_start: Optional[str],
    quiet_end: Optional[str],
) -> bool:
    if not quiet_start or not quiet_end:
        return False

    def parse_hhmm(value: str) -> Optional[Tuple[int, int]]:
        chunks = str(value).split(":")
        if len(chunks) != 2:
            return None
        try:
            hh = int(chunks[0])
            mm = int(chunks[1])
        except ValueError:
            return None
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            return None
        return hh, mm

    start = parse_hhmm(quiet_start)
    end = parse_hhmm(quiet_end)
    if not start or not end:
        return False

    local = now.astimezone()
    current_minutes = local.hour * 60 + local.minute
    start_minutes = start[0] * 60 + start[1]
    end_minutes = end[0] * 60 + end[1]

    if start_minutes == end_minutes:
        return False
    if start_minutes < end_minutes:
        return start_minutes <= current_minutes < end_minutes
    return current_minutes >= start_minutes or current_minutes < end_minutes


def is_story_fresh(published_at_iso: str, freshness_hours: int = 36) -> bool:
    published_at = parse_iso(published_at_iso)
    return (utcnow() - published_at) <= timedelta(hours=freshness_hours)
