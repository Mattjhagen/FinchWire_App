# FinchWire AI-Personalized Alerting (Deterministic v1)

## 1. Architecture Overview

FinchWire now uses a deterministic backend signal pipeline for personalized stories and creator alerts.

Core backend modules:

- `backend/services/signal_algorithms.py`
  - interest vector creation/update/decay
  - story score calculations (`popularityScore`, `velocityScore`, `hotnessScore`)
  - quiet-hours helper + reason-code support
- `backend/services/news_pipeline.py`
  - RSS ingestion
  - URL/title normalization + canonicalization
  - deduplication grouping
  - story mention tracking + ranking
- `backend/services/creator_monitor.py`
  - YouTube creator polling via official YouTube Data API
  - event types: `live_started`, `livestream_scheduled`, `video_published`
  - dedupe key generation
- `backend/services/notification_engine.py`
  - notification eligibility rules
  - daily cap, severity, quiet hours, preference gates
  - dedupe-safe notification creation
  - Expo push delivery
- `backend/services/state_store.py`
  - persisted JSON state with typed collections

Main API/service orchestration:

- `backend/server.py`
  - auth, settings, downloads, interests, stories, creator watches/events, push subscriptions, notifications
  - scheduled background alert cycle
  - manual cycle trigger endpoint

Frontend integration:

- `frontend/app/(tabs)/discover.tsx`
  - consumes backend-ranked personalized stories
  - sends explicit feedback actions (`Interested`, `Not for me`, `Follow topic`, `Mute topic`)
- `frontend/app/(tabs)/alerts.tsx`
  - creator watchlist management
  - notifications center
  - manual cycle trigger
- `frontend/app/(tabs)/settings.tsx`
  - push permission + subscribe/unsubscribe
  - notification preferences editor
- `frontend/src/services/api.ts`
  - typed client methods for new backend endpoints
- `frontend/src/services/pushNotifications.ts`
  - Expo push token registration and local token persistence

---

## 2. Data Flow

1. **Ingestion**
   - fetch RSS feeds
   - normalize + dedupe + merge stories
   - append story mentions with timestamps

2. **Interest learning**
   - user interactions (`story_liked`, `story_dismissed`, `topic_muted`, etc.) update vector
   - recency decay applied over time

3. **Scoring**
   - rank stories by deterministic formula:
     - source diversity
     - mention velocity
     - recency
     - user-interest match
     - trusted-source bonus

4. **Creator monitoring**
   - poll watched channels
   - emit deduped creator events

5. **Notification decision engine**
   - apply preferences + severity + daily cap + quiet hours
   - enforce dedupe keys
   - queue notifications with explainable reason metadata

6. **Push delivery**
   - send queued notifications to Expo push tokens
   - store delivery records

---

## 3. Interest Learning Rules

Deterministic, provider-agnostic vector:

- dimensions: `topics`, `sources`, `creators`, `categories`, `keywords`
- positive/negative weights by interaction type
- score clamping and map-size limits
- exponential recency decay

This system works without an LLM and is ready for later model-assisted enrichment.

---

## 4. Story Hotness Rules

For each story:

- `popularityScore`: weighted source diversity + mention count + trusted-source bonus
- `velocityScore`: mention delta in sliding windows
- `hotnessScore`: combined popularity + velocity + freshness + user-interest match

Reason codes include:

- `rapidly_rising`
- `high_source_diversity`
- `matches_favorite_topic`
- `breaking_news_threshold`

---

## 5. Creator Monitoring Rules

User can watch channels with per-watch options:

- notify on live
- notify on uploads
- notify on major uploads only

Event dedupe prevents repeated alerts for the same live/video event.

---

## 6. Push Notification Lifecycle

1. User enables push in Settings.
2. App requests permission and gets Expo token.
3. Token is sent to backend subscription endpoint.
4. Backend queues notifications from story/creator pipeline.
5. Push worker sends via Expo API and records delivery status.

---

## 7. Config / Env Vars

Backend:

- `FINCHWIRE_STATE_FILE` (optional JSON state path)
- `FINCHWIRE_ADMIN_PASSWORD`
- `FINCHWIRE_NEWS_FEEDS` (comma-separated RSS feed URLs, optional)
- `FINCHWIRE_ALERT_POLL_INTERVAL_SEC` (default 300)
- `YOUTUBE_API_KEY` (required for creator polling)
- `EXPO_PUSH_ACCESS_TOKEN` (optional; recommended for production push auth)
- `FINCHWIRE_PUBLIC_BASE_URL` (optional media URL generation override)

Frontend:

- no new mandatory env vars
- requires `expo-notifications` + `expo-device`

---

## 8. Known Limitations

- v1 story ingestion uses RSS feeds (no premium feed APIs yet).
- YouTube monitoring depends on Data API quotas.
- State store is JSON-backed for simplicity; migrate to DB for scale.
- LLM summarization/reranking is not part of trigger logic by design.

---

## 9. Recommended Next Steps

1. Move JSON state to Postgres/Supabase tables with indexes.
2. Add explicit analytics dashboard for alert CTR and suppressions.
3. Add digest scheduling and in-app explanation cards for each alert.
4. Add optional LLM summarization/classification layer behind a feature flag.
