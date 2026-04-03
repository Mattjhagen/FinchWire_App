import React from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { LiveStory } from '../../src/types';

const prettyScore = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value.toFixed(1);
};

const decodeHtmlEntities = (value: string): string => {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

const compactSummary = (summary: string, fallbackTitle?: string): string => {
  const normalized = decodeHtmlEntities(summary)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = normalized || String(fallbackTitle || '').trim();
  if (!base) return 'No summary available.';

  const sentences = base
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const topTwo = sentences.slice(0, 2).join(' ').trim();
  if (topTwo) return topTwo.length > 280 ? `${topTwo.slice(0, 277).trim()}...` : topTwo;

  return base.length > 200 ? `${base.slice(0, 197).trim()}...` : base;
};

export default function DiscoverScreen() {
  const router = useRouter();

  const {
    data: feed = [],
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['discover-feed-live-stories'],
    queryFn: () => apiService.getLiveStories(48),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const {
    data: interestData,
    refetch: refetchInterests,
  } = useQuery({
    queryKey: ['discover-interest-profile'],
    queryFn: () => apiService.getMyInterests(),
    staleTime: 2 * 60 * 1000,
  });

  const topInterests = interestData?.topTopics?.map((entry) => entry.topic) || [];

  const refreshAll = async () => {
    await Promise.all([refetch(), refetchInterests()]);
  };

  const openArticle = (item: LiveStory) => {
    router.push({
      pathname: '/article',
      params: {
        url: encodeURIComponent(item.url),
        title: encodeURIComponent(item.title),
        source: encodeURIComponent(item.source),
        storyId: item.id,
        topics: encodeURIComponent(JSON.stringify(item.topics || [])),
        keywords: encodeURIComponent(JSON.stringify(item.keywords || [])),
      },
    });
  };

  const openSource = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Cannot open link', 'This source URL is not available on your phone.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Cannot open', 'Could not open this URL.');
    }
  };

  const sendFeedback = async (
    item: LiveStory,
    interaction_type:
      | 'story_liked'
      | 'story_dismissed'
      | 'topic_muted'
      | 'topic_followed'
      | 'story_opened'
  ) => {
    try {
      await apiService.sendInterestFeedback({
        interaction_type,
        story_id: item.id,
        title: item.title,
        source: item.source,
        topics: item.topics || [],
        keywords: item.keywords || [],
      });
      await refetchInterests();
    } catch (error: any) {
      Alert.alert('Feedback failed', error?.message || 'Could not update your interest profile.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refreshAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>
            Stories are ranked server-side using your interaction signals, recency, and trend velocity.
          </Text>
        </View>

        <View style={styles.chipRow}>
          {topInterests.slice(0, 8).map((interest) => (
            <View key={interest} style={styles.chip}>
              <Text style={styles.chipText}>{interest}</Text>
            </View>
          ))}
          {topInterests.length === 0 ? (
            <Text style={styles.emptyInterestText}>Like or dismiss stories to train your feed.</Text>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.errorText}>
              Could not load personalized stories: {(error as Error).message}
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {feed.map((item) => (
            <StoryCard
              key={item.id}
              item={item}
              onOpen={() => {
                sendFeedback(item, 'story_opened').catch(() => undefined);
                openArticle(item);
              }}
              onOpenSource={() => openSource(item.url)}
              onLike={() => sendFeedback(item, 'story_liked')}
              onDismiss={() => sendFeedback(item, 'story_dismissed')}
              onMuteTopic={() => sendFeedback(item, 'topic_muted')}
              onFollowTopic={() => sendFeedback(item, 'topic_followed')}
            />
          ))}
        </View>

        {feed.length === 0 && !error ? (
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No stories yet</Text>
            <Text style={styles.emptyText}>
              Pull to refresh. You can also run a manual cycle in Alerts to ingest and rank now.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StoryCard({
  item,
  onOpen,
  onOpenSource,
  onLike,
  onDismiss,
  onMuteTopic,
  onFollowTopic,
}: {
  item: LiveStory;
  onOpen: () => void;
  onOpenSource: () => void;
  onLike: () => void;
  onDismiss: () => void;
  onMuteTopic: () => void;
  onFollowTopic: () => void;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const showImage = Boolean(item.imageUrl && !imageFailed);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onOpen} activeOpacity={0.9}>
        {showImage ? (
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="newspaper-outline" size={28} color={colors.textSecondary} />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          <Text style={styles.source} numberOfLines={1}>{item.source}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.date} numberOfLines={1}>
            {new Date(item.publishedAt).toLocaleString()}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={3}>{item.title}</Text>
        <Text style={styles.cardSummary} numberOfLines={3}>
          {compactSummary(item.summary || '', item.title)}
        </Text>

        <View style={styles.scoreRow}>
          <ScoreBadge label="Hotness" value={prettyScore(item.hotnessScore)} />
          <ScoreBadge label="Velocity" value={prettyScore(item.velocityScore)} />
          <ScoreBadge label="Interest" value={prettyScore(item.userInterestMatch)} />
        </View>

        <View style={styles.reasonRow}>
          {(item.reasonCodes || []).slice(0, 3).map((reason) => (
            <View key={`${item.id}-${reason}`} style={styles.reasonChip}>
              <Text style={styles.reasonChipText}>{reason}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={onOpen}>
            <Ionicons name="reader-outline" size={14} color={colors.buttonText} />
            <Text style={styles.primaryBtnText}>Read In App</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenSource}>
            <Ionicons name="open-outline" size={14} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Open Source</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onLike}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Interested</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss}>
            <Ionicons name="eye-off-outline" size={14} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Not for me</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onFollowTopic}>
            <Ionicons name="add-circle-outline" size={14} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Follow topic</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onMuteTopic}>
            <Ionicons name="ban-outline" size={14} color={colors.text} />
            <Text style={styles.secondaryBtnText}>Mute topic</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ScoreBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.scoreBadge}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreValue}>{value}</Text>
    </View>
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
  header: {
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    fontSize: 34,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  emptyInterestText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
  },
  cardImage: {
    width: '100%',
    height: 190,
    backgroundColor: colors.surface,
  },
  imagePlaceholder: {
    width: '100%',
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
  },
  cardBody: {
    padding: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 6,
  },
  source: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '700',
    flexShrink: 1,
  },
  metaDot: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  date: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 20,
    lineHeight: 26,
    marginBottom: spacing.xs,
  },
  cardSummary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  scoreBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  scoreLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scoreValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  reasonRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  reasonChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#5A2323',
  },
  reasonChipText: {
    ...typography.caption,
    color: '#FFB4B4',
    fontWeight: '700',
  },
  actionRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    ...typography.caption,
    color: colors.buttonText,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#3A2A14',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#7A5A22',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: '#FFCE6A',
    flex: 1,
  },
  emptyState: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.h3,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
