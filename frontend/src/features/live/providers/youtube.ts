import { LiveChannel, LiveEmbedResult } from '../types';

// youtube-nocookie.com reduces tracking cookies and is less aggressively blocked.
// enablejsapi=1 lets the injected JS receive error events from YouTube's iframe API.
const BASE_EMBED_QUERY = 'autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=https://finchwire.app';

const isValidId = (value?: string): boolean => Boolean(value && value.trim().length >= 6);

export function getYouTubeEmbedResult(channel: LiveChannel): LiveEmbedResult {
  if (channel.embedType === 'playlist') {
    if (!isValidId(channel.playlistId)) {
      return {
        url: null,
        sourceUrl: null,
        error: 'This channel is missing a valid YouTube playlist ID.',
      };
    }

    return {
      url: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(channel.playlistId!)}&${BASE_EMBED_QUERY}`,
      sourceUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(channel.playlistId!)}`,
      error: null,
    };
  }

  if (!isValidId(channel.videoId)) {
    return {
      url: null,
      sourceUrl: null,
      error: 'This channel is missing a valid YouTube video/live ID.',
    };
  }

  return {
    url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(channel.videoId!)}?${BASE_EMBED_QUERY}`,
    sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(channel.videoId!)}`,
    error: null,
  };
}
