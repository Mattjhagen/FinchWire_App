// Downloads Screen - Server Queue + Local Downloaded Media
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { storageService } from '../../src/services/storage';
import { downloadService } from '../../src/services/download';
import { apiService } from '../../src/services/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Loading } from '../../src/components/Loading';
import { LocalMedia, MediaJob } from '../../src/types';

export default function DownloadsScreen() {
  const {
    data: serverJobs,
    isLoading: isServerLoading,
    error: serverError,
    refetch: refetchServer,
    isRefetching: isServerRefetching,
  } = useQuery({
    queryKey: ['downloads-server'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: 3000,
    retry: 1,
  });

  const {
    data: downloads,
    isLoading: isLocalLoading,
    refetch: refetchLocal,
    isRefetching: isLocalRefetching,
  } = useQuery({
    queryKey: ['downloads-local'],
    queryFn: () => storageService.getAllLocalMedia(),
  });

  const trackedServerJobs = useMemo(() => {
    const items = serverJobs ?? [];
    // Downloads tab should track active/failed queue states from the backend.
    return items.filter((job) => ['queued', 'downloading', 'failed'].includes(job.status));
  }, [serverJobs]);

  const isRefreshing = isServerRefetching || isLocalRefetching;

  const handleRefresh = async () => {
    await Promise.all([refetchServer(), refetchLocal()]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: MediaJob['status']): string => {
    switch (status) {
      case 'downloading': return colors.info;
      case 'queued': return colors.warning;
      case 'failed': return colors.error;
      default: return colors.textSecondary;
    }
  };

  const getStatusIcon = (status: MediaJob['status']): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'downloading': return 'cloud-download';
      case 'queued': return 'time';
      case 'failed': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const handleDeleteLocal = (item: LocalMedia) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.deleteLocalFile(item.local_path);
              await storageService.deleteLocalMedia(item.id);
              refetchLocal();
            } catch {
              Alert.alert('Error', 'Failed to delete file');
            }
          },
        },
      ]
    );
  };

  const handleRemoveServerJob = (job: MediaJob) => {
    const actionLabel = job.status === 'downloading' || job.status === 'queued' ? 'Cancel' : 'Remove';

    Alert.alert(
      `${actionLabel} Job`,
      `Are you sure you want to ${actionLabel.toLowerCase()} "${job.filename}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: actionLabel,
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteJob(job.id);
              refetchServer();
            } catch {
              Alert.alert('Error', `Failed to ${actionLabel.toLowerCase()} job`);
            }
          },
        },
      ]
    );
  };

  const handleRetryServerJob = async (job: MediaJob) => {
    try {
      await apiService.retryDownload(job.id);
      refetchServer();
    } catch {
      Alert.alert('Error', 'Failed to retry download');
    }
  };

  if (isServerLoading && isLocalLoading) {
    return <Loading message="Loading downloads..." />;
  }

  const localItems = downloads ?? [];
  const hasServerItems = trackedServerJobs.length > 0;
  const hasLocalItems = localItems.length > 0;

  if (!hasServerItems && !hasLocalItems) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="cloud-download-outline"
          title="No Downloads"
          message="Active server downloads and offline files will appear here"
        />
        {serverError && (
          <Text style={styles.serverErrorText}>
            Could not load server queue: {(serverError as Error).message}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {hasServerItems && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Server Downloads</Text>
            <Text style={styles.sectionSubtitle}>
              {trackedServerJobs.length} {trackedServerJobs.length === 1 ? 'job' : 'jobs'} in queue
            </Text>

            {trackedServerJobs.map((job) => {
              const progress = Math.max(0, Math.min(100, Math.round(job.progress_percent || 0)));

              return (
                <View key={`server-${job.id}`} style={styles.serverItemContainer}>
                  <View style={styles.serverItemHeader}>
                    <View style={styles.serverInfo}>
                      <Text style={styles.serverTitle} numberOfLines={2}>
                        {job.filename || 'Untitled'}
                      </Text>
                      <View style={styles.serverMetaRow}>
                        <Ionicons
                          name={getStatusIcon(job.status)}
                          size={14}
                          color={getStatusColor(job.status)}
                        />
                        <Text style={[styles.serverStatus, { color: getStatusColor(job.status) }]}>
                          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </Text>
                        {job.file_size > 0 && (
                          <>
                            <Text style={styles.separator}>•</Text>
                            <Text style={styles.serverMetaText}>{formatFileSize(job.file_size)}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  {(job.status === 'downloading' || job.status === 'queued') && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.progressPercent}>{progress}%</Text>
                    </View>
                  )}

                  {job.status === 'failed' && job.error_message && (
                    <Text style={styles.errorMessage} numberOfLines={2}>
                      {job.error_message}
                    </Text>
                  )}

                  <View style={styles.serverActionsRow}>
                    {job.status === 'failed' && (
                      <TouchableOpacity
                        style={styles.serverActionButton}
                        onPress={() => handleRetryServerJob(job)}
                      >
                        <Ionicons name="refresh" size={16} color={colors.text} />
                        <Text style={styles.serverActionText}>Retry</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.serverActionButton, styles.serverDangerButton]}
                      onPress={() => handleRemoveServerJob(job)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={[styles.serverActionText, { color: colors.error }]}>
                        {job.status === 'downloading' || job.status === 'queued' ? 'Cancel' : 'Remove'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {hasLocalItems && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Offline Downloads</Text>
            <Text style={styles.sectionSubtitle}>
              {localItems.length} {localItems.length === 1 ? 'item' : 'items'} saved locally
            </Text>

            {localItems.map((item) => (
              <View key={`local-${item.id}`} style={styles.localItemContainer}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={item.kind === 'audio' ? 'musical-notes' : 'videocam'}
                    size={32}
                    color={colors.primary}
                  />
                </View>

                <View style={styles.infoContainer}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{formatFileSize(item.file_size)}</Text>
                    <Text style={styles.separator}>•</Text>
                    <Text style={styles.metaText}>Downloaded {formatDate(item.downloaded_at)}</Text>
                  </View>
                  {item.play_count > 0 && (
                    <Text style={styles.playCount}>
                      Played {item.play_count} {item.play_count === 1 ? 'time' : 'times'}
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteLocal(item)}>
                  <Ionicons name="trash-outline" size={24} color={colors.error} />
                </TouchableOpacity>
              </View>
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
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  serverItemContainer: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  serverItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  serverInfo: {
    flex: 1,
  },
  serverTitle: {
    ...typography.body,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  serverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverStatus: {
    ...typography.bodySmall,
    marginLeft: 4,
    fontWeight: '600',
  },
  serverMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressContainer: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressPercent: {
    ...typography.caption,
    color: colors.textSecondary,
    minWidth: 34,
    textAlign: 'right',
  },
  errorMessage: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
  serverActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  serverActionButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverDangerButton: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  serverActionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  localItemContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  infoContainer: {
    flex: 1,
  },
  title: {
    ...typography.body,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  separator: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },
  playCount: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  deleteButton: {
    padding: spacing.sm,
  },
  serverErrorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
});
