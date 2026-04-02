// Player Screen - Video/Audio Playback
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { isPictureInPictureSupported, useVideoPlayer, VideoView } from 'expo-video';
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
  const videoViewRef = useRef<VideoView>(null);
  const { authToken } = useAuthStore();
  
  const [media, setMedia] = useState<MediaJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [isUpdatingKeep, setIsUpdatingKeep] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const mediaHeaders = useMemo(() => {
    if (!media || localPath || !authToken) {
      return undefined;
    }
    return apiService.getMediaRequestHeaders();
  }, [authToken, localPath, media]);

  const playbackUrl = media
    ? localPath || apiService.getAuthenticatedMediaUrl(media.relative_path || media.safe_filename)
    : null;

  const videoSource = useMemo(() => {
    if (!playbackUrl) {
      return null;
    }
    if (mediaHeaders) {
      return {
        uri: playbackUrl,
        headers: mediaHeaders,
      };
    }
    return {
      uri: playbackUrl,
    };
  }, [mediaHeaders, playbackUrl]);

  const player = useVideoPlayer(videoSource, (createdPlayer) => {
    createdPlayer.timeUpdateEventInterval = 0.25;
    createdPlayer.staysActiveInBackground = true;
  });

  const loadMedia = useCallback(async () => {
    let resolvedMedia: MediaJob | null = null;

    try {
      const mediaList = await apiService.getMediaList();
      const item = mediaList.find((m) => m.id === id);
      
      if (item) {
        resolvedMedia = item;
        setMedia(item);

        // Local metadata lookup should never block playback.
        try {
          const localMedia = await storageService.getLocalMedia(item.id);
          if (localMedia) {
            setLocalPath(localMedia.local_path);
          }
        } catch (storageError) {
          console.warn('Failed to load local media metadata:', storageError);
        }
      }
    } catch {
      if (!resolvedMedia) {
        Alert.alert('Error', 'Failed to load media');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMedia();
    setupAudio();
    setIsPiPSupported(isPictureInPictureSupported());
    
    return () => {
      // Cleanup audio session
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    };
  }, [id, loadMedia]);

  useEffect(() => {
    setIsPlaying(player.playing);
    setPosition(player.currentTime * 1000);
    setDuration(player.duration * 1000);

    const playingSubscription = player.addListener('playingChange', ({ isPlaying: nextIsPlaying }) => {
      setIsPlaying(nextIsPlaying);
    });

    const sourceLoadSubscription = player.addListener('sourceLoad', ({ duration: sourceDuration }) => {
      setDuration(sourceDuration * 1000);
    });

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && player.duration > 0) {
        setDuration(player.duration * 1000);
      }
    });

    const timeUpdateSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!isScrubbing) {
        setPosition(currentTime * 1000);
      }

      // Some sources publish duration late; keep duration in sync when it becomes available.
      if (player.duration > 0) {
        setDuration((prevDuration) => {
          const nextDuration = player.duration * 1000;
          return Math.abs(prevDuration - nextDuration) > 250 ? nextDuration : prevDuration;
        });
      }
    });

    return () => {
      playingSubscription.remove();
      sourceLoadSubscription.remove();
      statusSubscription.remove();
      timeUpdateSubscription.remove();
    };
  }, [isScrubbing, player]);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  };

  const togglePlayPause = async () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekToPosition = useCallback(
    (millis: number) => {
      const clampedPosition = Math.max(0, Math.min(millis, duration > 0 ? duration : millis));
      player.currentTime = clampedPosition / 1000;
      setPosition(clampedPosition);
    },
    [duration, player]
  );

  const handleSeekBySeconds = useCallback(
    (seconds: number) => {
      const nextPosition = position + seconds * 1000;
      seekToPosition(nextPosition);
    },
    [position, seekToPosition]
  );

  const handleScrubComplete = useCallback(
    (nextPosition: number) => {
      setIsScrubbing(false);
      setScrubPosition(null);
      seekToPosition(nextPosition);
    },
    [seekToPosition]
  );

  const handlePictureInPicture = useCallback(async () => {
    if (!isPiPSupported || !videoViewRef.current) {
      Alert.alert('Picture in Picture', 'PiP is not supported on this device.');
      return;
    }

    try {
      await videoViewRef.current.startPictureInPicture();
    } catch {
      Alert.alert(
        'Picture in Picture unavailable',
        'PiP is not available in this build yet. Install the updated APK after build completes.'
      );
    }
  }, [isPiPSupported]);

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
    } catch {
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

  const handleToggleKeepDownload = async () => {
    if (!media || isUpdatingKeep) return;

    const currentlyKept = media.keep_forever === true || media.keep_forever === 1;
    const nextKept = !currentlyKept;

    setIsUpdatingKeep(true);
    try {
      await apiService.setKeepDownload(media.id, nextKept);
      setMedia((prev) => (prev ? { ...prev, keep_forever: nextKept ? 1 : 0 } : prev));
      Alert.alert(
        nextKept ? 'Keep Download Enabled' : 'Auto-Delete Enabled',
        nextKept
          ? 'This media will be excluded from 30-day auto-delete.'
          : 'This media can be auto-deleted after 30 days based on retention rules.'
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update keep setting');
    } finally {
      setIsUpdatingKeep(false);
    }
  };

  const handleDeleteFromServer = () => {
    if (!media || isDeleting) return;

    Alert.alert(
      'Delete from Server?',
      'This will permanently remove the media file from your server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!media) return;
            setIsDeleting(true);
            try {
              await apiService.deleteJob(media.id);

              const localMedia = await storageService.getLocalMedia(media.id);
              if (localMedia) {
                await storageService.deleteLocalMedia(localMedia.id);
              }

              Alert.alert('Deleted', 'Media deleted from server.');
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to delete media');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
  const displayPosition = isScrubbing && scrubPosition !== null ? scrubPosition : position;
  const isKeptDownload = media.keep_forever === true || media.keep_forever === 1;

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
            <VideoView
              ref={videoViewRef}
              player={player}
              nativeControls={false}
              style={styles.hiddenAudioPlayer}
            />
          </View>
        ) : (
          <VideoView
            ref={videoViewRef}
            player={player}
            style={styles.videoPlayer}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={isPiPSupported}
            startsPictureInPictureAutomatically={isPiPSupported}
            onPictureInPictureStart={() => setIsPiPActive(true)}
            onPictureInPictureStop={() => setIsPiPActive(false)}
          />
        )}

        {/* Playback Controls */}
        <View style={styles.playbackContainer}>
          <View style={styles.transportRow}>
            <TouchableOpacity
              style={styles.transportButton}
              onPress={() => handleSeekBySeconds(-10)}
              disabled={duration <= 0}
            >
              <Ionicons name="play-back" size={24} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={colors.buttonText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.transportButton}
              onPress={() => handleSeekBySeconds(10)}
              disabled={duration <= 0}
            >
              <Ionicons name="play-forward" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Slider
            style={styles.scrubber}
            minimumValue={0}
            maximumValue={Math.max(duration, 1)}
            value={displayPosition}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
            onSlidingStart={() => setIsScrubbing(true)}
            onValueChange={(value) => setScrubPosition(value)}
            onSlidingComplete={handleScrubComplete}
            disabled={duration <= 0}
          />

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

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

          {/* Keep / Unkeep for retention */}
          <TouchableOpacity
            style={styles.actionButtonSecondary}
            onPress={handleToggleKeepDownload}
            disabled={isUpdatingKeep}
          >
            <Ionicons
              name={isKeptDownload ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={colors.text}
            />
            <Text style={styles.actionButtonTextSecondary}>
              {isUpdatingKeep
                ? 'Updating...'
                : isKeptDownload
                  ? 'Allow Auto-Delete'
                  : 'Keep Download'}
            </Text>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity
            style={styles.actionButtonDanger}
            onPress={handleDeleteFromServer}
            disabled={isDeleting}
          >
            <Ionicons name="trash-outline" size={24} color={colors.error} />
            <Text style={styles.actionButtonTextDanger}>
              {isDeleting ? 'Deleting...' : 'Delete from Server'}
            </Text>
          </TouchableOpacity>

          {!media.is_audio && (
            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={handlePictureInPicture}
              disabled={!isPiPSupported}
            >
              <Ionicons
                name={isPiPActive ? 'contract-outline' : 'albums-outline'}
                size={24}
                color={isPiPSupported ? colors.text : colors.textTertiary}
              />
              <Text
                style={[
                  styles.actionButtonTextSecondary,
                  !isPiPSupported && { color: colors.textTertiary },
                ]}
              >
                {isPiPActive ? 'Exit Picture in Picture' : 'Picture in Picture'}
              </Text>
            </TouchableOpacity>
          )}
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
  hiddenAudioPlayer: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  audioPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playbackContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  transportRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  transportButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrubber: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  actionButtonDanger: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
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
  actionButtonTextDanger: {
    ...typography.body,
    fontWeight: '600',
    color: colors.error,
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
