// API Service for FinchWire
import { API_ENDPOINTS } from '../utils/constants';
import { MediaJob, DownloadJobRequest, AuthResponse, SessionResponse } from '../types';

class ApiService {
  private baseUrl: string = '';
  private authToken: string = '';

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...(this.authToken ? { 'x-finchwire-token': this.authToken } : {}),
    };
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth endpoints
  async login(password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
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
