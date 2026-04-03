# FinchWire Live TV (YouTube Embed)

## What this feature is
FinchWire now includes a `/live` route that provides a Pluto-style channel guide, powered by official YouTube embeds only.

## Where channel config lives
- File: `frontend/src/features/live/channels.ts`
- Export: `LIVE_CHANNELS`

Each channel entry controls what appears in the guide:

```ts
type LiveChannel = {
  id: string;
  name: string;
  provider: "youtube" | "twitch";
  embedType: "video" | "playlist" | "live";
  videoId?: string;
  playlistId?: string;
  thumbnail?: string;
  description?: string;
  category?: string;
  language?: string;
  tags?: string[];
  featured?: boolean;
}
```

## How to add/edit/remove channels
1. Open `frontend/src/features/live/channels.ts`.
2. Add or edit entries in `LIVE_CHANNELS`.
3. For `embedType: "video"` or `"live"`, set `videoId`.
4. For `embedType: "playlist"`, set `playlistId`.
5. Save and rebuild the app.

## Route behavior
- Route: `/live`
- Query support: `/live?channel=<channelId>`
- Last selected channel is persisted in local storage key:
  - `@finchwire_live_last_channel`

Selection priority on page load:
1. query `channel` if valid
2. persisted channel from storage
3. featured channel
4. first channel in config

## Current limitations (by design)
- YouTube embed availability depends on YouTube policies and each video's embed setting.
- Some videos/livestreams can be blocked by region, rights, or owner restrictions.
- This is embed-only playback. FinchWire does not proxy, rebroadcast, or bypass provider protections.

## Why Pluto/Tubi/Roku are not directly integrated
Pluto TV, Tubi, Roku Channel, and similar FAST services usually require protected app flows, DRM, and platform-specific licensing terms. FinchWire intentionally avoids scraping or hidden stream extraction and stays on legal embeddable sources.
