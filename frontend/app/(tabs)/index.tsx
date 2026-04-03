// Home Screen - Google-style AI + News + Fetch workflow
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { personalizationService } from '../../src/services/personalization';
import { MediaJob } from '../../src/types';

type AssistantMode = 'ai' | 'video' | 'news' | 'fetch';

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

const DEFAULT_NEWS_TOPIC = 'AI finance markets';
const QUICK_TOPICS = [
  'AI lending',
  'crypto regulation',
  'decentralized identity',
  'fintech trends',
  'reputation systems',
];

const QUICK_VIDEO_SEARCHES = [
  'AI lending protocol explained',
  'DeFi credit scoring',
  'Fintech market update',
  'Ethereum ecosystem news',
  'Open source AI agents',
];

const decodeXml = (value: string): string => {
  return value
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

const tagValue = (input: string, tag: string): string => {
  const match = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
};

const parseGoogleNewsRss = (xml: string): NewsItem[] => {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return items.slice(0, 10).map((item, index) => {
    const title = tagValue(item, 'title');
    const link = tagValue(item, 'link');
    const source = tagValue(item, 'source') || 'Google News';
    const publishedAt = tagValue(item, 'pubDate');

    return {
      id: `${link || title || 'news'}-${index}`,
      title: title || 'Untitled',
      link,
      source,
      publishedAt,
    };
  });
};

const toGoogleNewsRssUrl = (topic: string): string => {
  const query = encodeURIComponent(topic.trim() || DEFAULT_NEWS_TOPIC);
  return `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
};

const looksLikeUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());

const statusTone = (status: MediaJob['status']): string => {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'downloading':
      return colors.info;
    case 'queued':
      return colors.warning;
    case 'failed':
    case 'expired':
    case 'cancelled':
      return colors.error;
    default:
      return colors.textSecondary;
  }
};

const getPlaybackPath = (job: MediaJob): string => {
  return job.relative_path || job.safe_filename || job.media_url || '';
};

export default function HomeScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AssistantMode>('ai');
  const [prompt, setPrompt] = useState('');
  const [activeTopic, setActiveTopic] = useState(DEFAULT_NEWS_TOPIC);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: mediaList,
    error: mediaError,
    refetch: refetchMedia,
    isRefetching: isRefetchingMedia,
  } = useQuery({
    queryKey: ['home-media-list'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    retry: (failureCount, err: any) => {
      if (String(err?.message || '').toLowerCase().includes('too many requests')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const {
    data: newsItems,
    error: newsError,
    refetch: refetchNews,
    isRefetching: isRefetchingNews,
  } = useQuery({
    queryKey: ['google-news-rss', activeTopic],
    queryFn: async (): Promise<NewsItem[]> => {
      const response = await fetch(toGoogleNewsRssUrl(activeTopic));
      if (!response.ok) {
        throw new Error(`News fetch failed (${response.status})`);
      }
      const xml = await response.text();
      return parseGoogleNewsRss(xml);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
  });

  const completedJobs = useMemo(
    () => (mediaList ?? []).filter((job) => job.status === 'completed').slice(0, 10),
    [mediaList]
  );

  const activeJobs = useMemo(
    () => (mediaList ?? []).filter((job) => job.status === 'queued' || job.status === 'downloading').slice(0, 5),
    [mediaList]
  );

  const refreshAll = async () => {
    await Promise.all([refetchMedia(), refetchNews()]);
  };

  const openExternal = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Cannot open link', 'Your phone could not open this link.');
      return;
    }
    await Linking.openURL(url);
  };

  const handleQueueUrl = async (url: string, isAudio = false) => {
    setIsSubmitting(true);
    try {
      await apiService.submitDownload({
        url: url.trim(),
        is_audio: isAudio,
      });
      Alert.alert('Queued', 'Video sent to your server queue.');
      setPrompt('');
      await refetchMedia();
    } catch (error: any) {
      Alert.alert('Queue Error', error?.message || 'Failed to queue this URL.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssistantAction = async () => {
    const value = prompt.trim();
    if (!value) {
      Alert.alert('Enter something', 'Type a topic or paste a video URL.');
      return;
    }

    if (looksLikeUrl(value)) {
      await handleQueueUrl(value, mode === 'fetch');
      return;
    }

    personalizationService.recordAiPrompt(value).catch(() => {
      // Non-blocking signal for Discover personalization.
    });

    if (mode === 'fetch') {
      await handleQueueUrl(value, false);
      return;
    }

    if (mode === 'news') {
      setActiveTopic(value);
      await refetchNews();
      return;
    }

    if (mode === 'video') {
      const youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(value)}`;
      await openExternal(youtubeSearch);
      return;
    }

    // AI mode: refresh related news + queue best search match via backend.
    if (mode === 'ai') {
      setActiveTopic(value);
      await refetchNews();
      await handleQueueUrl(value, false);
    }
  };

  const modeLabel = useMemo(() => {
    switch (mode) {
      case 'ai':
        return 'AI Mode';
      case 'video':
        return 'Video Search';
      case 'news':
        return 'News Search';
      case 'fetch':
        return 'Fetch URL';
      default:
        return 'AI Mode';
    }
  }, [mode]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingMedia || isRefetchingNews}
            onRefresh={refreshAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headerRow}>
          <Ionicons name="flask-outline" size={24} color="#9FB6FF" />
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarText}>P</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.brand}>Google</Text>
        <Text style={styles.brandSub}>FinchWire AI Home</Text>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Search news, video ideas, or paste a URL to fetch..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleAssistantAction}
          />
          <TouchableOpacity onPress={handleAssistantAction} disabled={isSubmitting}>
            <Ionicons name="search" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.modeRow}>
          <ModeChip label="AI Mode" active={mode === 'ai'} onPress={() => setMode('ai')} icon="sparkles-outline" />
          <ModeChip label="Video" active={mode === 'video'} onPress={() => setMode('video')} icon="play-circle-outline" />
          <ModeChip label="News" active={mode === 'news'} onPress={() => setMode('news')} icon="newspaper-outline" />
          <ModeChip label="Fetch" active={mode === 'fetch'} onPress={() => setMode('fetch')} icon="cloud-download-outline" />
        </View>

        <Text style={styles.modeHint}>
          {modeLabel}: {mode === 'fetch'
            ? 'Paste a URL or type a phrase to queue the best match.'
            : mode === 'ai'
              ? 'Type a topic to refresh news and auto-queue the top media match.'
              : 'Type a topic or URL, then tap Search.'}
        </Text>

        <View style={styles.infoCards}>
          <InfoCard title="Sunset today" value={new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} sub="Local time" />
          <InfoCard title="Server queue" value={String(activeJobs.length)} sub="Active downloads" />
        </View>

        {mediaError ? (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>Media server warning: {(mediaError as Error).message}</Text>
          </View>
        ) : null}

        <SectionTitle title="AI Suggestion Topics" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
          {QUICK_TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic}
              style={styles.topicPill}
              onPress={() => {
                setPrompt(topic);
                setActiveTopic(topic);
                setMode('ai');
                personalizationService.recordAiPrompt(topic).catch(() => {
                  // Non-blocking signal for Discover personalization.
                });
                refetchNews();
              }}
            >
              <Text style={styles.topicPillText}>{topic}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <SectionTitle title="Suggested Video Searches" />
        <View style={styles.cardList}>
          {QUICK_VIDEO_SEARCHES.map((query) => (
            <TouchableOpacity
              key={query}
              style={styles.videoSuggestionCard}
              onPress={() => openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`)}
            >
              <Ionicons name="play-circle" size={22} color={colors.primary} />
              <Text style={styles.videoSuggestionText}>{query}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionTitle title="Latest News (AI + Finance + Tech)" />
        {newsError ? (
          <Text style={styles.errorText}>Could not fetch news right now: {(newsError as Error).message}</Text>
        ) : null}
        <View style={styles.cardList}>
          {(newsItems ?? []).slice(0, 6).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.newsCard}
              onPress={() => {
                personalizationService.recordAiPrompt(`${item.title} ${item.source}`).catch(() => {
                  // Non-blocking signal for Discover personalization.
                });
                openExternal(item.link);
              }}
            >
              <Text style={styles.newsSource}>{item.source}</Text>
              <Text style={styles.newsTitle} numberOfLines={3}>{item.title}</Text>
              <Text style={styles.newsMeta} numberOfLines={1}>{item.publishedAt}</Text>
            </TouchableOpacity>
          ))}
          {(newsItems ?? []).length === 0 && !newsError ? (
            <Text style={styles.emptyText}>Pull to refresh, or enter a topic above to load fresh news.</Text>
          ) : null}
        </View>

        <SectionTitle title="Recent Downloaded Videos" />
        <View style={styles.cardList}>
          {completedJobs.map((job) => (
            <View key={job.id} style={styles.mediaCard}>
              <View style={styles.mediaHeaderRow}>
                <Text style={styles.mediaTitle} numberOfLines={2}>{job.filename || 'Untitled'}</Text>
                <Text style={[styles.statusPill, { color: statusTone(job.status), borderColor: statusTone(job.status) }]}>
                  {job.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.mediaMeta} numberOfLines={1}>{job.source_domain || 'Unknown source'}</Text>
              <View style={styles.mediaActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={() => {
                    personalizationService
                      .recordMediaInteraction(job.filename || 'Untitled', job.source_domain)
                      .catch(() => {
                        // Non-blocking signal for Discover personalization.
                      });
                    router.push(`/player/${job.id}`);
                  }}
                >
                  <Ionicons name="play" size={16} color={colors.buttonText} />
                  <Text style={styles.actionBtnText}>Play</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.secondaryBtn]}
                  onPress={() => openExternal(apiService.getExternalMediaUrl(getPlaybackPath(job)))}
                >
                  <Ionicons name="link-outline" size={16} color={colors.text} />
                  <Text style={styles.actionBtnTextSecondary}>Open URL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {completedJobs.length === 0 ? (
            <Text style={styles.emptyText}>No completed videos yet. Paste a URL in Fetch mode to start.</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function InfoCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoSub}>{sub}</Text>
    </View>
  );
}

function ModeChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity style={[styles.modeChip, active && styles.modeChipActive]} onPress={onPress}>
      <Ionicons name={icon} size={14} color={active ? colors.buttonText : colors.textSecondary} />
      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: '#33D17A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontWeight: '700',
  },
  brand: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  brandSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 11,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
  },
  modeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  modeChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: colors.buttonText,
  },
  modeHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  infoCards: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  infoTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.h3,
    fontSize: 22,
    marginTop: 2,
  },
  infoSub: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A2A14',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#7A5A22',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  warningText: {
    ...typography.caption,
    color: '#FFCE6A',
    flex: 1,
  },
  sectionTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  horizontalRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  topicPill: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  topicPillText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  cardList: {
    gap: spacing.sm,
  },
  videoSuggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  videoSuggestionText: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  newsCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  newsSource: {
    ...typography.caption,
    color: colors.primaryLight,
    marginBottom: 4,
  },
  newsTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  newsMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  mediaCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  mediaHeaderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  mediaTitle: {
    ...typography.body,
    flex: 1,
    fontWeight: '700',
  },
  statusPill: {
    ...typography.caption,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontWeight: '700',
  },
  mediaMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  mediaActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
  },
  actionBtnText: {
    ...typography.bodySmall,
    color: colors.buttonText,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
