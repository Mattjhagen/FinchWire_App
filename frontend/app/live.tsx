import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChannelGuide } from '../src/features/live/components/ChannelGuide';
import { LivePlayer } from '../src/features/live/components/LivePlayer';
import {
  findChannelById,
  getInitialChannel,
  LIVE_LAST_CHANNEL_KEY,
  normalizeChannelParam,
} from '../src/features/live/channelSelection';
import { LIVE_CHANNELS } from '../src/features/live/channels';
import { borderRadius, colors, spacing, typography } from '../src/utils/theme';

export default function LiveTvPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channel?: string }>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const queryChannelId = useMemo(
    () => normalizeChannelParam(params.channel),
    [params.channel]
  );

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const selectedChannel = useMemo(
    () => findChannelById(LIVE_CHANNELS, selectedChannelId),
    [selectedChannelId]
  );

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const stored = await AsyncStorage.getItem(LIVE_LAST_CHANNEL_KEY);
        if (cancelled) return;

        const initial = getInitialChannel(LIVE_CHANNELS, queryChannelId, stored);
        if (initial.queryIsInvalid && queryChannelId) {
          setWarning(`Channel "${queryChannelId}" was not found. Loaded default channel.`);
        } else {
          setWarning(null);
        }
        setSelectedChannelId(initial.channel?.id || null);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [queryChannelId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!queryChannelId) return;

    const queryChannel = findChannelById(LIVE_CHANNELS, queryChannelId);
    if (queryChannel && queryChannel.id !== selectedChannelId) {
      setSelectedChannelId(queryChannel.id);
      setWarning(null);
      return;
    }

    if (!queryChannel) {
      setWarning(`Channel "${queryChannelId}" was not found. Showing the current selection.`);
    }
  }, [isHydrated, queryChannelId, selectedChannelId]);

  useEffect(() => {
    if (!isHydrated || !selectedChannelId) return;

    AsyncStorage.setItem(LIVE_LAST_CHANNEL_KEY, selectedChannelId).catch(() => {
      // Non-critical persistence failure.
    });

    if (queryChannelId !== selectedChannelId) {
      router.setParams({ channel: selectedChannelId });
    }
  }, [isHydrated, queryChannelId, router, selectedChannelId]);

  const onSelectChannel = (channelId: string) => {
    setWarning(null);
    setSelectedChannelId(channelId);
  };

  return (
    <View style={styles.container}>
      {/* In landscape the LivePlayer fills the screen via absolute positioning;
          hide the scroll content behind it so nothing peeks through */}
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEnabled={!isLandscape}
        style={isLandscape ? styles.scrollHidden : undefined}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Live TV</Text>
            <Text style={styles.subtitle}>
              Pluto-style channel guide, powered by legal YouTube embeds.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {warning ? (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={14} color={colors.warning} />
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ) : null}

        {LIVE_CHANNELS.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="tv-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No channels configured</Text>
            <Text style={styles.emptyStateText}>
              Add channel entries in `src/features/live/channels.ts` to start using Live TV.
            </Text>
          </View>
        ) : (
          <>
            <LivePlayer channel={selectedChannel} />

            <View style={styles.metadataCard}>
              <Text style={styles.metadataTitle}>{selectedChannel?.name || 'No channel selected'}</Text>
              <Text style={styles.metadataText}>
                {selectedChannel?.description || 'Select a channel from the guide below.'}
              </Text>
              <View style={styles.metadataRow}>
                {selectedChannel?.provider ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{selectedChannel.provider.toUpperCase()}</Text>
                  </View>
                ) : null}
                {selectedChannel?.category ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{selectedChannel.category}</Text>
                  </View>
                ) : null}
                {selectedChannel?.embedType ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{selectedChannel.embedType}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ChannelGuide
              channels={LIVE_CHANNELS}
              selectedChannelId={selectedChannelId}
              onSelectChannel={onSelectChannel}
            />
          </>
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
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  scrollHidden: {
    opacity: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...typography.h1,
    fontSize: 30,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#2A1616',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  warningText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    minHeight: 240,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyStateTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  emptyStateText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  metadataCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metadataTitle: {
    ...typography.h3,
    fontSize: 20,
  },
  metadataText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  metadataRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
