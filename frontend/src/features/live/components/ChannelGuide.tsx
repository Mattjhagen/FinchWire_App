import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../utils/theme';
import { filterChannels, getChannelCategories } from '../channelSelection';
import { LiveChannel } from '../types';

interface ChannelGuideProps {
  channels: LiveChannel[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

const FALLBACK_THUMBNAIL = 'https://i.ytimg.com/vi_webp/M7lc1UVf-VE/hqdefault.webp';

export function ChannelGuide({ channels, selectedChannelId, onSelectChannel }: ChannelGuideProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = useMemo(() => ['All', ...getChannelCategories(channels)], [channels]);

  const visibleChannels = useMemo(
    () => filterChannels(channels, searchTerm, activeCategory),
    [channels, searchTerm, activeCategory]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Channels</Text>
        <Text style={styles.count}>{visibleChannels.length}</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search channel, topic, or tag..."
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search channels"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map((category) => {
          const selected = category === activeCategory;
          return (
            <TouchableOpacity
              key={category}
              onPress={() => setActiveCategory(category)}
              style={[styles.categoryChip, selected && styles.categoryChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>{category}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.list}>
        {visibleChannels.map((channel) => {
          const selected = channel.id === selectedChannelId;
          return (
            <TouchableOpacity
              key={channel.id}
              onPress={() => onSelectChannel(channel.id)}
              style={[styles.channelCard, selected && styles.channelCardSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Play ${channel.name}`}
            >
              <Image source={{ uri: channel.thumbnail || FALLBACK_THUMBNAIL }} style={styles.thumbnail} />
              <View style={styles.channelCopy}>
                <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
                <Text style={styles.channelDescription} numberOfLines={2}>
                  {channel.description || 'No description'}
                </Text>
                <View style={styles.channelMetaRow}>
                  {channel.category ? <Text style={styles.channelMeta}>{channel.category}</Text> : null}
                  {channel.language ? (
                    <>
                      <Text style={styles.dot}>•</Text>
                      <Text style={styles.channelMeta}>{channel.language.toUpperCase()}</Text>
                    </>
                  ) : null}
                </View>
              </View>
              {selected ? <Ionicons name="radio-button-on" size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {visibleChannels.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="tv-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.emptyStateText}>No channels match that filter.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h3,
    fontSize: 18,
  },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    ...typography.bodySmall,
    color: colors.text,
  },
  categoryRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  categoryChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  categoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#2A1010',
  },
  categoryChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: colors.primaryLight,
  },
  list: {
    gap: spacing.sm,
  },
  channelCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  channelCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#1F1414',
  },
  thumbnail: {
    width: 82,
    height: 50,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  channelCopy: {
    flex: 1,
    gap: 2,
  },
  channelName: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  channelDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  channelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  dot: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: 4,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyStateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
