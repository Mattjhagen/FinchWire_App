// API Service for FinchWire
import { API_ENDPOINTS } from '../utils/constants';
import {
  AssetType,
  AiSearchResponse,
  AiProvider,
  CreatorEvent,
  CreatorWatch,
  CreatorWatchPayload,
  FeedInteractionEvent,
  FinchNotification,
  InterestProfileResponse,
  LiveStory,
  MediaJob,
  NotificationPreferences,
  NotificationPreferencesPayload,
  PriceWatchItem,
  DownloadJobRequest,
  AuthResponse,
  SessionResponse,
  ServerRuntimeSettings,
  StoryFeedbackPayload,
  TemperatureUnit,
  TtsProvider,
  VerseOfDay,
  WeatherSnapshot,
  WeatherProvider,
  MarketProvider,
} from '../types';
import { Platform } from 'react-native';

interface UpdateServerSettingsPayload {
  ai_provider?: AiProvider;
  tts_provider?: TtsProvider;
  ai_api_key?: string;
  tts_api_key?: string;
  weather_provider?: WeatherProvider;
  market_provider?: MarketProvider;
  weather_api_key?: string;
  market_api_key?: string;
  youtube_api_key?: string;
  weather_location?: string;
  weather_lat?: string;
  weather_lon?: string;
}

interface ServerSettingsResponse {
  success: boolean;
  settings: ServerRuntimeSettings;
}

type AiSearchApiResponse = AiSearchResponse;

interface ShareUrlResponse {
  success: boolean;
  media_url: string;
  share_url: string;
}

interface StoriesResponse {
  success: boolean;
  stories: LiveStory[];
}

interface HomeWeatherResponse {
  success: boolean;
  snapshot: WeatherSnapshot;
}

interface HomeMarketResponse {
  success: boolean;
  quote: PriceWatchItem;
}

interface HomeVerseResponse {
  success: boolean;
  verse: VerseOfDay;
}

interface NotificationsResponse {
  success: boolean;
  notifications: FinchNotification[];
}

interface NotificationPreferencesResponse {
  success: boolean;
  preferences: NotificationPreferences;
}

interface CreatorWatchesResponse {
  success: boolean;
  watches: CreatorWatch[];
}

interface CreatorEventsResponse {
  success: boolean;
  events: CreatorEvent[];
}

class ApiService {
  private baseUrl: string = '';
  private authToken: string = '';
  private authMode: 'token' | 'session' | null = null;

