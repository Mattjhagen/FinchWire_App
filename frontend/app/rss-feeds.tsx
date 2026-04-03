// RSS Feed Manager — add, toggle, and remove RSS feeds shown on the home screen
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../src/utils/theme';
import { useSettingsStore } from '../src/store/settingsStore';
import { PRESET_RSS_FEEDS } from '../src/services/widgets';
import { RssFeedEntry } from '../src/types';

export default function RssFeedsScreen() {
  const router = useRouter();
  const { settings, saveSettings } = useSettingsStore();

  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const customFeeds: RssFeedEntry[] = settings?.custom_rss_feeds ?? [];

  const addFeed = async () => {
    const url = newUrl.trim();
    const label = newLabel.trim() || new URL(url).hostname;

    if (!url.startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a full URL starting with http:// or https://');
      return;
    }

    const already = customFeeds.some((f) => f.url === url);
    if (already) {
      Alert.alert('Already added', 'This feed URL is already in your list.');
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        ...settings!,
        custom_rss_feeds: [...customFeeds, { url, label }],
      });
      setNewUrl('');
      setNewLabel('');
    } catch {
      Alert.alert('Error', 'Could not save feed. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeFeed = (url: string) => {
    Alert.alert('Remove feed', 'Remove this RSS feed from your home screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await saveSettings({
            ...settings!,
            custom_rss_feeds: customFeeds.filter((f) => f.url !== url),
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>RSS Feeds</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Add new feed */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add a Feed</Text>
          <TextInput
            style={styles.input}
            value={newUrl}
            onChangeText={setNewUrl}
            placeholder="https://example.com/rss.xml"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={[styles.input, { marginTop: spacing.sm }]}
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="Label (e.g. TechCrunch)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
          />
          <TouchableOpacity
            style={[styles.addBtn, (!newUrl.trim() || isSaving) && styles.addBtnDisabled]}
            onPress={addFeed}
            disabled={!newUrl.trim() || isSaving}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.buttonText} />
            <Text style={styles.addBtnText}>{isSaving ? 'Saving…' : 'Add Feed'}</Text>
          </TouchableOpacity>
        </View>

        {/* Custom feeds */}
        {customFeeds.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>My Feeds</Text>
            <View style={styles.card}>
              {customFeeds.map((feed, index) => (
                <View key={feed.url} style={[styles.feedRow, index > 0 && styles.feedRowBorder]}>
                  <Ionicons name="radio-outline" size={18} color={colors.primary} />
                  <View style={styles.feedInfo}>
                    <Text style={styles.feedLabel}>{feed.label}</Text>
                    <Text style={styles.feedUrl} numberOfLines={1}>{feed.url}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFeed(feed.url)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Built-in preset feeds */}
        <Text style={styles.sectionTitle}>Built-in Feeds</Text>
        <View style={styles.card}>
          {PRESET_RSS_FEEDS.map((feed, index) => (
            <View key={feed.url} style={[styles.feedRow, index > 0 && styles.feedRowBorder]}>
              <Ionicons name="globe-outline" size={18} color={colors.textSecondary} />
              <View style={styles.feedInfo}>
                <Text style={styles.feedLabel}>{feed.label}</Text>
                <Text style={styles.feedUrl} numberOfLines={1}>{feed.url}</Text>
              </View>
              <Text style={styles.builtInBadge}>Built-in</Text>
            </View>
          ))}
        </View>

        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.hintText}>
            RSS headlines appear on the home screen and refresh every 15 minutes. Pull-to-refresh updates them immediately.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 52,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    fontSize: 15,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.buttonText,
  },
  sectionTitle: {
    ...typography.h3,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  feedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feedInfo: {
    flex: 1,
  },
  feedLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  feedUrl: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  builtInBadge: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  hintText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
