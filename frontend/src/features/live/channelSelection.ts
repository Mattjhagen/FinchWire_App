import { LiveChannel } from './types';

export const LIVE_LAST_CHANNEL_KEY = '@finchwire_live_last_channel';

export const normalizeChannelParam = (value?: string | string[] | null): string | null => {
  if (!value) return null;
  const first = Array.isArray(value) ? value[0] : value;
  const normalized = String(first || '').trim();
  return normalized.length > 0 ? normalized : null;
};

export const findChannelById = (
  channels: LiveChannel[],
  channelId?: string | null
): LiveChannel | null => {
  if (!channelId) return null;
  return channels.find((channel) => channel.id === channelId) || null;
};

export const getDefaultChannel = (channels: LiveChannel[]): LiveChannel | null => {
  if (!channels.length) return null;
  const featured = channels.find((channel) => channel.featured);
  return featured || channels[0];
};

export const getInitialChannel = (
  channels: LiveChannel[],
  queryChannelId?: string | null,
  persistedChannelId?: string | null
): { channel: LiveChannel | null; queryIsInvalid: boolean } => {
  if (!channels.length) {
    return { channel: null, queryIsInvalid: false };
  }

  const fromQuery = findChannelById(channels, queryChannelId);
  if (queryChannelId && fromQuery) {
    return { channel: fromQuery, queryIsInvalid: false };
  }

  const fromStorage = findChannelById(channels, persistedChannelId);
  if (fromStorage) {
    return { channel: fromStorage, queryIsInvalid: Boolean(queryChannelId) };
  }

  return {
    channel: getDefaultChannel(channels),
    queryIsInvalid: Boolean(queryChannelId),
  };
};

export const getChannelCategories = (channels: LiveChannel[]): string[] => {
  const categories = new Set<string>();
  channels.forEach((channel) => {
    if (channel.category) categories.add(channel.category);
  });
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
};

export const filterChannels = (
  channels: LiveChannel[],
  searchTerm: string,
  category: string
): LiveChannel[] => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return channels.filter((channel) => {
    if (category !== 'All' && (channel.category || 'Uncategorized') !== category) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      channel.name,
      channel.description || '',
      channel.category || '',
      channel.language || '',
      ...(channel.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
};