  private isPrivateOrLocalHost(host: string): boolean {
    if (!host) return false;
    const value = host.trim().toLowerCase();

    if (value === 'localhost' || value === '127.0.0.1' || value === '::1') {
      return true;
    }

    // RFC1918/private ranges
    if (/^10\./.test(value)) return true;
    if (/^192\.168\./.test(value)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
    if (/^169\.254\./.test(value)) return true;

    return false;
  }

  private normalizeMediaPath(filename: string): string {
    if (!filename) return '';
    let path = filename
      .replace(/\\/g, '/')
      .replace(/^vlc:\/\/https?:\/\//i, '')
      .replace(/^vlc-x-callback:\/\/x-callback-url\/stream\?url=https?:\/\//i, '')
      .replace(/^https?:\/\/[^/]+\/media\//i, '')
      .replace(/^\/+/, '')
      .replace(/^media\//i, '')
      .trim();

    // Preserve '?' and '=' in YouTube filenames ('watch?v=')
    const isYoutubePath = path.includes('watch?v=') || path.includes('watch%3Fv%3D');
    if (isYoutubePath) {
      // For YouTube paths, only strip query params that follow the extension (e.g., .mp4?token=...)
      return path.replace(/(\.(mp4|mkv|mp3|m4a|webm|vtt|srt|jpg|png))\?.*$/i, '$1');
    }
    
    // For other paths, strip standard query parameters
    return path.split('?')[0];
  }

  private withTokenQuery(url: string, token: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  setBaseUrl(url: string) {
    let formattedUrl = url.trim().replace(/\/$/, '');
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      const host = formattedUrl.split('/')[0];
      const protocol = this.isPrivateOrLocalHost(host) ? 'http' : 'https';
      formattedUrl = `${protocol}://${formattedUrl}`;
    }
    this.baseUrl = formattedUrl;
  }

  setAuthToken(token: string) {
    if (!token) {
      this.authToken = '';
      this.authMode = null;
      return;
    }

    if (token.startsWith('session:')) {
      this.authToken = token.slice('session:'.length);
      this.authMode = 'session';
      return;
    }

    this.authToken = token;
    this.authMode = 'token';
  }

  async testConnection(): Promise<{ reachable: boolean; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return { reachable: response.ok || response.status < 500 };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return { reachable: false, error: 'Timed out — server not responding' };
      }
      return { reachable: false, error: error.message || 'Network request failed' };
    }
  }

  private getHeaders(skipToken: boolean = false): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!skipToken && this.authToken && this.authMode === 'token') {
      headers.Authorization = `Bearer ${this.authToken}`;
      headers['x-finchwire-token'] = this.authToken;
    }

    // Session-auth backend compatibility (YT-Download Express server).
    if (!skipToken && this.authToken && this.authMode === 'session' && Platform.OS !== 'web') {
      headers.Cookie = `session=${encodeURIComponent(this.authToken)}`;
    }

    return headers;
  }

  getMediaRequestHeaders(): Record<string, string> | undefined {
    if (!this.authToken || !this.authMode) {
      return undefined;
    }

    if (this.authMode === 'token') {
      return { 'x-finchwire-token': this.authToken };
    }

    if (Platform.OS !== 'web') {
      return { Cookie: `session=${encodeURIComponent(this.authToken)}` };
    }

    return undefined;
  }

  private async request<T>(endpoint: string, options?: RequestInit, skipToken: boolean = false): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    console.log('API Request:', url, options?.method || 'GET');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          ...this.getHeaders(skipToken),
          ...options?.headers,
        },
      });
      clearTimeout(timeoutId);

      console.log('API Response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        console.error('API Error:', error);
        throw new Error(error.error || error.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response data:', data);
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('API Request failed:', error);
      if (error.name === 'AbortError') {
        throw new Error('Connection timed out. Server is not responding at ' + this.baseUrl);
      }
      if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Check that the URL is correct and the server is running.');
      }
      throw error;
    }
  }

  // Auth endpoints
  async login(password: string, username: string = 'admin'): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, true);
    
    // Token mode (FastAPI backend)
    if (response.success && response.token) {
      this.setAuthToken(response.token);
      return response;
    }

    // Session-cookie mode (YT-Download Express backend)
    if (response.success && !response.token) {
      const sessionToken = `session:${password}`;
      this.setAuthToken(sessionToken);

      // Some backends may return { success: true } even with a bad password.
      // Verify the established session before marking login as successful.
      try {
        const session = await this.request<SessionResponse>(API_ENDPOINTS.SESSION);
        if (session.authenticated) {
          return { ...response, token: sessionToken };
        }
      } catch {
        // Fall through to standardized login error below.
      }

      this.setAuthToken('');
      return { success: false, error: 'Invalid password' };
    }
    
    return response;
  }

  async logout(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(API_ENDPOINTS.LOGOUT, {
      method: 'POST',
    });
  }

  async checkSession(): Promise<SessionResponse> {
    return this.request<SessionResponse>(API_ENDPOINTS.SESSION);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(API_ENDPOINTS.CHANGE_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  }

  async getServerSettings(): Promise<ServerRuntimeSettings> {
    const response = await this.request<ServerSettingsResponse>(API_ENDPOINTS.SETTINGS);
    return response.settings;
  }

  async updateServerSettings(payload: UpdateServerSettingsPayload): Promise<ServerRuntimeSettings> {
    const response = await this.request<ServerSettingsResponse>(API_ENDPOINTS.SETTINGS, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return response.settings;
  }

  async runAiSearch(prompt: string): Promise<AiSearchResponse> {
    const response = await this.request<AiSearchApiResponse>(API_ENDPOINTS.AI_SEARCH, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
    return response;
  }

  async runAiSpeechSearch(audioBase64: string, mimeType: string, prompt?: string): Promise<AiSearchResponse> {
    const response = await this.request<AiSearchApiResponse>(API_ENDPOINTS.AI_SPEECH, {
      method: 'POST',
      body: JSON.stringify({
        audio_base64: audioBase64,
        mime_type: mimeType,
        prompt: prompt || 'Transcribe and provide a useful answer concisely.'
      }),
    });
    return response;
  }

  async runAiTts(text: string, voiceId?: string): Promise<{ audio_base64: string; format: string }> {
    return this.request<{ audio_base64: string; format: string }>(API_ENDPOINTS.AI_SPEECH.replace('/speech', '/tts'), {
      method: 'POST',
      body: JSON.stringify({ text, voice_id: voiceId }),
    });
  }

  async getHomeWeather(unit: TemperatureUnit = 'f'): Promise<WeatherSnapshot> {
    const response = await this.request<HomeWeatherResponse>(`${API_ENDPOINTS.HOME_WEATHER}?unit=${unit}`);
    return response.snapshot;
  }

  async getHomeMarket(symbol: string, assetType: AssetType): Promise<PriceWatchItem> {
    const params = `symbol=${encodeURIComponent(symbol)}&assetType=${encodeURIComponent(assetType)}`;
    const response = await this.request<HomeMarketResponse>(`${API_ENDPOINTS.HOME_MARKET}?${params}`);
    return response.quote;
  }

  async getVerseOfDay(): Promise<VerseOfDay> {
    const response = await this.request<HomeVerseResponse>(API_ENDPOINTS.HOME_VERSE);
    return response.verse;
  }

  async sendFeedInteraction(payload: FeedInteractionEvent): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(API_ENDPOINTS.FEED_INTERACTIONS, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Media endpoints
  async getMediaList(): Promise<MediaJob[]> {
    return this.request<MediaJob[]>(API_ENDPOINTS.DOWNLOADS);
  }

  async submitDownload(data: DownloadJobRequest): Promise<MediaJob> {
    return this.request<MediaJob>(API_ENDPOINTS.DOWNLOADS, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async retryDownload(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`${API_ENDPOINTS.DOWNLOADS}/${id}/retry`, {
      method: 'POST',
    });
  }

  async deleteJob(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`${API_ENDPOINTS.DOWNLOADS}/${id}`, {
      method: 'DELETE',
    });
  }

  async setKeepDownload(id: string, keepForever: boolean): Promise<{ success: boolean; job?: MediaJob }> {
    return this.request<{ success: boolean; job?: MediaJob }>(`${API_ENDPOINTS.DOWNLOADS}/${id}/keep`, {
      method: 'PATCH',
      body: JSON.stringify({ keep_forever: keepForever }),
    });
  }

  async getShareMediaUrl(jobId: string, fallbackPath?: string): Promise<string> {
    try {
      const response = await this.request<ShareUrlResponse>(`${API_ENDPOINTS.DOWNLOADS}/${jobId}/share`);
      if (response?.share_url) {
        return response.share_url;
      }
    } catch {
      // Fall through to tokenized local URL fallback.
    }

    if (!fallbackPath) {
      return this.baseUrl;
    }
    return this.getExternalMediaUrl(fallbackPath);
  }

  async getLiveStories(limit: number = 50): Promise<LiveStory[]> {
    const response = await this.request<StoriesResponse>(`${API_ENDPOINTS.LIVE_STORIES}?limit=${limit}`);
    return response.stories || [];
  }

  async getTrendingStories(limit: number = 30): Promise<LiveStory[]> {
    const response = await this.request<StoriesResponse>(`${API_ENDPOINTS.LIVE_STORIES_TRENDING}?limit=${limit}`);
    return response.stories || [];
  }

  async refreshStorySignals(): Promise<{ success: boolean; stats?: Record<string, unknown> }> {
    return this.request<{ success: boolean; stats?: Record<string, unknown> }>(API_ENDPOINTS.LIVE_STORIES_REFRESH, {
      method: 'POST',
    });
  }

  async getMyInterests(): Promise<InterestProfileResponse> {
    return this.request<InterestProfileResponse>(API_ENDPOINTS.INTERESTS_ME);
  }

  async sendInterestFeedback(payload: StoryFeedbackPayload): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(API_ENDPOINTS.INTERESTS_FEEDBACK, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCreatorWatches(): Promise<CreatorWatch[]> {
    const response = await this.request<CreatorWatchesResponse>(API_ENDPOINTS.CREATOR_WATCHES);
    return response.watches || [];
  }

  async upsertCreatorWatch(payload: CreatorWatchPayload): Promise<CreatorWatch> {
    const response = await this.request<{ success: boolean; watch: CreatorWatch }>(API_ENDPOINTS.CREATOR_WATCHES, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.watch;
  }

  async deleteCreatorWatch(watchId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`${API_ENDPOINTS.CREATOR_WATCHES}/${watchId}`, {
      method: 'DELETE',
    });
  }

  async getCreatorEvents(limit: number = 100): Promise<CreatorEvent[]> {
    const response = await this.request<CreatorEventsResponse>(`${API_ENDPOINTS.CREATOR_EVENTS}?limit=${limit}`);
    return response.events || [];
  }

  async subscribePushToken(
    expoPushToken: string,
    platform: string = Platform.OS,
    deviceId?: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(API_ENDPOINTS.PUSH_SUBSCRIBE, {
      method: 'POST',
      body: JSON.stringify({
        expo_push_token: expoPushToken,
        platform,
        device_id: deviceId,
        enabled: true,
      }),
    });
  }

  async unsubscribePushToken(expoPushToken: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `${API_ENDPOINTS.PUSH_UNSUBSCRIBE}?token=${encodeURIComponent(expoPushToken)}`,
      {
        method: 'DELETE',
      }
    );
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const response = await this.request<NotificationPreferencesResponse>(API_ENDPOINTS.NOTIFICATION_PREFERENCES);
    return response.preferences;
  }

  async updateNotificationPreferences(payload: NotificationPreferencesPayload): Promise<NotificationPreferences> {
    const response = await this.request<NotificationPreferencesResponse>(API_ENDPOINTS.NOTIFICATION_PREFERENCES, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.preferences;
  }

  async getNotifications(limit: number = 100): Promise<FinchNotification[]> {
    const response = await this.request<NotificationsResponse>(`${API_ENDPOINTS.NOTIFICATIONS}?limit=${limit}`);
    return response.notifications || [];
  }

  async markNotificationOpened(notificationId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`${API_ENDPOINTS.NOTIFICATIONS}/${notificationId}/open`, {
      method: 'PATCH',
    });
  }

  async runAlertCycle(): Promise<{ success: boolean; stats?: Record<string, unknown> }> {
    return this.request<{ success: boolean; stats?: Record<string, unknown> }>(API_ENDPOINTS.ALERT_CYCLE, {
      method: 'POST',
    });
  }

  // Build media URLs
  getMediaUrl(filename: string, download: boolean = false): string {
    const normalizedPath = this.normalizeMediaPath(filename);
    if (!normalizedPath) return `${this.baseUrl}/media`;
    // Only encode segments, not the whole path to preserve slashes
    const encodedPath = normalizedPath.split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/');
    return `${this.baseUrl}/media/${encodedPath}${download ? '?download=true' : ''}`;
  }

  getVlcUrl(filename: string): string {
    const mediaUrl = this.getExternalMediaUrl(filename);
    if (Platform.OS === 'ios') {
      // iOS VLC deep link format
      return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(mediaUrl)}`;
    }
    return `vlc://${mediaUrl}`;
  }

  // Build media URL for external players (e.g., VLC).
  // External players cannot send cookie auth, so we include token query when available.
  getExternalMediaUrl(filename: string): string {
    const url = this.getMediaUrl(filename);
    if (this.authToken) {
      return this.withTokenQuery(url, this.authToken);
    }
    return url;
  }

  // Build authenticated media URL with token
  getAuthenticatedMediaUrl(filename: string): string {
    const url = this.getMediaUrl(filename);
    // Session-based backends often fail to forward Cookie headers to media players on mobile.
    // Query token keeps playback/download robust across in-app and external players.
    if (this.authToken) {
      return this.withTokenQuery(url, this.authToken);
    }
    return url;
  }
}

export const apiService = new ApiService();
