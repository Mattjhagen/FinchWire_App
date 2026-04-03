import { MediaJob } from '../types';

const YOUTUBE_HOST_PATTERNS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

const isYouTubeHost = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  return YOUTUBE_HOST_PATTERNS.some((pattern) => lower === pattern || lower.endsWith(`.${pattern}`));
};

const extractYouTubeVideoId = (input: string): string | null => {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }

    if (!isYouTubeHost(host)) {
      return null;
    }

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && ['shorts', 'embed', 'live'].includes(pathParts[0])) {
      return pathParts[1];
    }
  } catch {
    return null;
  }

  return null;
};

const extractVimeoVideoId = (input: string): string | null => {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'vimeo.com' && !host.endsWith('.vimeo.com')) {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) return null;

    // Handles both /123456 and /video/123456
    const last = pathParts[pathParts.length - 1];
    if (/^\d+$/.test(last)) {
      return last;
    }
  } catch {
    return null;
  }

  return null;
};

const normalizeMediaUrl = (media: MediaJob): string | null => {
  const candidates = [media.original_url, media.url].filter(Boolean);
  for (const candidate of candidates) {
    try {
      // Validates URL shape and absolute protocol.
      new URL(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
};

export const getMediaThumbnailUrl = (media: MediaJob): string | null => {
  if (media.is_audio) {
    return null;
  }

  const sourceUrl = normalizeMediaUrl(media);
  if (!sourceUrl) {
    return null;
  }

  const youtubeId = extractYouTubeVideoId(sourceUrl);
  if (youtubeId) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  const vimeoId = extractVimeoVideoId(sourceUrl);
  if (vimeoId) {
    // vumbnail provides stable Vimeo thumbnails without API credentials.
    return `https://vumbnail.com/${vimeoId}.jpg`;
  }

  return null;
};
