import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSONALIZATION_KEY = '@finchwire_personalization_v1';
const MAX_SIGNAL_TERMS = 400;
const MAX_RECENT_PROMPTS = 40;

type SignalMap = Record<string, number>;

interface PersonalizationState {
  signals: SignalMap;
  recentPrompts: string[];
  updatedAt: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'your', 'you', 'are', 'was', 'have', 'has',
  'will', 'into', 'just', 'what', 'when', 'where', 'which', 'their', 'there', 'they', 'them', 'then',
  'about', 'after', 'before', 'while', 'would', 'could', 'should', 'also', 'more', 'most', 'some',
  'very', 'over', 'under', 'onto', 'than', 'been', 'being', 'were', 'had', 'did', 'does', 'its', 'it',
  'our', 'out', 'off', 'any', 'all', 'new', 'now', 'not', 'too', 'can', 'his', 'her', 'she', 'him',
  'how', 'why', 'who', 'use', 'using', 'used', 'via', 'app', 'video', 'videos', 'news', 'article',
  'watch', 'watching', 'download', 'downloads', 'http', 'https', 'www', 'com', 'org', 'net'
]);

const createDefaultState = (): PersonalizationState => ({
  signals: {},
  recentPrompts: [],
  updatedAt: new Date().toISOString(),
});

const normalizeText = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenize = (value: string): string[] => {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));
};

const clampSignals = (signals: SignalMap): SignalMap => {
  const entries = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  const trimmed = entries.slice(0, MAX_SIGNAL_TERMS);
  return Object.fromEntries(trimmed);
};

class PersonalizationService {
  private cache: PersonalizationState | null = null;

  private async load(): Promise<PersonalizationState> {
    if (this.cache) return this.cache;

    try {
      const raw = await AsyncStorage.getItem(PERSONALIZATION_KEY);
      if (!raw) {
        this.cache = createDefaultState();
        return this.cache;
      }

      const parsed = JSON.parse(raw);
      const state: PersonalizationState = {
        signals: parsed?.signals && typeof parsed.signals === 'object' ? parsed.signals : {},
        recentPrompts: Array.isArray(parsed?.recentPrompts) ? parsed.recentPrompts : [],
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
      this.cache = state;
      return state;
    } catch {
      this.cache = createDefaultState();
      return this.cache;
    }
  }

  private async save(state: PersonalizationState): Promise<void> {
    const normalized: PersonalizationState = {
      ...state,
      signals: clampSignals(state.signals),
      recentPrompts: state.recentPrompts.slice(-MAX_RECENT_PROMPTS),
      updatedAt: new Date().toISOString(),
    };
    this.cache = normalized;
    await AsyncStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(normalized));
  }

  private async addSignalText(input: string, weight: number): Promise<void> {
    const terms = tokenize(input);
    if (terms.length === 0) return;

    const state = await this.load();
    for (const term of terms) {
      state.signals[term] = (state.signals[term] || 0) + weight;
    }
    await this.save(state);
  }

  async recordAiPrompt(prompt: string): Promise<void> {
    const value = String(prompt || '').trim();
    if (!value) return;

    const state = await this.load();
    state.recentPrompts.push(value);
    await this.save(state);
    await this.addSignalText(value, 2.2);
  }

  async recordMediaInteraction(title: string, sourceDomain?: string): Promise<void> {
    const combined = `${title || ''} ${sourceDomain || ''}`.trim();
    if (!combined) return;
    await this.addSignalText(combined, 1.6);
  }

  async getTopInterests(limit: number = 12): Promise<string[]> {
    const state = await this.load();
    return Object.entries(state.signals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, limit))
      .map(([term]) => term);
  }

  async getRecentPrompts(limit: number = 8): Promise<string[]> {
    const state = await this.load();
    return state.recentPrompts.slice(-Math.max(1, limit)).reverse();
  }
}

export const personalizationService = new PersonalizationService();
