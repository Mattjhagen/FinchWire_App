// FinchWire Constants

export const DEFAULT_BACKEND_URL = 'https://finchwire-app.onrender.com';
export const DEFAULT_RETENTION_DAYS = 30;

export const STORAGE_KEYS = {
  SETTINGS: '@finchwire_settings',
  AUTH_TOKEN: '@finchwire_auth_token',
  SETUP_COMPLETE: '@finchwire_setup_complete',
};

export const API_ENDPOINTS = {
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',
  SESSION: '/api/session',
  CHANGE_PASSWORD: '/api/account/password',
  SETTINGS: '/api/settings',
  DOWNLOADS: '/api/downloads',
  DOWNLOAD_KEEP: '/api/downloads',
  FILES: '/api/files',
  EVENTS: '/api/events',
  LIVE_STORIES: '/api/live/stories',
  LIVE_STORIES_TRENDING: '/api/live/stories/trending',
  LIVE_STORIES_REFRESH: '/api/live/stories/refresh',
  HOME_WEATHER: '/api/home/weather',
  HOME_MARKET: '/api/home/market',
  HOME_VERSE: '/api/home/verse',
  HOME_DEVOTIONAL: '/api/home/devotional',
  AI_SEARCH: '/api/ai/search',
  AI_SPEECH: '/api/ai/speech',
  FEED_INTERACTIONS: '/api/interactions/feed',
  INTERESTS_ME: '/api/interests/me',
  INTERESTS_FEEDBACK: '/api/interests/feedback',
  CREATOR_WATCHES: '/api/creators/watches',
  CREATOR_EVENTS: '/api/creators/events',
  PUSH_SUBSCRIBE: '/api/push/subscribe',
  PUSH_UNSUBSCRIBE: '/api/push/unsubscribe',
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATION_PREFERENCES: '/api/notifications/preferences',
  ALERT_CYCLE: '/api/jobs/run-alert-cycle',
};

export const MEDIA_TYPES = {
  VIDEO: 'video',
  AUDIO: 'audio',
} as const;

export const JOB_STATUS = {
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  EMBEDDED: 'embedded',
} as const;
