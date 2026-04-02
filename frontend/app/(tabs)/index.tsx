// Home Screen - Media Drop dashboard (web-style)
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
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
import { downloadService } from '../../src/services/download';
import { storageService } from '../../src/services/storage';
import { useAuthStore } from '../../src/store/authStore';
import { EmptyState } from '../../src/components/EmptyState';
import { Loading } from '../../src/components/Loading';
import { MediaJob } from '../../src/types';

const ACTIVE_STATES: MediaJob['status'][] = ['queued', 'downloading'];
const HISTORY_STATES: MediaJob['status'][] = ['completed', 'failed', 'cancelled', 'expired'];

export default function HomeScreen() {
  const router = useRouter();
  const { authToken, clearAuth } = useAuthStore();

  const [url, setUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingLocalId, setDownloadingLocalId] = useState<string | null>(null);

  const { data: mediaList, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['media-dashboard'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: 4000,
    retry: 1,
  });

  const sortedJobs = useMemo(() => {
    return [...(mediaList ?? [])].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime();
      const bTime = new Date(b.updated_at || b.created_at).getTime();
      return bTime - aTime;
    });
  }, [mediaList]);

  const activeDownloads = useMemo(
    () => sortedJobs.filter((job) => ACTIVE_STATES.includes(job.status)),
    [sortedJobs]
  );

  const recentHistory = useMemo(
    () => sortedJobs.filter((job) => HISTORY_STATES.includes(job.status)).slice(0, 25),
    [sortedJobs]
  );

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

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

  const isValidUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());

  const handleLogout = async () => {
    try {
      await apiService.logout();
    } catch {
      // local auth clear still logs user out
    }
    await clearAuth();
    router.replace('/(auth)/login');
  };

  const handleSubmitDownload = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a media URL');
      return;
    }
    if (!isValidUrl(url)) {
      Alert.alert('Error', 'URL must start with http:// or https://');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.submitDownload({
        url: url.trim(),
        filename: customFilename.trim() || undefined,
        is_audio: isAudioOnly,
      });
      setUrl('');
      setCustomFilename('');
      setIsAudioOnly(false);
      await refetch();
      Alert.alert('Queued', 'Download submitted successfully.');
    } catch (submitError: any) {
      Alert.alert('Error', submitError?.message || 'Failed to submit download');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async (job: MediaJob) => {
    try {
      await apiService.retryDownload(job.id);
      refetch();
    } catch (retryError: any) {
      Alert.alert('Error', retryError?.message || 'Failed to retry download');
    }
  };

  const handleDelete = (job: MediaJob) => {
    Alert.alert(
      'Delete Item',
      `Delete "${job.filename}" from server history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteJob(job.id);
              refetch();
            } catch (deleteError: any) {
              Alert.alert('Error', deleteError?.message || 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const handlePlay = (job: MediaJob) => {
    router.push(`/player/${job.id}`);
  };

  const handleOpenVlc = async (job: MediaJob) => {
    const vlcUrl = apiService.getVlcUrl(job.relative_path || job.safe_filename);
    const canOpen = await Linking.canOpenURL(vlcUrl);

    if (canOpen) {
      await Linking.openURL(vlcUrl);
      return;
    }

    Alert.alert(
      'VLC Not Available',
      'VLC is not installed or did not accept the stream URL.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share Link', onPress: () => handleShare(job) },
      ]
    );
  };

  const handleShare = async (job: MediaJob) => {
    const mediaUrl = apiService.getExternalMediaUrl(job.relative_path || job.safe_filename);
    try {
      await Share.share({
        message: `${job.filename}\n${mediaUrl}`,
        url: mediaUrl,
      });
    } catch {
      Alert.alert('Error', 'Failed to share link');
    }
  };

  const handleDownloadLocal = async (job: MediaJob) => {
    if (!authToken) {
      Alert.alert('Not authenticated', 'Please log in again.');
      return;
    }
    if (downloadingLocalId) return;

    setDownloadingLocalId(job.id);
    try {
      const existing = await storageService.getLocalMedia(job.id);
      if (existing) {
        Alert.alert('Already Downloaded', 'This media is already saved on your device.');
        return;
      }

      const headers = apiService.getMediaRequestHeaders();
      const remoteUrl = apiService.getAuthenticatedMediaUrl(job.relative_path || job.safe_filename);
      const localPath = await downloadService.downloadMedia(
        job.id,
        remoteUrl,
        job.safe_filename || `${job.id}.mp4`,
        headers
      );

      await storageService.saveLocalMedia({
        id: `local_${job.id}`,
        media_id: job.id,
        title: job.filename || 'Untitled',
        local_path: localPath,
        remote_url: remoteUrl,
        kind: job.is_audio ? 'audio' : 'video',
        mime_type: job.mime_type,
        file_size: job.file_size,
        downloaded_at: new Date().toISOString(),
        play_count: 0,
      });

      Alert.alert('Downloaded', 'Saved to device for offline playback.');
    } catch (downloadError: any) {
      Alert.alert('Error', downloadError?.message || 'Failed to download file locally');
    } finally {
      setDownloadingLocalId(null);
    }
  };

  if (isLoading) {
    return <Loading message="Loading dashboard..." />;
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
        <View style={styles.topBar}>
          <Text style={styles.brand}>Media Drop</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logout}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <Text style={[styles.navItem, styles.navItemActive]}>Dashboard</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/downloads')}>
            <Text style={styles.navItem}>File Browser</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
            <Text style={styles.navItem}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Submit Media URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Enter media URL (http/https)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={customFilename}
            onChangeText={setCustomFilename}
            placeholder="Custom filename (optional)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.submitRow}>
            <TouchableOpacity style={styles.checkboxRow} onPress={() => setIsAudioOnly((prev) => !prev)}>
              <Ionicons
                name={isAudioOnly ? 'checkbox' : 'square-outline'}
                size={20}
                color={isAudioOnly ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.checkboxText}>Audio only</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.downloadButton, (isSubmitting || !url.trim()) && styles.buttonDisabled]}
              onPress={handleSubmitDownload}
              disabled={isSubmitting || !url.trim()}
            >
              <Text style={styles.downloadButtonText}>{isSubmitting ? 'Submitting...' : 'Download'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Downloads</Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {activeDownloads.length === 0 ? (
          <Text style={styles.emptyText}>No active downloads</Text>
        ) : (
          activeDownloads.map((job) => {
            const progress = Math.max(0, Math.min(100, Math.round(job.progress_percent || 0)));
            return (
              <View key={job.id} style={styles.activeCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {job.filename || 'Untitled'}
                  </Text>
                  <Text style={[styles.statusPill, { color: statusTone(job.status), borderColor: statusTone(job.status) }]}>
                    {job.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.metaText}>{formatFileSize(job.file_size)}</Text>
                  <Text style={styles.metaText}>{progress}%</Text>
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.sectionTitle}>Recent History</Text>

        {recentHistory.length === 0 ? (
          <Text style={styles.emptyText}>No history yet</Text>
        ) : (
          recentHistory.map((job) => (
            <View key={`history-${job.id}`} style={styles.historyCard}>
              <Text style={styles.historyTitle} numberOfLines={2}>
                {job.filename || 'Untitled'}
              </Text>
              <Text style={styles.historyMeta} numberOfLines={1}>
                {job.source_domain || 'Unknown source'} | {formatDateTime(job.updated_at || job.created_at)}
              </Text>

              {job.error_message ? (
                <Text style={styles.errorMessage} numberOfLines={2}>
                  {job.error_message}
                </Text>
              ) : null}

              <View style={styles.historyActions}>
                <Text
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusTone(job.status), opacity: 0.2, color: statusTone(job.status) },
                  ]}
                >
                  {job.status.toUpperCase()}
                </Text>

                {job.status === 'completed' ? (
                  <>
                    <TouchableOpacity style={styles.tagButton} onPress={() => handlePlay(job)}>
                      <Text style={styles.tagButtonText}>FinchWire</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.actionButton, styles.playButton]} onPress={() => handlePlay(job)}>
                      <Ionicons name="play" size={16} color={colors.buttonText} />
                      <Text style={styles.actionButtonText}>Play</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.actionButton, styles.vlcButton]} onPress={() => handleOpenVlc(job)}>
                      <Ionicons name="tv" size={16} color={colors.buttonText} />
                      <Text style={styles.actionButtonText}>VLC</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => handleDownloadLocal(job)}
                      disabled={downloadingLocalId === job.id}
                    >
                      <Ionicons
                        name={downloadingLocalId === job.id ? 'hourglass' : 'download-outline'}
                        size={18}
                        color={colors.text}
                      />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={[styles.actionButton, styles.retryButton]} onPress={() => handleRetry(job)}>
                    <Ionicons name="refresh" size={16} color={colors.buttonText} />
                    <Text style={styles.actionButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(job)}>
                  <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          ))
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
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  brand: {
    ...typography.h2,
    color: colors.primary,
    fontSize: 34,
    fontWeight: '700',
  },
  logout: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
  },
  navItem: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  navItemActive: {
    color: colors.primary,
  },
  panel: {
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  panelTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    fontSize: 16,
  },
  submitRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  checkboxText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  downloadButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
  },
  downloadButtonText: {
    ...typography.body,
    color: colors.buttonText,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  refreshText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  activeCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemTitle: {
    ...typography.body,
    flex: 1,
    fontWeight: '600',
  },
  statusPill: {
    ...typography.caption,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    marginVertical: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  historyCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: 3,
  },
  historyMeta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  errorMessage: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  historyActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    ...typography.caption,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    fontWeight: '700',
    overflow: 'hidden',
  },
  tagButton: {
    backgroundColor: '#2563EB',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  tagButtonText: {
    ...typography.caption,
    color: colors.buttonText,
    fontWeight: '700',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  playButton: {
    backgroundColor: colors.primary,
  },
  vlcButton: {
    backgroundColor: '#F97316',
  },
  retryButton: {
    backgroundColor: colors.info,
  },
  actionButtonText: {
    ...typography.bodySmall,
    color: colors.buttonText,
    fontWeight: '700',
  },
  iconButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

