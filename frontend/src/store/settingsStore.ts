// Settings Store using Zustand
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, DEFAULT_BACKEND_URL, DEFAULT_RETENTION_DAYS } from '../utils/constants';
import { AppSettings } from '../types';

interface SettingsState {
  settings: AppSettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  updateBackendUrl: (url: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false,

  loadSettings: async () => {
    try {
      set({ isLoading: true });
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        set({ settings: JSON.parse(stored), isLoading: false });
      } else {
        // Default settings
        const defaultSettings: AppSettings = {
          backend_url: DEFAULT_BACKEND_URL,
          password: '',
          retention_days: DEFAULT_RETENTION_DAYS,
          wifi_only: false,
          auto_delete: false,
        };
        set({ settings: defaultSettings, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      set({ settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  },

  updateBackendUrl: async (url: string) => {
    const current = get().settings;
    if (current) {
      await get().saveSettings({ ...current, backend_url: url });
    }
  },

  updatePassword: async (password: string) => {
    const current = get().settings;
    if (current) {
      await get().saveSettings({ ...current, password });
    }
  },
}));
