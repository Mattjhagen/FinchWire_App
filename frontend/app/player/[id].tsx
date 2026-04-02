// Player Screen - Video/Audio Playback
import React, { useState, useEffect, useRef } from 'react';
import {
  useWindowDimensions,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, AVPlaybackStatus, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { downloadService } from '../../src/services/download';
import { storageService } from '../../src/services/storage';
import { useAuthStore } from '../../src/store/authStore';
import { Loading } from '../../src/components/Loading';
import { MediaJob } from '../../src/types';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const videoRef = useRef<Video>(null);
  const { authToken } = useAuthStore();
  
  const [media, setMedia] = useState<MediaJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localPath, setLocalPath] = useState<string | null>(null);

  useEffect(() => {
    loadMedia();
    setupAudio();
    
    return () => {
      // Cleanup audio session
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    };
  }, [id]);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  };

  const loadMedia = async () => {
    try {
      const mediaList = await apiService.getMediaList();
      const item = mediaList.find((m) => m.id === id);
      
      if (item) {
        setMedia(item);
        
        // Check if downloaded locally
        const localMedia = await storageService.getLocalMedia(item.id);
        if (localMedia) {
          setLocalPath(localMedia.local_path);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load media');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      setPosition(status.positionMillis);
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }
    }
  };

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  const handleDownload = async () => {
    if (!media || !authToken) return;

    setIsDownloading(true);
    try {
      const mediaHeaders = apiService.getMediaRequestHeaders();
      const mediaUrl = apiService.getAuthenticatedMediaUrl(
        media.relative_path || media.safe_filename
      );

      const localUri = await downloadService.downloadMedia(
        media.id,
        mediaUrl,
        media.safe_filename,
        mediaHeaders,
        (progress) => setDownloadProgress(progress)
      );

      // Save to local database
      await storageService.saveLocalMedia({
        id: `local_${media.id}`,
        media_id: media.id,
        title: media.filename,
        local_path: localUri,
        remote_url: mediaUrl,
        kind: media.is_audio ? 'audio' : 'video',
        mime_type: media.mime_type,
        file_size: media.file_size,
        downloaded_at: new Date().toISOString(),
        play_count: 0,
      });

      setLocalPath(localUri);
      Alert.alert('Success', 'Downloaded successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to download media');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleOpenInVLC = async () => {
    if (!media) return;

    const vlcUrl = apiService.getVlcUrl(media.relative_path || media.safe_filename);
    
    const canOpen = await Linking.canOpenURL(vlcUrl);
    if (canOpen) {
      await Linking.openURL(vlcUrl);
    } else {
      Alert.alert(
        'VLC Not Found',
        'VLC player is not installed. Would you like to share the link instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Share', onPress: handleShare },
        ]
      );
    }
  };

  const handleShare = async () => {
    if (!media) return;

    const mediaUrl = apiService.getMediaUrl(media.relative_path || media.safe_filename);
    try {
      await Share.share({
        message: `Watch ${media.filename}: ${mediaUrl}`,
        url: mediaUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (isLoading) {
    return <Loading message="Loading media..." />;
  }

  if (!media) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Media not found</Text>
      </View>
    );
  }

  const playbackUrl = localPath || apiService.getAuthenticatedMediaUrl(
    media.relative_path || media.safe_filename
  );
  const mediaHeaders = authToken ? apiService.getMediaRequestHeaders() : undefined;

  return (
    <View style={styles.container}>
      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={32} color={colors.text} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Player */}
        {media.is_audio ? (
          <View style={styles.audioPlayer}>
            <Ionicons name="musical-notes" size={120} color={colors.primary} />
            <Video
              ref={videoRef}
              source={{ 
                uri: playbackUrl,
                headers: mediaHeaders
              }}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              shouldPlay={false}
              style={{ height: 0 }}
            />
          </View>
        ) : (
          <Video
            ref={videoRef}
            source={{ 
              uri: playbackUrl,
              headers: mediaHeaders
            }}
            style={styles.videoPlayer}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            shouldPlay={false}
          />
        )}

        {/* Media Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title}>{media.filename}</Text>
          
          <View style={styles.metaRow}>
            <Ionicons 
              name={media.is_audio ? 'musical-notes' : 'videocam'} 
              size={16} 
              color={colors.textSecondary} 
            />
            <Text style={styles.metaText}>
              {media.is_audio ? 'Audio' : 'Video'}
            </Text>
            {media.file_size > 0 && (
              <>
                <Text style={styles.separator}>•</Text>
                <Text style={styles.metaText}>{formatFileSize(media.file_size)}</Text>
              </>
            )}
          </View>

          {media.source_domain && (
            <Text style={styles.source}>From: {media.source_domain}</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {/* Download Button */}
          {!localPath && (
            <TouchableOpacity
              style={[styles.actionButton, isDownloading && styles.actionButtonDisabled]}
              onPress={handleDownload}
              disabled={isDownloading}
            >
              <Ionicons name="download-outline" size={24} color={colors.buttonText} />
              <Text style={styles.actionButtonText}>
                {isDownloading ? `${Math.round(downloadProgress)}%` : 'Download'}
              </Text>
            </TouchableOpacity>
          )}

          {localPath && (
            <View style={styles.downloadedBadge}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={[styles.actionButtonText, { color: colors.success }]}>
                Downloaded
              </Text>
            </View>
          )}

          {/* Open in VLC */}
          <TouchableOpacity style={styles.actionButtonSecondary} onPress={handleOpenInVLC}>
            <Ionicons name="play-circle-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonTextSecondary}>Open in VLC</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.actionButtonSecondary} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonTextSecondary}>Share</Text>
          </TouchableOpacity>
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
  closeButton: {
    position: 'absolute',
    top: 50,
    right: spacing.md,
    zIndex: 10,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    padding: spacing.sm,
  },
  scrollContent: {
    paddingTop: 40,
  },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  audioPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metaText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  separator: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },
  source: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actionsContainer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
    marginLeft: spacing.sm,
  },
  actionButtonTextSecondary: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  downloadedBadge: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.success,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
