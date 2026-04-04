// Player Screen - Video/Audio Playback
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { isPictureInPictureSupported, useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { downloadService } from '../../src/services/download';
import { personalizationService } from '../../src/services/personalization';
import { storageService } from '../../src/services/storage';
import { useAuthStore } from '../../src/store/authStore';
import { Loading } from '../../src/components/Loading';
import { MediaJob } from '../../src/types';

const PLAYER_POSITION_KEY = '@finchwire_player_positions_v1';
const PLAYER_PREFS_KEY = '@finchwire_player_prefs_v1';
const decodeParam = (value?: string | string[]): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
};
const toSharedMediaTitle = (url: string, fallback?: string): string => {
  const fallbackTitle = fallback?.trim();
  if (fallbackTitle) return fallbackTitle;

  try {
    const parsed = new URL(url);
    const fileName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'Shared media');
    return fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim() || 'Shared media';
  } catch {
    return 'Shared media';
  }
};
const toSharedMediaDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'shared';
  }
};
const looksLikeUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(String(value || '').trim());

export default function PlayerScreen() {
  const { id, url: sharedUrlParam, title: sharedTitleParam } = useLocalSearchParams<{
    id: string;
    url?: string;
    title?: string;
  }>();
  const router = useRouter();
  const videoViewRef = useRef<VideoView>(null);
  const { authToken } = useAuthStore();
  const sharedPlaybackUrl = decodeParam(sharedUrlParam);
  const sharedTitle = decodeParam(sharedTitleParam);
  const isSharedExternal = id === 'shared' && !!sharedPlaybackUrl;
  
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
  const [isLaunchingExternalPlayer, setIsLaunchingExternalPlayer] = useState(false);
  const [isUpdatingKeep, setIsUpdatingKeep] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [playlist, setPlaylist] = useState<MediaJob[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(false);

  const hasAppliedResumeRef = useRef(false);
  const endedHandledRef = useRef(false);
  const lastSavedPositionRef = useRef(0);
  const leftTapAtRef = useRef(0);
  const rightTapAtRef = useRef(0);

  const mediaHeaders = useMemo(() => {
    if (!media || localPath || !authToken || isSharedExternal) {
      return undefined;
    }
    return apiService.getMediaRequestHeaders();
  }, [authToken, isSharedExternal, localPath, media]);

  const mediaPath = useMemo(() => {
    if (!media) return '';
    return media.relative_path || media.safe_filename || media.media_url || '';
  }, [media]);

  const playbackUrl = isSharedExternal
    ? sharedPlaybackUrl
    : media
      ? localPath || apiService.getAuthenticatedMediaUrl(mediaPath)
      : null;

  const videoSource = useMemo(() => {
    const source: any = {
      uri: playbackUrl,
    };
    if (mediaHeaders) {
      source.headers = mediaHeaders;
    }
    // Check for sidecar subtitles (.vtt) if available on the server
    if (!isSharedExternal && mediaPath) {
      source.subtitles = [{
        uri: apiService.getAuthenticatedMediaUrl(`${mediaPath}.vtt`),
        label: 'English',
        language: 'en',
      }];
    }
    return source;
  }, [isSharedExternal, mediaHeaders, mediaPath, playbackUrl]);

  const player = useVideoPlayer(videoSource, (createdPlayer) => {
    createdPlayer.timeUpdateEventInterval = 0.25;
    createdPlayer.staysActiveInBackground = true;
  });

  // Keep player subtitle visibility state in sync
  useEffect(() => {
    (player as any).showSubtitles = showSubtitles;
  }, [player, showSubtitles]);

  const getSavedPosition = useCallback(async (mediaId: string): Promise<number> => {
    try {
      const raw = await AsyncStorage.getItem(PLAYER_POSITION_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return Number(map?.[mediaId] || 0);
    } catch {
      return 0;
    }
  }, []);

  const savePosition = useCallback(async (mediaId: string, millis: number) => {
    if (!mediaId || !Number.isFinite(millis)) return;
    try {
      const raw = await AsyncStorage.getItem(PLAYER_POSITION_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[mediaId] = Math.max(0, Math.floor(millis));
      await AsyncStorage.setItem(PLAYER_POSITION_KEY, JSON.stringify(map));
    } catch {
      // Best effort only.
    }
  }, []);

  const clearSavedPosition = useCallback(async (mediaId: string) => {
    if (!mediaId) return;
    try {
      const raw = await AsyncStorage.getItem(PLAYER_POSITION_KEY);
      const map = raw ? JSON.parse(raw) : {};
      delete map[mediaId];
      await AsyncStorage.setItem(PLAYER_POSITION_KEY, JSON.stringify(map));
    } catch {
      // Best effort only.
    }
  }, []);

  const loadPlayerPrefs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PLAYER_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.autoplay === 'boolean') setAutoplayEnabled(prefs.autoplay);
      if (typeof prefs.shuffle === 'boolean') setShuffleEnabled(prefs.shuffle);
    } catch {
      // Ignore malformed prefs
    }
  }, []);

  const savePlayerPrefs = useCallback(async (prefs: { autoplay: boolean; shuffle: boolean }) => {
    try {
      await AsyncStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Best effort only.
    }
  }, []);

  const loadMedia = useCallback(async () => {
    if (isSharedExternal && sharedPlaybackUrl) {
      const sharedMedia: MediaJob = {
        id: `shared:${sharedPlaybackUrl}`,
        url: sharedPlaybackUrl,
        original_url: sharedPlaybackUrl,
        status: 'completed',
        progress_percent: 100,
        downloaded_bytes: 0,
        total_bytes: 0,
        filename: toSharedMediaTitle(sharedPlaybackUrl, sharedTitle),
        safe_filename: '',
        relative_path: '',
        absolute_path: '',
        mime_type: '',
        file_size: 0,
        source_domain: toSharedMediaDomain(sharedPlaybackUrl),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_audio: false,
        view_count: 0,
      };

      setPlaylist([]);
      setMedia(sharedMedia);
      setLocalPath(null);
      hasAppliedResumeRef.current = false;
      endedHandledRef.current = false;
      setIsLoading(false);
      return;
    }

    let resolvedMedia: MediaJob | null = null;

    try {
      const mediaList = await apiService.getMediaList();
      const playable = mediaList
        .filter((item) => item.status === 'completed')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setPlaylist(playable);
      const item = mediaList.find((m) => m.id === id);
      
      if (item) {
        resolvedMedia = item;
        setMedia(item);
        hasAppliedResumeRef.current = false;
        endedHandledRef.current = false;

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
  }, [id, isSharedExternal, sharedPlaybackUrl, sharedTitle]);

  useEffect(() => {
    loadMedia();
    setupAudio();
    loadPlayerPrefs();
    setIsPiPSupported(isPictureInPictureSupported());
    
    return () => {
      if (media?.id) {
        savePosition(media.id, position);
      }
    };
  }, [id, loadMedia, loadPlayerPrefs, media?.id, position, savePosition]);

  useEffect(() => {
    if (!media) return;
    personalizationService.recordMediaInteraction(media.filename || 'Untitled', media.source_domain).catch(() => {
      // Non-blocking signal for Discover personalization.
    });
  }, [media]);

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
      if (status === 'error') {
        const alertButtons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
          {
            text: 'Open in VLC',
            onPress: () => {
              void handleOpenInVlc();
            },
          },
        ];

        const originalLink = String(media?.original_url || media?.url || '').trim();
        if (looksLikeUrl(originalLink)) {
          alertButtons.push({
            text: 'Open Source Link',
            onPress: () => {
              void handleOpenOriginalLink();
            },
          });
        }

        alertButtons.push({ text: 'Close', style: 'cancel' });

        Alert.alert(
          'Playback Error',
          'This file could not play in the in-app player. Try VLC for broader codec support, or open the original source link.',
          alertButtons
        );
      }
    });

    const timeUpdateSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const currentMillis = currentTime * 1000;
      if (!isScrubbing) {
        setPosition(currentMillis);
      }

      // Some sources publish duration late; keep duration in sync when it becomes available.
      if (player.duration > 0) {
        setDuration((prevDuration) => {
          const nextDuration = player.duration * 1000;
          return Math.abs(prevDuration - nextDuration) > 250 ? nextDuration : prevDuration;
        });
      }

      if (media?.id && Math.abs(currentMillis - lastSavedPositionRef.current) >= 2000) {
        lastSavedPositionRef.current = currentMillis;
        savePosition(media.id, currentMillis);
      }
    });

    return () => {
      playingSubscription.remove();
      sourceLoadSubscription.remove();
      statusSubscription.remove();
      timeUpdateSubscription.remove();
    };
  }, [handleOpenInVlc, handleOpenOriginalLink, isScrubbing, media?.id, media?.original_url, media?.url, player, savePosition]);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });
  };

  useEffect(() => {
    if (!media?.id || hasAppliedResumeRef.current || duration <= 0) return;

    let cancelled = false;
    (async () => {
      const savedMillis = await getSavedPosition(media.id);
      if (cancelled) return;
      if (savedMillis > 1500 && savedMillis < duration - 1500) {
        player.currentTime = savedMillis / 1000;
        setPosition(savedMillis);
      }
      hasAppliedResumeRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [duration, getSavedPosition, media?.id, player]);

  useEffect(() => {
    savePlayerPrefs({ autoplay: autoplayEnabled, shuffle: shuffleEnabled });
  }, [autoplayEnabled, savePlayerPrefs, shuffleEnabled]);

  const getNextJob = useCallback((): MediaJob | null => {
    if (!media?.id || playlist.length <= 1) return null;
    const currentIndex = playlist.findIndex((item) => item.id === media.id);
    if (currentIndex < 0) return null;

    if (shuffleEnabled) {
      const candidates = playlist.filter((item) => item.id !== media.id);
      if (candidates.length === 0) return null;
      const randomIndex = Math.floor(Math.random() * candidates.length);
      return candidates[randomIndex] || null;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) return null;
    return playlist[nextIndex];
  }, [media?.id, playlist, shuffleEnabled]);

  useEffect(() => {
    if (!media?.id || !autoplayEnabled || endedHandledRef.current) return;
    if (duration <= 0) return;

    const remaining = duration - position;
    const nearEnd = remaining <= 1200 && position > 0;
    if (!nearEnd || isPlaying) return;

    endedHandledRef.current = true;
    clearSavedPosition(media.id);

    const nextJob = getNextJob();
    if (!nextJob) {
      return;
    }

    setTimeout(() => {
      router.replace(`/player/${nextJob.id}`);
    }, 350);
  }, [
    autoplayEnabled,
    clearSavedPosition,
    duration,
    getNextJob,
    isPlaying,
    media?.id,
    position,
    router,
  ]);

  const toggleFullScreen = () => {
    if (videoViewRef.current) {
      videoViewRef.current.enterFullscreen();
    }
  };

  const togglePlayPause = async () => {
    if (isPlaying) {
      player.pause();
    } else {
      endedHandledRef.current = false;
      player.play();
    }
  };

  const seekToPosition = useCallback(
    (millis: number) => {
      const clampedPosition = Math.max(0, Math.min(millis, duration > 0 ? duration : millis));
      endedHandledRef.current = false;
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

  const handleDoubleTapZone = useCallback(
    (direction: 'left' | 'right') => {
      const now = Date.now();
      const tapRef = direction === 'left' ? leftTapAtRef : rightTapAtRef;
      if (now - tapRef.current < 320) {
        // Per your preference: left = +10s, right = -10s
        handleSeekBySeconds(direction === 'left' ? 10 : -10);
        tapRef.current = 0;
        return;
      }
      tapRef.current = now;
    },
    [handleSeekBySeconds]
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
    if (!media) return;
    if (isSharedExternal && !sharedPlaybackUrl) return;

    setIsDownloading(true);
    try {
      const mediaHeaders = isSharedExternal ? undefined : apiService.getMediaRequestHeaders();
      const mediaUrl = isSharedExternal
        ? sharedPlaybackUrl
        : await apiService.getShareMediaUrl(media.id, mediaPath);
      const localName = media.safe_filename
        || media.relative_path
        || (media.filename ? `${media.filename}.mp4` : `${media.id}.mp4`);

      const localUri = await downloadService.downloadMedia(
        media.id,
        mediaUrl,
        localName,
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

  const handleShare = async () => {
    if (!media) return;

    const mediaUrl = isSharedExternal && sharedPlaybackUrl
      ? sharedPlaybackUrl
      : await apiService.getShareMediaUrl(media.id, mediaPath);
    try {
      await Share.share({
        message: `Watch ${media.filename}: ${mediaUrl}`,
        url: mediaUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleOpenOriginalLink = useCallback(async () => {
    const originalLink = String(media?.original_url || media?.url || '').trim();
    if (!looksLikeUrl(originalLink)) {
      Alert.alert('Original link unavailable', 'This item does not have a valid source URL to open.');
      return;
    }

    try {
      await Linking.openURL(originalLink);
    } catch {
      Alert.alert('Unable to open link', 'Please try again.');
    }
  }, [media]);

  const handleOpenInVlc = useCallback(async () => {
    if (!media) return;
    try {
      setIsLaunchingExternalPlayer(true);
      player.pause();
      const vlcUrl = isSharedExternal && sharedPlaybackUrl
        ? `vlc://${sharedPlaybackUrl}`
        : apiService.getVlcUrl(mediaPath);
      const canOpen = await Linking.canOpenURL(vlcUrl);
      if (!canOpen) {
        Alert.alert('VLC not found', 'Install VLC to open this media externally.');
        return;
      }
      await Linking.openURL(vlcUrl);
    } catch {
      Alert.alert('Unable to open VLC', 'Please try again.');
    } finally {
      setTimeout(() => setIsLaunchingExternalPlayer(false), 1500);
    }
  }, [isSharedExternal, media, mediaPath, player, sharedPlaybackUrl]);

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
          <View style={styles.videoWrapper}>
            <VideoView
              ref={videoViewRef}
              player={player}
              style={styles.videoPlayer}
              contentFit="contain"
              nativeControls={false}
              allowsPictureInPicture={isPiPSupported}
              startsPictureInPictureAutomatically={false}
              onPictureInPictureStart={() => setIsPiPActive(true)}
              onPictureInPictureStop={() => setIsPiPActive(false)}
            />
            <View style={styles.gestureOverlay} pointerEvents="box-none">
              <Pressable style={styles.gestureHalf} onPress={() => handleDoubleTapZone('left')} />
              <Pressable style={styles.gestureHalf} onPress={() => handleDoubleTapZone('right')} />
            </View>
          </View>
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

            <TouchableOpacity
              style={[styles.miniActionBtn, showSubtitles && styles.miniActionBtnActive]}
              onPress={() => setShowSubtitles(!showSubtitles)}
            >
              <Ionicons name="settings" size={20} color={showSubtitles ? colors.buttonText : colors.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.miniActionBtn} onPress={toggleFullScreen}>
              <Ionicons name="expand" size={20} color={colors.text} />
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
          {!isSharedExternal && (
            <View style={styles.queueControlsRow}>
              <TouchableOpacity
                style={[styles.toggleChip, autoplayEnabled && styles.toggleChipActive]}
                onPress={() => setAutoplayEnabled((prev) => !prev)}
              >
                <Ionicons
                  name={autoplayEnabled ? 'play-forward-circle' : 'play-forward-circle-outline'}
                  size={18}
                  color={autoplayEnabled ? colors.buttonText : colors.textSecondary}
                />
                <Text style={[styles.toggleChipText, autoplayEnabled && styles.toggleChipTextActive]}>
                  Autoplay Next
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleChip, shuffleEnabled && styles.toggleChipActive]}
                onPress={() => setShuffleEnabled((prev) => !prev)}
              >
                <Ionicons
                  name={shuffleEnabled ? 'shuffle' : 'shuffle-outline'}
                  size={18}
                  color={shuffleEnabled ? colors.buttonText : colors.textSecondary}
                />
                <Text style={[styles.toggleChipText, shuffleEnabled && styles.toggleChipTextActive]}>
                  Shuffle
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
          <TouchableOpacity
            style={[styles.actionButtonSecondary, isLaunchingExternalPlayer && styles.actionButtonDisabled]}
            onPress={handleOpenInVlc}
            disabled={isLaunchingExternalPlayer}
          >
            <Ionicons name="play-circle-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonTextSecondary}>
              {isLaunchingExternalPlayer ? 'Opening VLC...' : 'Open in VLC'}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.actionButtonSecondary} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonTextSecondary}>Share</Text>
          </TouchableOpacity>

          {!isSharedExternal && (
            <>
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
            </>
          )}

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
  videoWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  gestureOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  gestureHalf: {
    flex: 1,
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
  miniActionBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniActionBtnActive: {
    backgroundColor: colors.primary,
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
  queueControlsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  toggleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: colors.buttonText,
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
