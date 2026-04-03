# FinchWire

FinchWire is a media-first platform that combines:

1. A cross-platform Expo mobile app (iOS/Android/web).
2. A FastAPI backend for auth, downloads, media, personalization, and alerts.
3. A deterministic signal pipeline for personalized stories and creator notifications.

This README is intentionally up to date with the current shipped feature set.

## Current Feature Set

| Area | What is implemented now |
| --- | --- |
| Setup + Auth | First-launch setup, backend URL test, admin login, session/token compatibility |
| Media Playback | In-app playback, scrubber, background audio, Picture in Picture, autoplay, shuffle |
| Downloads | Queue downloads, retry/cancel, keep/unkeep retention flag, local offline downloads |
| Sharing | Share media URLs, Android share-intent ingestion, deep links for shared media |
| VLC | "Open in VLC" external launch supported |
| Home Dashboard | Prompt/action hero, queue cards, smart tiles (weather/market/verse), personalized feed |
| Discover | Ranked stories, follow controls, interested/not interested/mute actions |
| Alerts | Notification center, creator watchlist, manual alert-cycle trigger |
| Push Notifications | Expo token registration, backend subscription + delivery pipeline |
| Creator Monitoring | YouTube creator polling with live/upload/scheduled event detection |
| Story Intelligence | RSS ingestion, normalization, dedupe, popularity/velocity/hotness scoring |
| Settings | Backend URL, password change, AI/TTS provider selection (`Gemini`, `OpenAI`, `Anthropic`, `Grok`, `Groq`), API key management, notification prefs |
| Security | Optional App Lock with biometrics + 4-6 digit PIN fallback and relock timer |
| Live TV | `/live` route with YouTube embed channel guide and persisted channel selection |

## Mobile App Navigation

Bottom tabs:

1. `Home`
2. `Discover`
3. `Downloads`
4. `Alerts`
5. `Fetch`
6. `Settings`

Additional routes:

1. `/setup` (first-run setup)
2. `/(auth)/login`
3. `/player/[id]` (media player modal)
4. `/article` (article reader + dwell tracking)
5. `/live` (YouTube live channel guide)

## Architecture

```text
frontend/
  app/
    _layout.tsx                     # Root gate, auth/app-lock/deep-link/share-intent handling
    setup.tsx                       # First-launch backend + password setup
    article.tsx                     # Reader with dwell-time tracking
    live.tsx                        # Live TV page
    player/[id].tsx                 # Full media player
    (auth)/login.tsx
    (tabs)/
      index.tsx                     # Home dashboard
      discover.tsx                  # Personalized discover feed
      downloads.tsx                 # Queue + local downloads
      alerts.tsx                    # Notification center + creator watches
      add.tsx                       # Add URL / fetch workflow
      settings.tsx                  # Preferences, providers, app lock
  src/
    services/
      api.ts                        # Typed API client
      pushNotifications.ts          # Expo push registration
      appLockService.ts             # PIN + biometrics secure service
      download.ts                   # Local media download manager
    features/
      app-lock/                     # App lock policy + logic
      home/                         # Tile registry + providers
      live/                         # Live TV providers + guide
    store/
      authStore.ts
      settingsStore.ts
      appLockStore.ts

backend/
  server.py                         # FastAPI app + orchestration
  services/
    news_pipeline.py                # RSS ingest + normalize + dedupe + ranking
    signal_algorithms.py            # Interest vectors + scoring rules
    creator_monitor.py              # YouTube event polling
    notification_engine.py          # Eligibility + notification generation + push delivery
    home_data_providers.py          # Weather/market/verse providers
    state_store.py                  # JSON persistence layer
  tests/
    test_signal_algorithms.py
    test_notification_engine.py
```

## API Surface (Current)

### Auth + account

1. `POST /api/login`
2. `POST /api/logout`
3. `GET /api/session`
4. `POST /api/account/password`
5. `GET /api/settings`
6. `POST /api/settings`

### Downloads + media

1. `GET /api/downloads`
2. `POST /api/downloads`
3. `DELETE /api/downloads/{job_id}`
4. `POST /api/downloads/{job_id}/retry`
5. `PATCH /api/downloads/{job_id}/keep`
6. `GET /api/downloads/{job_id}/share`
7. `GET /media/{filename}`

### Home dashboard providers

1. `GET /api/home/weather`
2. `GET /api/home/market`
3. `GET /api/home/verse`
4. `POST /api/ai/search`

### Personalization + stories

1. `GET /api/live/stories`
2. `GET /api/live/stories/trending`
3. `POST /api/live/stories/refresh`
4. `POST /api/interactions/feed`
5. `GET /api/interests/me`
6. `POST /api/interests/feedback`

### Creators + notifications

