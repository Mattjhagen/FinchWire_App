// Settings Store using Zustand
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, DEFAULT_BACKEND_URL, DEFAULT_RETENTION_DAYS } from '../utils/constants';
import { AiProvider, AppLockTimeout, AppSettings, AssetType, HomeTileType, MarketProvider, TemperatureUnit, TtsProvider, WeatherProvider } from '../types';

interface SettingsState {
  settings: AppSettings | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  updateBackendUrl: (url: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const ALLOWED_AI_PROVIDERS: AiProvider[] = ['none', 'gemini', 'openai', 'anthropic', 'groq', 'grok'];
const ALLOWED_TTS_PROVIDERS: TtsProvider[] = ['none', 'gemini', 'openai', 'elevenlabs'];
const ALLOWED_WEATHER_PROVIDERS: WeatherProvider[] = ['open_meteo', 'weatherapi'];
const ALLOWED_MARKET_PROVIDERS: MarketProvider[] = ['coingecko_yahoo', 'finnhub'];
const ALLOWED_ASSET_TYPES: AssetType[] = ['stock', 'crypto'];
const ALLOWED_TEMP_UNITS: TemperatureUnit[] = ['f', 'c'];
const ALLOWED_APP_LOCK_TIMEOUTS: AppLockTimeout[] = ['immediate', '1m', '5m'];
const DEFAULT_TILE_ORDER: HomeTileType[] = ['weather', 'market', 'verse'];

const DEFAULT_SETTINGS: AppSettings = {
  backend_url: DEFAULT_BACKEND_URL,
  password: '',
  retention_days: DEFAULT_RETENTION_DAYS,
  wifi_only: false,
  auto_delete: false,
  app_lock_enabled: false,
  app_lock_biometrics: false,
  app_lock_timeout: '1m',
  ai_provider: 'none',
  tts_provider: 'none',
  has_ai_api_key: false,
  has_tts_api_key: false,
  weather_provider: 'open_meteo',
  market_provider: 'coingecko_yahoo',
  has_weather_api_key: false,
  has_market_api_key: false,
  has_youtube_api_key: false,
  weather_location: 'Omaha, NE',
  weather_lat: '41.2565',
  weather_lon: '-95.9345',
  home_market_symbol: 'BTC',
  home_market_asset_type: 'crypto',
  home_weather_unit: 'f',
  home_tiles: {
    weather: true,
    market: true,
    verse: true,
    order: DEFAULT_TILE_ORDER,
  },
  followed_topics: [],
  followed_sources: [],
  followed_creators: [],
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
  const weatherProvider = ALLOWED_WEATHER_PROVIDERS.includes(candidate.weather_provider as WeatherProvider)
    ? (candidate.weather_provider as WeatherProvider)
    : DEFAULT_SETTINGS.weather_provider;
  const marketProvider = ALLOWED_MARKET_PROVIDERS.includes(candidate.market_provider as MarketProvider)
    ? (candidate.market_provider as MarketProvider)
    : DEFAULT_SETTINGS.market_provider;
  const homeMarketAssetType = ALLOWED_ASSET_TYPES.includes(candidate.home_market_asset_type as AssetType)
    ? (candidate.home_market_asset_type as AssetType)
    : DEFAULT_SETTINGS.home_market_asset_type;
  const homeWeatherUnit = ALLOWED_TEMP_UNITS.includes(candidate.home_weather_unit as TemperatureUnit)
    ? (candidate.home_weather_unit as TemperatureUnit)
    : DEFAULT_SETTINGS.home_weather_unit;
  const appLockTimeout = ALLOWED_APP_LOCK_TIMEOUTS.includes(candidate.app_lock_timeout as AppLockTimeout)
    ? (candidate.app_lock_timeout as AppLockTimeout)
    : DEFAULT_SETTINGS.app_lock_timeout;

  const candidateTiles = candidate.home_tiles && typeof candidate.home_tiles === 'object'
    ? candidate.home_tiles
    : DEFAULT_SETTINGS.home_tiles;
  const orderCandidate = Array.isArray(candidateTiles.order)
    ? candidateTiles.order.filter((item: string): item is HomeTileType => DEFAULT_TILE_ORDER.includes(item as HomeTileType))
    : DEFAULT_TILE_ORDER;
  const normalizedOrder: HomeTileType[] = [
    ...new Set([...orderCandidate, ...DEFAULT_TILE_ORDER]),
  ].filter((item): item is HomeTileType => DEFAULT_TILE_ORDER.includes(item as HomeTileType));

  const normalizeFollowList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry || '').trim())
          .filter((entry) => entry.length > 0)
          .slice(0, 80)
      )
    );
  };

  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    backend_url: backendUrl,
    password: String(candidate.password || ''),
    retention_days: retentionDays,
    wifi_only: Boolean(candidate.wifi_only),
    auto_delete: Boolean(candidate.auto_delete),
    app_lock_enabled: Boolean(candidate.app_lock_enabled),
    app_lock_biometrics: Boolean(candidate.app_lock_biometrics),
    app_lock_timeout: appLockTimeout,
    ai_provider: aiProvider,
    tts_provider: ttsProvider,
    has_ai_api_key: Boolean(candidate.has_ai_api_key),
    has_tts_api_key: Boolean(candidate.has_tts_api_key),
    weather_provider: weatherProvider,
    market_provider: marketProvider,
    has_weather_api_key: Boolean(candidate.has_weather_api_key),
    has_market_api_key: Boolean(candidate.has_market_api_key),
    has_youtube_api_key: Boolean(candidate.has_youtube_api_key),
    weather_location: String(candidate.weather_location || DEFAULT_SETTINGS.weather_location).trim() || DEFAULT_SETTINGS.weather_location,
    weather_lat: String(candidate.weather_lat || DEFAULT_SETTINGS.weather_lat).trim() || DEFAULT_SETTINGS.weather_lat,
    weather_lon: String(candidate.weather_lon || DEFAULT_SETTINGS.weather_lon).trim() || DEFAULT_SETTINGS.weather_lon,
    home_market_symbol: String(candidate.home_market_symbol || DEFAULT_SETTINGS.home_market_symbol).trim().toUpperCase(),
    home_market_asset_type: homeMarketAssetType,
    home_weather_unit: homeWeatherUnit,
    home_tiles: {
      weather: Boolean(candidateTiles.weather ?? DEFAULT_SETTINGS.home_tiles.weather),
      market: Boolean(candidateTiles.market ?? DEFAULT_SETTINGS.home_tiles.market),
      verse: Boolean(candidateTiles.verse ?? DEFAULT_SETTINGS.home_tiles.verse),
      order: normalizedOrder,
    },
    followed_topics: normalizeFollowList(candidate.followed_topics),
    followed_sources: normalizeFollowList(candidate.followed_sources),
    followed_creators: normalizeFollowList(candidate.followed_creators),
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
