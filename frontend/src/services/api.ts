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

  private getHeaders(skipToken: boolean = false): HeadersInit {
    return {
      'Content-Type': 'application/json',
      ...((this.authToken && !skipToken) ? { 'x-finchwire-token': this.authToken } : {}),
    };
  }

  private async request<T>(endpoint: string, options?: RequestInit, skipToken: boolean = false): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log('API Request:', url, options?.method || 'GET');
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(skipToken),
          ...options?.headers,
        },
      });

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
      console.error('API Request failed:', error);
      if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please check your internet connection and backend URL.');
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
