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
import { discoveryNewsService, DiscoverArticle } from '../../src/services/discoveryNews';
import { personalizationService } from '../../src/services/personalization';

export default function DiscoverScreen() {
  const router = useRouter();

  const {
    data: feed = [],
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['discover-feed'],
    queryFn: () => discoveryNewsService.getPersonalizedFeed(36),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const {
    data: interests = [],
  } = useQuery({
    queryKey: ['discover-interests'],
    queryFn: () => personalizationService.getTopInterests(12),
    staleTime: 2 * 60 * 1000,
  });

  const openArticle = (item: DiscoverArticle) => {
    router.push({
      pathname: '/article',
      params: {
        url: encodeURIComponent(item.link),
        title: encodeURIComponent(item.title),
        source: encodeURIComponent(item.source),
      },
    });
  };

  const openVideo = async (videoUrl?: string) => {
    if (!videoUrl) return;
    const canOpen = await Linking.canOpenURL(videoUrl);
    if (!canOpen) {
      Alert.alert('Cannot open video', 'This source does not expose a playable video URL.');
      return;
    }
    await Linking.openURL(videoUrl);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>
            Personalized from what you ask FinchWire AI and what you watch/download.
          </Text>
        </View>

        <View style={styles.chipRow}>
          {interests.slice(0, 8).map((interest) => (
            <View key={interest} style={styles.chip}>
              <Text style={styles.chipText}>{interest}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.errorText}>
              Could not load news right now: {(error as Error).message}
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {feed.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              onOpen={() => openArticle(item)}
              onOpenVideo={() => openVideo(item.videoUrl)}
            />
          ))}
        </View>

        {feed.length === 0 && !error ? (
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No stories yet</Text>
            <Text style={styles.emptyText}>
              Pull to refresh. Personalization improves as you chat with AI and watch more media.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ArticleCard({
  item,
  onOpen,
  onOpenVideo,
}: {
  item: DiscoverArticle;
  onOpen: () => void;
  onOpenVideo: () => void;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const showImage = Boolean(item.imageUrl && !imageFailed);
  const hasVideo = Boolean(item.videoUrl);

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.9}>
      {showImage ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="newspaper-outline" size={28} color={colors.textSecondary} />
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          <Text style={styles.source} numberOfLines={1}>{item.source}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.date} numberOfLines={1}>
            {new Date(item.publishedAt).toLocaleDateString()}
          </Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={3}>{item.title}</Text>
        <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>

        <View style={styles.actionRow}>
          <View style={styles.matchRow}>
            {item.matchedInterests.slice(0, 2).map((interest) => (
              <View key={`${item.id}-${interest}`} style={styles.matchChip}>
                <Text style={styles.matchChipText}>{interest}</Text>
              </View>
            ))}
          </View>

          {hasVideo ? (
            <TouchableOpacity style={styles.videoBtn} onPress={onOpenVideo}>
              <Ionicons name="play-circle-outline" size={14} color={colors.buttonText} />
              <Text style={styles.videoBtnText}>Play Video</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
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
    height: 180,
    backgroundColor: colors.surface,
  },
  imagePlaceholder: {
    width: '100%',
    height: 180,
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
  actionRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  matchRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  matchChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#5A2323',
  },
  matchChipText: {
    ...typography.caption,
    color: '#FFB4B4',
    fontWeight: '700',
  },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  videoBtnText: {
    ...typography.caption,
    color: colors.buttonText,
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
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
});
