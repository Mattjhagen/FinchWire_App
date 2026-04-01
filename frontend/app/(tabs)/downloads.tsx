// Downloads Screen - Local Downloaded Media
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { storageService } from '../../src/services/storage';
import { downloadService } from '../../src/services/download';
import { EmptyState } from '../../src/components/EmptyState';
import { Loading } from '../../src/components/Loading';
import { LocalMedia } from '../../src/types';

export default function DownloadsScreen() {
  const { data: downloads, isLoading, refetch } = useQuery({
    queryKey: ['downloads'],
    queryFn: () => storageService.getAllLocalMedia(),
  });

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

  const handleDelete = (item: LocalMedia) => {
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
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete file');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <Loading message="Loading downloads..." />;
  }

  if (!downloads || downloads.length === 0) {
    return (
      <EmptyState
        icon="cloud-download-outline"
        title="No Downloads"
        message="Downloaded media will appear here for offline viewing"
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {downloads.length} {downloads.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <FlatList
        data={downloads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemContainer}>
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

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={24} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  listContent: {
    padding: spacing.md,
  },
  itemContainer: {
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
});
