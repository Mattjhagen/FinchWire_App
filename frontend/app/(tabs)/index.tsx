// Home Screen - Google-style discovery surface for FinchWire
import React, { useMemo, useState } from 'react';
import {
  Alert,
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
import { Loading } from '../../src/components/Loading';
import { EmptyState } from '../../src/components/EmptyState';
import { MediaCard } from '../../src/components/MediaCard';
import { MediaJob } from '../../src/types';

type SignalCard = {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: mediaList, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['media-home'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: 5000,
    retry: 1,
  });

  const completedMedia = useMemo(
    () => (mediaList ?? []).filter((item) => item.status === 'completed'),
    [mediaList]
  );
  const activeJobs = useMemo(
    () => (mediaList ?? []).filter((item) => item.status === 'queued' || item.status === 'downloading'),
    [mediaList]
  );
  const failedJobs = useMemo(
    () => (mediaList ?? []).filter((item) => item.status === 'failed'),
    [mediaList]
  );
  const keptCount = useMemo(
    () => (mediaList ?? []).filter((item) => item.keep_forever === true || item.keep_forever === 1).length,
    [mediaList]
  );

  const sourceSummary = useMemo(() => {
    const frequency = new Map<string, number>();
    for (const item of completedMedia) {
      const domain = item.source_domain || 'Unknown source';
      frequency.set(domain, (frequency.get(domain) ?? 0) + 1);
    }
    if (frequency.size === 0) return 'No source history yet';

    const top = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0];
    return `${top[0]} • ${top[1]} watched`;
  }, [completedMedia]);

  const forYouMedia = useMemo(() => {
    if (!libraryQuery.trim()) {
      return completedMedia.slice(0, 8);
    }

    const q = libraryQuery.toLowerCase();
    return completedMedia.filter(
      (item) =>
        item.filename?.toLowerCase().includes(q) ||
        item.source_domain?.toLowerCase().includes(q)
    );
  }, [completedMedia, libraryQuery]);

  const cards: SignalCard[] = [
    {
      id: 'queue',
      title: 'In Queue',
      value: String(activeJobs.length),
      subtitle: activeJobs.length > 0 ? 'Active downloads running' : 'No active downloads',
      icon: 'cloud-download',
      tint: colors.info,
    },
    {
      id: 'kept',
      title: 'Saved Forever',
      value: String(keptCount),
      subtitle: 'Excluded from auto-delete',
      icon: 'bookmark',
      tint: colors.warning,
    },
    {
      id: 'library',
      title: 'Library Size',
      value: String(completedMedia.length),
      subtitle: 'Completed media items',
      icon: 'play-circle',
      tint: colors.success,
    },
    {
      id: 'failed',
      title: 'Needs Attention',
      value: String(failedJobs.length),
      subtitle: failedJobs.length > 0 ? 'Failed jobs ready to retry' : 'No failed downloads',
      icon: 'alert-circle',
      tint: failedJobs.length > 0 ? colors.error : colors.textSecondary,
    },
  ];

  const isLikelyUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

  const handlePromptSubmit = async () => {
    const prompt = assistantPrompt.trim();
    if (!prompt || isSubmitting) return;

    if (isLikelyUrl(prompt)) {
      setIsSubmitting(true);
      try {
        await apiService.submitDownload({ url: prompt });
        setAssistantPrompt('');
        await refetch();
        Alert.alert('Queued', 'Download submitted. You can track progress in Downloads.');
      } catch (submitError: any) {
        Alert.alert('Error', submitError?.message || 'Failed to queue download');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const match = completedMedia.find((item) => item.filename?.toLowerCase().includes(prompt.toLowerCase()));
    if (match) {
      router.push(`/player/${match.id}`);
      return;
    }

    Alert.alert(
      'AI Search Preview',
      'No direct match found yet. Agent-based search + auto-fetch is the next step we can wire to backend.'
    );
  };

  const handleMediaPress = (media: MediaJob) => {
    if (media.status === 'completed') {
      router.push(`/player/${media.id}`);
      return;
    }

    if (media.status === 'failed') {
      Alert.alert(
        'Download Failed',
        media.error_message || 'This download failed',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retry',
            onPress: async () => {
              try {
                await apiService.retryDownload(media.id);
                refetch();
              } catch {
                Alert.alert('Error', 'Failed to retry download');
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert('Info', `This media is currently ${media.status}.`);
  };

  const handleMediaLongPress = (media: MediaJob) => {
    Alert.alert(
      media.filename || 'Media',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteJob(media.id);
              refetch();
            } catch {
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <Loading message="Loading home..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Cannot reach server"
        message={(error as Error).message}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.logoWrap}>
          <Text style={styles.logoMain}>FinchWire</Text>
          <Text style={styles.logoSub}>Ask, discover, and queue media instantly</Text>
        </View>

        <View style={styles.promptBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.promptInput}
            placeholder="Ask FinchWire or paste a video URL..."
            placeholderTextColor={colors.textTertiary}
            value={assistantPrompt}
            onChangeText={setAssistantPrompt}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handlePromptSubmit}
          />
          <TouchableOpacity
            style={[styles.promptSendButton, (!assistantPrompt.trim() || isSubmitting) && styles.disabledButton]}
            onPress={handlePromptSubmit}
            disabled={!assistantPrompt.trim() || isSubmitting}
          >
            <Ionicons name="arrow-up" size={16} color={colors.buttonText} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity style={styles.chip}>
            <Ionicons name="sparkles" size={16} color={colors.text} />
            <Text style={styles.chipText}>AI Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => router.push('/(tabs)/downloads')}>
            <Ionicons name="cloud-download-outline" size={16} color={colors.text} />
            <Text style={styles.chipText}>Queue ({activeJobs.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => router.push('/(tabs)/add')}>
            <Ionicons name="add-circle-outline" size={16} color={colors.text} />
            <Text style={styles.chipText}>Add URL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Ionicons name="newspaper-outline" size={16} color={colors.text} />
            <Text style={styles.chipText}>News Feed</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Briefing</Text>
          <Text style={styles.sectionLabel}>{sourceSummary}</Text>
        </View>

        <View style={styles.signalGrid}>
          {cards.map((card) => (
            <View key={card.id} style={styles.signalCard}>
              <View style={styles.signalTitleRow}>
                <Ionicons name={card.icon} size={16} color={card.tint} />
                <Text style={styles.signalTitle}>{card.title}</Text>
              </View>
              <Text style={styles.signalValue}>{card.value}</Text>
              <Text style={styles.signalSubtitle}>{card.subtitle}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>For You</Text>
        </View>

        <View style={styles.librarySearchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.librarySearchInput}
            placeholder="Filter your media feed..."
            placeholderTextColor={colors.textTertiary}
            value={libraryQuery}
            onChangeText={setLibraryQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {libraryQuery.length > 0 && (
            <TouchableOpacity onPress={() => setLibraryQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {forYouMedia.length === 0 ? (
          <EmptyState
            icon="play-circle-outline"
            title="Nothing to show yet"
            message="Queue some media and your personalized home feed will appear here."
          />
        ) : (
          <View style={styles.feedList}>
            {forYouMedia.map((item) => (
              <MediaCard
                key={item.id}
                media={item}
                onPress={() => handleMediaPress(item)}
                onLongPress={() => handleMediaLongPress(item)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  logoWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  logoMain: {
    ...typography.h1,
    fontSize: 42,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  logoSub: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  promptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    minHeight: 54,
  },
  promptInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
  },
  promptSendButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.45,
  },
  chipRow: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 19,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  signalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  signalCard: {
    width: '48%',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 112,
  },
  signalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  signalTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  signalValue: {
    ...typography.h2,
    marginTop: spacing.xs,
  },
  signalSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  librarySearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.md,
  },
  librarySearchInput: {
    flex: 1,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
  },
  feedList: {
    gap: spacing.sm,
  },
});
