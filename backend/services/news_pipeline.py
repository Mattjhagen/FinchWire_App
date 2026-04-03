from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
import xml.etree.ElementTree as ET

import requests

from .signal_algorithms import (
    StoryMetrics,
    compute_story_scores,
    derive_story_reason_codes,
    isoformat_utc,
    is_story_fresh,
    keyword_overlap_score,
    parse_iso,
    tokenize,
    utcnow,
)


TRUSTED_SOURCES = {
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "wsj.com",
    "ft.com",
    "nytimes.com",
}


def canonicalize_url(raw_url: str) -> str:
    try:
        parsed = urlparse(raw_url.strip())
    except Exception:
        return raw_url.strip()

    keep_query = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        lower = key.lower()
        if lower.startswith("utm_"):
            continue
        if lower in {"fbclid", "gclid", "mc_cid", "mc_eid"}:
            continue
        keep_query.append((key, value))
    normalized_query = urlencode(keep_query, doseq=True)
    return urlunparse(
        (
            parsed.scheme.lower() or "https",
            parsed.netloc.lower(),
            parsed.path.rstrip("/"),
            parsed.params,
            normalized_query,
            "",
        )
    )


def normalize_title(title: str) -> str:
    tokens = tokenize(title)
    return " ".join(tokens[:18])


def story_id_from_canonical(canonical_url: str, normalized_title: str) -> str:
    seed = f"{canonical_url}::{normalized_title}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:20]


def duplicate_group_from_title(normalized_title: str) -> str:
    return hashlib.sha1(normalized_title.encode("utf-8")).hexdigest()[:16]


def _text(node: Optional[ET.Element]) -> str:
    if node is None:
        return ""
    return "".join(node.itertext()).strip()


