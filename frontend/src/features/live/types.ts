export type ChannelProvider = 'youtube' | 'twitch' | 'hls';

export type LiveChannelEmbedType = 'video' | 'playlist' | 'live';

export interface LiveChannel {
  id: string;
  name: string;
  provider: ChannelProvider;
  embedType: LiveChannelEmbedType;
  videoId?: string;
  playlistId?: string;
  streamUrl?: string;
  thumbnail?: string;
  description?: string;
  category?: string;
  language?: string;
  tags?: string[];
  featured?: boolean;
}

export interface LiveEmbedResult {
  url: string | null;
  sourceUrl: string | null;
  error: string | null;
}