1. `GET /api/creators/watches`
2. `POST /api/creators/watches`
3. `DELETE /api/creators/watches/{watch_id}`
4. `GET /api/creators/events`
5. `GET /api/notifications`
6. `GET /api/notifications/preferences`
7. `POST /api/notifications/preferences`
8. `POST /api/push/subscribe`
9. `DELETE /api/push/unsubscribe`
10. `POST /api/jobs/run-alert-cycle`

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `FINCHWIRE_ADMIN_PASSWORD` | Yes | Admin login password bootstrap |
| `SECRET_KEY` | Yes (prod) | JWT signing secret |
| `FINCHWIRE_STATE_FILE` | No | Override JSON state path |
| `FINCHWIRE_PUBLIC_BASE_URL` | No | Canonical URL for generated media links |
| `FINCHWIRE_NEWS_FEEDS` | No | Comma-separated RSS feed list override |
| `FINCHWIRE_ALERT_POLL_INTERVAL_SEC` | No | Background alert cycle interval |
| `YOUTUBE_API_KEY` | Optional/needed for creator alerts | YouTube Data API polling |
| `EXPO_PUSH_ACCESS_TOKEN` | Optional/recommended | Authenticated Expo push delivery |
| `FINCHWIRE_WEATHER_LOCATION` | No | Weather tile location label |
| `FINCHWIRE_WEATHER_LAT` | No | Weather tile latitude |
| `FINCHWIRE_WEATHER_LON` | No | Weather tile longitude |
| `FINCHWIRE_PROVIDER_TIMEOUT_SEC` | No | Timeout for home data providers |
| `GEMINI_API_KEY` | Optional | Fallback key for Gemini AI provider |
| `OPENAI_API_KEY` | Optional | Fallback key for OpenAI AI provider |
| `ANTHROPIC_API_KEY` | Optional | Fallback key for Anthropic AI provider |
| `XAI_API_KEY` / `GROK_API_KEY` | Optional | Fallback key for Grok (xAI) AI provider |
| `GROQ_API_KEY` | Optional | Fallback key for Groq AI provider |

## Getting Started

### 1) Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export FINCHWIRE_ADMIN_PASSWORD='change-me'
export SECRET_KEY='change-me-too'
uvicorn server:app --host 0.0.0.0 --port 8080
```

### 2) Frontend

```bash
cd frontend
npm install
npx expo start
```

### 3) First launch flow

1. Open app.
2. Set backend URL (defaults to `https://media.p3lending.space`).
3. Enter admin password.
4. Login and start using tabs.

### 4) Android production build (EAS)

```bash
cd frontend
npx eas-cli@latest whoami
npx eas-cli@latest build --platform android --profile preview
```

## App Lock Security (Implemented)

1. App Lock is disabled by default.
2. Supports PIN (4-6 digits, required for lock).
3. Optional biometrics can be enabled on top of PIN fallback.
4. Relock timing options:
   - Immediate
   - 1 minute
   - 5 minutes
5. Uses secure storage where available (`expo-secure-store`) and never stores plaintext PIN.

See: `/docs/APP_LOCK_SECURITY.md`

## Live TV (YouTube Embed)

1. Route: `/live`
2. Config file: `frontend/src/features/live/channels.ts`
3. Supports query selection: `/live?channel=<channelId>`
4. Persists last selected channel locally.
5. Uses legal embed-only playback (no stream scraping/rebroadcast).

See: `/docs/LIVE_TV_YOUTUBE.md`

## Personalized Alerts + Story Scoring

1. Deterministic interest vectors with recency decay.
2. Story scoring:
   - popularity
   - velocity
   - hotness
3. Reason-coded notifications.
4. Creator event monitoring (`live_started`, `video_published`, `livestream_scheduled`).
5. Push delivery via Expo notifications.

See: `/docs/AI_PERSONALIZED_ALERTING.md`

## Home Dashboard Smart Tiles

1. Weather tile
2. Market watch tile (stock/crypto symbol selector)
3. Verse of the day tile
4. Follow-aware feed actions and interaction tracking

See: `/docs/HOME_DASHBOARD_ARCHITECTURE.md`

## Testing

```bash
cd frontend
npm run lint
npm run test

cd ../backend
pytest
```

## Known Constraints

1. Some YouTube embeds can be blocked by regional/rights restrictions.
2. Creator monitoring quality depends on YouTube API quota/availability.
3. JSON state store is great for current iteration, but DB migration is recommended for scale.
4. Push notifications require device permissions and valid Expo push token registration.

## Documentation Index

1. `/docs/AI_PERSONALIZED_ALERTING.md`
2. `/docs/HOME_DASHBOARD_ARCHITECTURE.md`
3. `/docs/LIVE_TV_YOUTUBE.md`
4. `/docs/APP_LOCK_SECURITY.md`
