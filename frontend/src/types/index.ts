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
  ai_provider: AiProvider;
  tts_provider: TtsProvider;
  has_ai_api_key: boolean;
  has_tts_api_key: boolean;
}

export type AiProvider = 'none' | 'gemini' | 'openai' | 'anthropic' | 'groq';
export type TtsProvider = 'none' | 'gemini' | 'openai' | 'elevenlabs';

export interface ServerRuntimeSettings {
  ai_provider: AiProvider;
  tts_provider: TtsProvider;
  has_ai_api_key: boolean;
  has_tts_api_key: boolean;
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
