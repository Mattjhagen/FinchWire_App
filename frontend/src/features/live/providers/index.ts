import { LiveChannel, LiveEmbedResult } from '../types';
import { getYouTubeEmbedResult } from './youtube';

type EmbedResolver = (channel: LiveChannel) => LiveEmbedResult;

const unsupportedProvider: EmbedResolver = (channel) => ({
  url: null,
  sourceUrl: null,
  error: `${channel.provider} is not wired yet. Add a provider resolver first.`,
});

const hlsResolver: EmbedResolver = (channel) => ({
  url: channel.streamUrl || null,
  sourceUrl: channel.streamUrl || null,
  error: channel.streamUrl ? null : 'Missing stream URL for HLS channel.',
});

const providerRegistry: Record<string, EmbedResolver> = {
  youtube: getYouTubeEmbedResult,
  hls: hlsResolver,
  twitch: unsupportedProvider, // Intentionally prepared for future implementation.
};

export function getLiveEmbedResult(channel: LiveChannel): LiveEmbedResult {
  const resolver = providerRegistry[channel.provider] || unsupportedProvider;
  return resolver(channel);
}
