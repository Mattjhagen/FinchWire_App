// API Service for FinchWire
import { API_ENDPOINTS } from '../utils/constants';
import { MediaJob, DownloadJobRequest, AuthResponse, SessionResponse } from '../types';
import { Platform } from 'react-native';

class ApiService {
  private baseUrl: string = '';
  private authToken: string = '';
  private authMode: 'token' | 'session' | null = null;

  setBaseUrl(url: string) {
    let formattedUrl = url.trim().replace(/\/$/, '');
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
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
      const response = await fetch(`${this.baseUrl}/health`, {
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
        throw new Error(error.error || `HTTP ${response.status}`);
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
      if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
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

  // Build media URLs
  getMediaUrl(filename: string, download: boolean = false): string {
    // Only encode segments, not the whole path to preserve slashes
    const encodedPath = filename.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${this.baseUrl}/media/${encodedPath}${download ? '?download=true' : ''}`;
  }

  getVlcUrl(filename: string): string {
    const mediaUrl = this.getMediaUrl(filename);
    return `vlc://${mediaUrl}`;
  }

  // Build authenticated media URL with token
  getAuthenticatedMediaUrl(filename: string): string {
    const url = this.getMediaUrl(filename);
    if (this.authToken && this.authMode === 'token') {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(this.authToken)}`;
    }
    return url;
  }
}

export const apiService = new ApiService();
