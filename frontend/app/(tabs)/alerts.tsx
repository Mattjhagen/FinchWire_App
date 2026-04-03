import React from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../src/services/api';
import { CreatorWatch, FinchNotification } from '../../src/types';
import { borderRadius, colors, spacing, typography } from '../../src/utils/theme';

const DEFAULT_CHANNEL_SUGGESTIONS: { name: string; channelId: string }[] = [
  { name: 'Joe Rogan Experience', channelId: 'UCzQUP1qoWDoEbmsQxvdjxgQ' },
  { name: 'Shawn Ryan Show', channelId: 'UC6JY2f3V5ASwm2yDHQ3Wl7w' },
  { name: 'The Why Files', channelId: 'UCIFfVux4FS4qJGSg8N7gH9A' },
];

const relativeTime = (iso: string): string => {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMin = Math.max(1, Math.floor((now - then) / 60000));
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return iso;
  }
};

export default function AlertsScreen() {
  const [channelId, setChannelId] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [notifyOnLive, setNotifyOnLive] = React.useState(true);
  const [notifyOnUpload, setNotifyOnUpload] = React.useState(true);
  const [majorOnly, setMajorOnly] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const {
    data: watches = [],
    refetch: refetchWatches,
    isRefetching: refetchingWatches,
  } = useQuery({
    queryKey: ['creator-watches'],
    queryFn: () => apiService.getCreatorWatches(),
    refetchInterval: 60_000,
  });

  const {
    data: notifications = [],
    refetch: refetchNotifications,
    isRefetching: refetchingNotifications,
  } = useQuery({
    queryKey: ['alerts-notifications'],
    queryFn: () => apiService.getNotifications(60),
    refetchInterval: 45_000,
  });

  const {
    data: creatorEvents = [],
    refetch: refetchCreatorEvents,
    isRefetching: refetchingCreatorEvents,
  } = useQuery({
    queryKey: ['creator-events'],
    queryFn: () => apiService.getCreatorEvents(120),
    refetchInterval: 45_000,
  });

  const refreshAll = async () => {
    await Promise.all([refetchWatches(), refetchNotifications(), refetchCreatorEvents()]);
  };

  const runNow = async () => {
    try {
      await apiService.runAlertCycle();
      await refreshAll();
      Alert.alert('Cycle complete', 'News + creator signals have been rescored.');
    } catch (error: any) {
      Alert.alert('Run failed', error?.message || 'Could not run alert cycle.');
    }
  };

  const saveWatch = async (payload: Partial<CreatorWatch> = {}) => {
    const effectiveChannelId = String(payload.channelId || channelId).trim();
    const effectiveDisplayName = String(payload.displayName || displayName).trim();
    if (!effectiveChannelId || !effectiveDisplayName) {
      Alert.alert('Missing details', 'Enter a channel ID and display name.');
      return;
    }

    setSaving(true);
    try {
      await apiService.upsertCreatorWatch({
        channelId: effectiveChannelId,
        displayName: effectiveDisplayName,
        notifyOnLive: payload.notifyOnLive ?? notifyOnLive,
        notifyOnUpload: payload.notifyOnUpload ?? notifyOnUpload,
        notifyOnMajorUploadOnly: payload.notifyOnMajorUploadOnly ?? majorOnly,
        enabled: payload.enabled ?? true,
      });
      setChannelId('');
      setDisplayName('');
      await refreshAll();
      Alert.alert('Saved', 'Creator alert watchlist updated.');
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Could not save creator watch.');
    } finally {
      setSaving(false);
    }
  };

  const removeWatch = async (watchId: string) => {
    try {
      await apiService.deleteCreatorWatch(watchId);
      await refetchWatches();
    } catch (error: any) {
      Alert.alert('Delete failed', error?.message || 'Could not remove watch.');
    }
  };

  const openNotification = async (notification: FinchNotification) => {
    try {
      await apiService.markNotificationOpened(notification.id);
    } catch {
      // Ignore open state failures.
    }
    if (!notification.url) return;
    try {
      await Linking.openURL(notification.url);
    } catch {
      Alert.alert('Cannot open', 'Could not open notification URL.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refetchingWatches || refetchingNotifications || refetchingCreatorEvents}
          onRefresh={refreshAll}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Alerts</Text>
        <TouchableOpacity style={styles.runButton} onPress={runNow}>
          <Ionicons name="flash-outline" size={15} color={colors.buttonText} />
          <Text style={styles.runButtonText}>Run Now</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Personalized story spikes + favorite creator live/upload alerts.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Watch Favorite Creators</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name (e.g. Joe Rogan Experience)"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={styles.input}
            value={channelId}
            onChangeText={setChannelId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="YouTube channel ID"
            placeholderTextColor={colors.textTertiary}
          />

          <ToggleRow label="Notify on live streams" value={notifyOnLive} onValueChange={setNotifyOnLive} />
          <ToggleRow label="Notify on uploads" value={notifyOnUpload} onValueChange={setNotifyOnUpload} />
          <ToggleRow label="Only major uploads" value={majorOnly} onValueChange={setMajorOnly} />

          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.buttonDisabled]}
            disabled={saving}
            onPress={() => saveWatch()}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Watch'}</Text>
          </TouchableOpacity>

          <View style={styles.suggestionWrap}>
            {DEFAULT_CHANNEL_SUGGESTIONS.map((entry) => (
              <TouchableOpacity
                key={entry.channelId}
                style={styles.suggestionChip}
                onPress={() => saveWatch({
                  displayName: entry.name,
                  channelId: entry.channelId,
                })}
              >
                <Ionicons name="add-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.suggestionText}>{entry.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Creator Watches</Text>
        <View style={styles.list}>
          {watches.map((watch) => (
            <View key={watch.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{watch.displayName}</Text>
                <TouchableOpacity onPress={() => removeWatch(watch.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              <Text style={styles.itemMeta} numberOfLines={1}>{watch.channelId}</Text>
              <Text style={styles.itemMeta}>
                Live: {watch.notifyOnLive ? 'On' : 'Off'} • Uploads: {watch.notifyOnUpload ? 'On' : 'Off'} • Major only: {watch.notifyOnMajorUploadOnly ? 'On' : 'Off'}
              </Text>
            </View>
          ))}
          {watches.length === 0 ? <Text style={styles.emptyText}>No watched creators yet.</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Notifications</Text>
        <View style={styles.list}>
          {notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={styles.itemCard}
              activeOpacity={0.8}
              onPress={() => openNotification(notification)}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle} numberOfLines={2}>{notification.title}</Text>
                <Text style={styles.itemMeta}>{relativeTime(notification.createdAt)}</Text>
              </View>
              <Text style={styles.itemBody} numberOfLines={2}>{notification.body}</Text>
              <Text style={styles.reasonText}>
                {notification.reasonCode || notification.type}
              </Text>
            </TouchableOpacity>
          ))}
          {notifications.length === 0 ? <Text style={styles.emptyText}>No alerts yet.</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Creator Events (Debug)</Text>
        <View style={styles.list}>
          {creatorEvents.slice(0, 12).map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.itemCard}
              activeOpacity={0.8}
              onPress={() => Linking.openURL(event.url).catch(() => undefined)}
            >
              <Text style={styles.itemTitle} numberOfLines={2}>{event.title}</Text>
              <Text style={styles.itemMeta}>
                {event.eventType} • {relativeTime(event.detectedAt)}
              </Text>
            </TouchableOpacity>
          ))}
          {creatorEvents.length === 0 ? <Text style={styles.emptyText}>No creator events yet.</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surface, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : colors.textTertiary}
      />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    fontSize: 34,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  runButtonText: {
    ...typography.caption,
    color: colors.buttonText,
    fontWeight: '700',
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    color: colors.text,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  toggleLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    ...typography.bodySmall,
    color: colors.buttonText,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  suggestionWrap: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  suggestionText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    flex: 1,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  itemBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  reasonText: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
