// FinchWire Types

export interface MediaJob {
  id: string;
  url: string;
  original_url: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'expired' | 'cancelled';
  progress_percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  filename: string;
  safe_filename: string;
  relative_path: string;
  absolute_path: string;
  mime_type?: string;
  file_size: number;
  source_domain: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error_message?: string;
  width?: number;
  height?: number;
  is_audio: boolean;
  keep_forever?: number | boolean;
  last_viewed_at?: string;
  view_count: number;
  deleted_at?: string;
  media_url?: string;
  vlc_url?: string;
}

export interface DownloadJobRequest {
  url: string;
  filename?: string;
  subfolder?: string;
  is_audio?: boolean;
}

export interface LocalMedia {
  id: string;
  media_id: string;
  title: string;
  local_path: string;
  remote_url: string;
  kind: 'video' | 'audio';
  mime_type?: string;
  file_size: number;
  downloaded_at: string;
  last_played_at?: string;
  play_count: number;
}

export interface AppSettings {
  backend_url: string;
  password: string;
  retention_days: number;
  wifi_only: boolean;
  auto_delete: boolean;
  app_lock_enabled: boolean;
  app_lock_biometrics: boolean;
  app_lock_timeout: AppLockTimeout;
  ai_provider: AiProvider;
  tts_provider: TtsProvider;
  has_ai_api_key: boolean;
  has_tts_api_key: boolean;
  home_market_symbol: string;
  home_market_asset_type: AssetType;
  home_weather_unit: TemperatureUnit;
  home_tiles: HomeTilePreferences;
  followed_topics: string[];
  followed_sources: string[];
  followed_creators: string[];
}

export type AssetType = 'stock' | 'crypto';
export type TemperatureUnit = 'f' | 'c';
export type HomeTileType = 'weather' | 'market' | 'verse';
export type AppLockTimeout = 'immediate' | '1m' | '5m';

export interface HomeTilePreferences {
  weather: boolean;
  market: boolean;
  verse: boolean;
  order: HomeTileType[];
}

export type AiProvider = 'none' | 'gemini' | 'openai' | 'anthropic' | 'groq';
export type TtsProvider = 'none' | 'gemini' | 'openai' | 'elevenlabs';

export interface ServerRuntimeSettings {
  ai_provider: AiProvider;
  tts_provider: TtsProvider;
  has_ai_api_key: boolean;
  has_tts_api_key: boolean;
}

export interface WeatherSnapshot {
  locationLabel: string;
  temperatureC?: number;
  temperatureF?: number;
  condition?: string;
  highC?: number;
  lowC?: number;
  highF?: number;
  lowF?: number;
  observedAt?: string;
}

export interface PriceWatchItem {
  symbol: string;
  assetType: AssetType;
  displayName?: string;
  price: number;
  currency: string;
  change24h?: number;
  changePercent24h?: number;
  updatedAt?: string;
}

export interface VerseOfDay {
  reference: string;
  text: string;
  translation?: string;
  fetchedAt?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface LoginRequest {
  username?: string;
  password: string;
}

export interface SessionResponse {
  authenticated: boolean;
  username?: string;
}

export interface InterestVector {
  topics: Record<string, number>;
  sources: Record<string, number>;
  creators: Record<string, number>;
  categories: Record<string, number>;
  keywords: Record<string, number>;
  updatedAt: string;
}

export interface InterestProfileResponse {
  success: boolean;
  interestVector: InterestVector;
  topTopics: { topic: string; score: number }[];
}

export interface StoryFeedbackPayload {
  interaction_type:
    | 'story_impression'
    | 'story_opened'
    | 'story_clicked'
    | 'story_dwell'
    | 'story_bookmarked'
    | 'story_liked'
    | 'topic_followed'
    | 'source_followed'
    | 'creator_followed'
    | 'video_played'
    | 'video_downloaded'
    | 'notification_opened'
    | 'story_dismissed'
    | 'topic_muted'
    | 'creator_muted'
    | 'notification_ignored';
  story_id?: string;
  title?: string;
  source?: string;
  topics?: string[];
  categories?: string[];
  creators?: string[];
  keywords?: string[];
}

export interface FeedInteractionEvent {
  item_id: string;
  item_type: 'article' | 'video' | 'story';
  event_type:
    | 'impression'
    | 'open'
    | 'click'
    | 'dwell'
    | 'follow_topic'
    | 'follow_source'
    | 'follow_creator'
    | 'hide'
    | 'save';
  title?: string;
  source?: string;
  topics?: string[];
  categories?: string[];
  creators?: string[];
  keywords?: string[];
  value?: number;
  occurred_at?: string;
}

export interface LiveStory {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  imageUrl?: string | null;
  topics?: string[];
  keywords?: string[];
  sources?: string[];
  popularityScore?: number;
  velocityScore?: number;
  hotnessScore?: number;
  freshnessScore?: number;
  userInterestMatch?: number;
  reasonCodes?: string[];
  isFresh?: boolean;
}

export interface CreatorWatch {
  id: string;
  provider: 'youtube';
  channelId: string;
  displayName: string;
  enabled: boolean;
  notifyOnLive: boolean;
  notifyOnUpload: boolean;
  notifyOnMajorUploadOnly: boolean;
  highPriority?: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatorWatchPayload {
  provider?: 'youtube';
  channelId: string;
  displayName: string;
  enabled?: boolean;
  notifyOnLive?: boolean;
  notifyOnUpload?: boolean;
  notifyOnMajorUploadOnly?: boolean;
  highPriority?: boolean;
  tags?: string[];
}

export interface CreatorEvent {
  id: string;
  provider: 'youtube';
  channelId: string;
  eventType: 'live_started' | 'video_published' | 'livestream_scheduled';
  title: string;
  url: string;
  thumbnailUrl?: string | null;
  publishedAt: string;
  detectedAt: string;
  dedupeKey: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  breakingStory: boolean;
  risingStory: boolean;
  creatorLive: boolean;
  creatorUpload: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  minSeverity?: number;
  dailyCap?: number;
  personalizedOnly?: boolean;
}

export interface NotificationPreferencesPayload {
  enabled?: boolean;
  breakingStory?: boolean;
  risingStory?: boolean;
  creatorLive?: boolean;
  creatorUpload?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  minSeverity?: number;
  dailyCap?: number;
  personalizedOnly?: boolean;
}

export interface FinchNotification {
  id: string;
  userId: string;
  type:
    | 'breaking_story'
    | 'rising_story'
    | 'favorite_creator_live'
    | 'favorite_creator_upload'
    | 'topic_alert';
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
  createdAt: string;
  sentAt?: string | null;
  openedAt?: string | null;
  deliveryStatus: 'queued' | 'sent' | 'failed' | 'skipped';
  dedupeKey: string;
  reasonCode?: string;
  reasonMetadata?: Record<string, unknown>;
  severity?: number;
}
