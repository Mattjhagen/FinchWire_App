// Auth Store using Zustand
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../utils/constants';

interface AuthState {
  isAuthenticated: boolean;
  authToken: string | null;
  setupComplete: boolean | null;
  isLoading: boolean;
  setAuthToken: (token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<void>;
  markSetupComplete: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  authToken: null,
  setupComplete: null,
  isLoading: true,

  loadAuth: async () => {
    try {
      const [token, setupDone] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.SETUP_COMPLETE),
      ]);

      set({ 
        authToken: token, 
        isAuthenticated: !!token,
        setupComplete: setupDone === 'true',
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to load auth:', error);
      set({ isLoading: false });
    }
  },

  setAuthToken: async (token: string) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      set({ authToken: token, isAuthenticated: true });
    } catch (error) {
      console.error('Failed to save auth token:', error);
      throw error;
    }
  },

  clearAuth: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      set({ authToken: null, isAuthenticated: false });
    } catch (error) {
      console.error('Failed to clear auth:', error);
    }
  },

  markSetupComplete: async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETUP_COMPLETE, 'true');
      set({ setupComplete: true });
    } catch (error) {
      console.error('Failed to mark setup complete:', error);
    }
  },
}));
