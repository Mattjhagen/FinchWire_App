// Media Card Component - YouTube style
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../utils/theme';
import { MediaJob } from '../types';

interface MediaCardProps {
  media: MediaJob;
  onPress: () => void;
  onLongPress?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ media, onPress, onLongPress }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return colors.success;
      case 'downloading': return colors.info;
      case 'queued': return colors.warning;
      case 'failed': return colors.error;
      default: return colors.textTertiary;
    }
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'downloading': return 'cloud-download';
      case 'queued': return 'time';
      case 'failed': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {media.is_audio ? (
          <View style={[styles.thumbnail, styles.audioThumbnail]}>
            <Ionicons name="musical-notes" size={48} color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.thumbnail, styles.videoThumbnail]}>
            <Ionicons name="play-circle" size={48} color={colors.primary} />
          </View>
        )}
        
        {/* Status badge */}
        {media.status === 'downloading' && (
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>{Math.round(media.progress_percent)}%</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <View style={styles.titleRow}>
          <Ionicons 
            name={media.is_audio ? 'musical-notes' : 'videocam'} 
            size={16} 
            color={colors.textSecondary} 
            style={styles.typeIcon}
          />
          <Text style={styles.title} numberOfLines={2}>
            {media.filename || 'Untitled'}
          </Text>
        </View>
        
        <View style={styles.metaRow}>
          <Ionicons 
            name={getStatusIcon(media.status)} 
            size={14} 
            color={getStatusColor(media.status)} 
          />
          <Text style={[styles.status, { color: getStatusColor(media.status) }]}>
            {media.status.charAt(0).toUpperCase() + media.status.slice(1)}
          </Text>
          
          {media.file_size > 0 && (
            <>
              <Text style={styles.separator}>•</Text>
              <Text style={styles.fileSize}>{formatFileSize(media.file_size)}</Text>
            </>
          )}
        </View>

        {media.source_domain && (
          <Text style={styles.source} numberOfLines={1}>
            {media.source_domain}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoThumbnail: {
    backgroundColor: '#1a1a1a',
  },
  audioThumbnail: {
    backgroundColor: '#1a1a1a',
  },
  progressBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  progressText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  infoContainer: {
    padding: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  typeIcon: {
    marginRight: spacing.xs,
    marginTop: 2,
  },
  title: {
    ...typography.body,
    flex: 1,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  status: {
    ...typography.bodySmall,
    marginLeft: 4,
    fontWeight: '500',
  },
  separator: {
    ...typography.bodySmall,
    marginHorizontal: spacing.sm,
  },
  fileSize: {
    ...typography.bodySmall,
  },
  source: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
