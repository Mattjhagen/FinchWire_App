// FinchWire Constants

export const DEFAULT_BACKEND_URL = 'https://media.p3lending.space';
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
  DOWNLOADS: '/api/downloads',
  DOWNLOAD_KEEP: '/api/downloads',
  FILES: '/api/files',
  EVENTS: '/api/events',
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
} as const;
