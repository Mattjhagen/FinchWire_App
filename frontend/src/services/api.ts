// API Service for FinchWire
import { API_ENDPOINTS } from '../utils/constants';
import { MediaJob, DownloadJobRequest, AuthResponse, SessionResponse } from '../types';

class ApiService {
  private baseUrl: string = '';
  private authToken: string = '';

  setBaseUrl(url: string) {
    let formattedUrl = url.trim().replace(/\/$/, '');
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    this.baseUrl = formattedUrl;
  }

  setAuthToken(token: string) {
    this.authToken = token;
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
    return {
      'Content-Type': 'application/json',
      ...((this.authToken && !skipToken) ? { 'x-finchwire-token': this.authToken } : {}),
    };
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
  async login(password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, true);
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
    const data = await this.request<unknown>(API_ENDPOINTS.DOWNLOADS);
    // Server may return a plain array OR a wrapped object like { jobs: [] }
    if (Array.isArray(data)) return data as MediaJob[];
    if (data && typeof data === 'object') {
      for (const key of ['jobs', 'downloads', 'data', 'items', 'results']) {
        const val = (data as Record<string, unknown>)[key];
        if (Array.isArray(val)) return val as MediaJob[];
      }
    }
    console.warn('getMediaList: unexpected response shape', data);
    return [];
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
    const encodedFilename = encodeURIComponent(filename);
    return `${this.baseUrl}/media/${encodedFilename}${download ? '?download=true' : ''}`;
  }

  getVlcUrl(filename: string): string {
    const mediaUrl = this.getMediaUrl(filename);
    return `vlc://${mediaUrl}`;
  }

  // Build authenticated media URL with token
  getAuthenticatedMediaUrl(filename: string): string {
    return this.getMediaUrl(filename);
  }
}

export const apiService = new ApiService();
