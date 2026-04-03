// Settings Store using Zustand
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, DEFAULT_BACKEND_URL, DEFAULT_RETENTION_DAYS } from '../utils/constants';
import { AiProvider, AppSettings, TtsProvider } from '../types';

interface SettingsState {
  settings: AppSettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  updateBackendUrl: (url: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const ALLOWED_AI_PROVIDERS: AiProvider[] = ['none', 'gemini', 'openai', 'anthropic', 'groq'];
const ALLOWED_TTS_PROVIDERS: TtsProvider[] = ['none', 'gemini', 'openai', 'elevenlabs'];

const DEFAULT_SETTINGS: AppSettings = {
  backend_url: DEFAULT_BACKEND_URL,
  password: '',
  retention_days: DEFAULT_RETENTION_DAYS,
  wifi_only: false,
  auto_delete: false,
  ai_provider: 'none',
  tts_provider: 'none',
  has_ai_api_key: false,
  has_tts_api_key: false,
};

const normalizeSettings = (input: Partial<AppSettings> | null | undefined): AppSettings => {
  const candidate = input || {};
  const backendUrl = String(candidate.backend_url || '').trim() || DEFAULT_BACKEND_URL;
  const retentionDaysRaw = Number(candidate.retention_days);
  const retentionDays = Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
    ? Math.floor(retentionDaysRaw)
    : DEFAULT_RETENTION_DAYS;

  const aiProvider = ALLOWED_AI_PROVIDERS.includes(candidate.ai_provider as AiProvider)
    ? (candidate.ai_provider as AiProvider)
    : DEFAULT_SETTINGS.ai_provider;
  const ttsProvider = ALLOWED_TTS_PROVIDERS.includes(candidate.tts_provider as TtsProvider)
    ? (candidate.tts_provider as TtsProvider)
    : DEFAULT_SETTINGS.tts_provider;

  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    backend_url: backendUrl,
    password: String(candidate.password || ''),
    retention_days: retentionDays,
    wifi_only: Boolean(candidate.wifi_only),
    auto_delete: Boolean(candidate.auto_delete),
    ai_provider: aiProvider,
    tts_provider: ttsProvider,
    has_ai_api_key: Boolean(candidate.has_ai_api_key),
    has_tts_api_key: Boolean(candidate.has_tts_api_key),
  };
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false,

  loadSettings: async () => {
    try {
      set({ isLoading: true });
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        set({ settings: normalizeSettings(JSON.parse(stored)), isLoading: false });
      } else {
        set({ settings: DEFAULT_SETTINGS, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    try {
      const normalized = normalizeSettings(settings);
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(normalized));
      set({ settings: normalized });
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