def parse_rss_feed(xml_text: str) -> List[Dict[str, object]]:
    parsed: List[Dict[str, object]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return parsed

    ns = {
        "media": "http://search.yahoo.com/mrss/",
        "dc": "http://purl.org/dc/elements/1.1/",
        "content": "http://purl.org/rss/1.0/modules/content/",
    }

    candidates = root.findall(".//item") + root.findall(".//entry")
    for item in candidates:
        title = _text(item.find("title"))
        link = _text(item.find("link"))
        if not link:
            href = item.find("link")
            if href is not None:
                link = href.attrib.get("href", "")

        if not link:
            continue

        summary = _text(item.find("description")) or _text(item.find("summary")) or _text(item.find("content:encoded", ns))
        source = _text(item.find("source")) or _text(item.find("dc:creator", ns))
        pub = _text(item.find("pubDate")) or _text(item.find("published")) or _text(item.find("updated"))
        image_url = ""
        media_thumb = item.find("media:thumbnail", ns)
        if media_thumb is not None:
            image_url = media_thumb.attrib.get("url", "")
        if not image_url:
            enclosure = item.find("enclosure")
            if enclosure is not None and "image/" in enclosure.attrib.get("type", ""):
                image_url = enclosure.attrib.get("url", "")

        parsed.append(
            {
                "title": title or "Untitled",
                "url": link,
                "summary": summary,
                "source": source,
                "publishedAt": pub,
                "imageUrl": image_url or None,
            }
        )
    return parsed


def ingest_feeds(feed_urls: Iterable[str], timeout_sec: float = 10.0) -> List[Dict[str, object]]:
    stories: List[Dict[str, object]] = []
    for url in feed_urls:
        try:
            response = requests.get(url, timeout=timeout_sec, headers={"User-Agent": "FinchWire/1.0"})
            if response.status_code >= 400:
                continue
            stories.extend(parse_rss_feed(response.text))
        except Exception:
            continue
    return stories


def merge_stories(
    existing_stories: List[Dict[str, object]],
    story_mentions: List[Dict[str, object]],
    incoming: List[Dict[str, object]],
) -> Dict[str, List[Dict[str, object]]]:
    now = utcnow()
    stories_by_id = {str(item.get("id")): item for item in existing_stories if item.get("id")}
    by_group: Dict[str, Dict[str, object]] = {}

    for story in stories_by_id.values():
        group = str(story.get("duplicateGroupId") or "")
        if group:
            by_group[group] = story

    for raw in incoming:
        title = str(raw.get("title") or "Untitled")
        canonical_url = canonicalize_url(str(raw.get("url") or ""))
        if not canonical_url:
            continue
        normalized_title = normalize_title(title)
        source = str(raw.get("source") or urlparse(canonical_url).netloc.replace("www.", ""))
        published_raw = str(raw.get("publishedAt") or "")
        published_at = parse_iso(published_raw) if published_raw else now

        duplicate_group_id = duplicate_group_from_title(normalized_title or canonical_url)
        existing = by_group.get(duplicate_group_id)
        if existing:
            story_id = str(existing["id"])
        else:
            story_id = story_id_from_canonical(canonical_url, normalized_title)

        story = stories_by_id.get(story_id, {})
        story_sources = list({*story.get("sources", []), source})
        story_topics = list({*story.get("topics", []), *tokenize(title)[:8]})
        story_keywords = list({*story.get("keywords", []), *tokenize(f"{title} {raw.get('summary', '')}")[:16]})

        merged_story = {
            "id": story_id,
            "title": title,
            "url": canonical_url,
            "source": source,
            "publishedAt": isoformat_utc(published_at),
            "summary": str(raw.get("summary") or ""),
            "imageUrl": raw.get("imageUrl"),
            "topics": story_topics[:16],
            "keywords": story_keywords[:32],
            "sources": story_sources[:20],
            "duplicateGroupId": duplicate_group_id,
            "createdAt": story.get("createdAt") or isoformat_utc(now),
            "updatedAt": isoformat_utc(now),
        }

        stories_by_id[story_id] = merged_story
        by_group[duplicate_group_id] = merged_story
        story_mentions.append(
            {
                "storyId": story_id,
                "observedAt": isoformat_utc(now),
                "source": source,
            }
        )

    mention_cutoff = now - timedelta(days=14)
    story_mentions = [
        mention for mention in story_mentions
        if parse_iso(str(mention.get("observedAt") or "")) >= mention_cutoff
    ]

    return {
        "stories": list(stories_by_id.values()),
        "story_mentions": story_mentions[-20000:],
    }


def compute_story_rankings(
    stories: List[Dict[str, object]],
    story_mentions: List[Dict[str, object]],
    interest_vector: Dict[str, object],
) -> List[Dict[str, object]]:
    now = utcnow()
    mentions_by_story: Dict[str, List[datetime]] = {}
    sources_by_story: Dict[str, set] = {}

    for mention in story_mentions:
        story_id = str(mention.get("storyId") or "")
        if not story_id:
            continue
        observed = parse_iso(str(mention.get("observedAt") or ""))
        mentions_by_story.setdefault(story_id, []).append(observed)
        source = str(mention.get("source") or "")
        if source:
            sources_by_story.setdefault(story_id, set()).add(source.lower().replace("www.", ""))

    ranked: List[Dict[str, object]] = []
    for story in stories:
        story_id = str(story.get("id") or "")
        published_at = parse_iso(str(story.get("publishedAt") or ""))
        age_hours = max(0.0, (now - published_at).total_seconds() / 3600.0)
        mentions = mentions_by_story.get(story_id, [])
        last_hour = 0
        prev_hour = 0
        last_6h = 0
        # Manual counts without relying on timezone.timedelta here.
        for ts in mentions:
            delta_hours = (now - ts).total_seconds() / 3600.0
            if delta_hours <= 1:
                last_hour += 1
            elif 1 < delta_hours <= 2:
                prev_hour += 1
            if delta_hours <= 6:
                last_6h += 1

        source_set = sources_by_story.get(story_id, set())
        text_blob = f"{story.get('title', '')} {story.get('summary', '')} {' '.join(story.get('topics', []))}"
        interest_match = keyword_overlap_score(text_blob, interest_vector)
        trusted_count = sum(1 for src in source_set if any(src.endswith(t) for t in TRUSTED_SOURCES))

        metrics = StoryMetrics(
            unique_source_count=max(1, len(source_set) or len(story.get("sources", [])) or 1),
            mentions_last_hour=last_hour,
            mentions_prev_hour=prev_hour,
            mentions_last_6h=last_6h,
            age_hours=age_hours,
            user_interest_match=interest_match,
            trusted_source_count=trusted_count,
        )
        scores = compute_story_scores(metrics)
        reasons = derive_story_reason_codes(
            scores,
            unique_source_count=metrics.unique_source_count,
            user_interest_match=metrics.user_interest_match,
        )

        ranked_story = {
            **story,
            "popularityScore": scores["popularityScore"],
            "velocityScore": scores["velocityScore"],
            "hotnessScore": scores["hotnessScore"],
            "freshnessScore": scores["freshnessScore"],
            "userInterestMatch": round(interest_match, 3),
            "reasonCodes": reasons,
            "isFresh": is_story_fresh(str(story.get("publishedAt") or "")),
        }
        ranked.append(ranked_story)

    ranked.sort(
        key=lambda item: (
            float(item.get("hotnessScore", 0)),
            float(item.get("velocityScore", 0)),
            float(item.get("popularityScore", 0)),
            str(item.get("publishedAt", "")),
        ),
        reverse=True,
    )
    return ranked
