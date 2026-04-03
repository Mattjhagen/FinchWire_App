# FinchWire Home Dashboard Architecture

## 1. Overview
FinchWire Home now acts as a personalized signal dashboard with four layers:

1. Core actions (`AI Mode`, `Queue`, `Add URL`)
2. Smart tiles (Weather, Market Watch, Verse of the Day)
3. Queue/library status cards
4. Personalized `For You` feed with follow + engagement controls

The design goal is to keep FinchWire media-first while adding compact, glanceable intelligence.

## 2. Tile System
Home tiles use a lightweight registry:

- File: `frontend/src/features/home/tileRegistry.ts`
- Types: `HomeTileType`, `HomeTilePreferences`
- Supported tiles:
  - `weather`
  - `market`
  - `verse`

Tiles are rendered independently so one failing tile does not block Home rendering.

## 3. Provider Abstractions
Frontend provider interfaces live in:

- `frontend/src/features/home/providers.ts`

Interfaces:

- `WeatherProvider`
- `MarketDataProvider`
- `VerseProvider`

Current implementation calls backend APIs via `apiService`.

## 4. Backend Home Data Endpoints
Backend routes (auth required):

- `GET /api/home/weather?unit=f|c`
- `GET /api/home/market?symbol=BTC&assetType=crypto|stock`
- `GET /api/home/verse`

Provider implementation:

- `backend/services/home_data_providers.py`

Current providers:

- Weather: Open-Meteo
- Crypto: CoinGecko simple price
- Stock: Yahoo Finance quote endpoint
- Verse: OurManna Verse of the Day

All providers include timeout protection and in-process TTL caching.

## 5. Personalization and Follow Signals
Feed interactions are sent to:

- `POST /api/interactions/feed`

Payload includes item metadata and event types such as:

- `impression`
- `open`
- `click`
- `dwell`
- `follow_topic`
- `follow_source`
- `follow_creator`
- `save`
- `hide`

Backend maps these to deterministic interaction weights and updates the interest vector with recency decay.

## 6. Dwell Time Tracking
Article dwell tracking is implemented in:

- `frontend/app/article.tsx`

Behavior:

1. Sends an `open` event on article load.
2. Measures active reading time (foreground only).
3. Sends one debounced `dwell` event on screen exit.

This avoids inflating engagement from background time and avoids event spam.

## 7. Settings and Persistence
Home preferences are persisted in app settings store:

- `frontend/src/store/settingsStore.ts`
- `frontend/src/types/index.ts`
- `frontend/app/(tabs)/settings.tsx`

Persisted fields:

- tracked market symbol + asset type
- weather unit
- tile enable/disable flags
- followed topics/sources/creators

## 8. Required / Optional Env Vars
Optional backend env vars:

- `FINCHWIRE_WEATHER_LOCATION` (default `Omaha, NE`)
- `FINCHWIRE_WEATHER_LAT` (default `41.2565`)
- `FINCHWIRE_WEATHER_LON` (default `-95.9345`)
- `FINCHWIRE_PROVIDER_TIMEOUT_SEC` (default `7`)

## 9. How to Add a New Home Tile
1. Add the tile type in `HomeTileType`.
2. Add label and default placement in `tileRegistry.ts`.
3. Add provider interface method (if external data needed).
4. Add backend endpoint/provider (if server-backed).
5. Render tile in `frontend/app/(tabs)/index.tsx`.
6. Add settings toggle in `frontend/app/(tabs)/settings.tsx`.

## 10. Current Limitations
- Stock quote source uses Yahoo endpoint (best-effort public API).
- Followed creators currently rely on explicit follow actions (not full NER extraction yet).
- Tile ordering is stored but not yet user-draggable.
