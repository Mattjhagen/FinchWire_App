import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  type AlertButton,
  Linking,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
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
import { personalizationService } from '../../src/services/personalization';
import { useSettingsStore } from '../../src/store/settingsStore';
import { AssetType, LiveStory, MediaJob } from '../../src/types';
import { homeProviders } from '../../src/features/home/providers';
import { HOME_TILE_LABELS, normalizeTilePreferences } from '../../src/features/home/tileRegistry';
import { PRESET_RSS_FEEDS, type RssItem, fetchRssFeed } from '../../src/services/widgets';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { VoiceVisualizer } from '../../src/components/VoiceVisualizer';
import { TypingIndicator } from '../../src/components/TypingIndicator';

const MARKET_CHOICES: { symbol: string; assetType: AssetType; label: string }[] = [
  { symbol: 'BTC', assetType: 'crypto', label: 'BTC' },
  { symbol: 'ETH', assetType: 'crypto', label: 'ETH' },
  { symbol: 'SOL', assetType: 'crypto', label: 'SOL' },
  { symbol: 'TSLA', assetType: 'stock', label: 'TSLA' },
  { symbol: 'NVDA', assetType: 'stock', label: 'NVDA' },
  { symbol: 'SPY', assetType: 'stock', label: 'SPY' },
];

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

const getPlaybackPath = (job: MediaJob): string => {
  return job.relative_path || job.safe_filename || job.media_url || '';
};

const getExternalLink = (job: MediaJob): string => {
  const originalUrl = String(job.original_url || '').trim();
  if (looksLikeUrl(originalUrl)) {
    return originalUrl;
  }

  const submittedUrl = String(job.url || '').trim();
  if (looksLikeUrl(submittedUrl)) {
    return submittedUrl;
  }

  return apiService.getExternalMediaUrl(getPlaybackPath(job));
};

const looksLikeUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());
const looksLikeQuestion = (value: string): boolean => {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(who|what|when|where|why|how|find|show|summarize|explain|tell|compare|give|recommend|analyze)\b/.test(text);
};

const normalizeText = (value: string): string => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const decodeHtmlEntities = (value: string): string => {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

const compactSummary = (summary: string, fallbackTitle?: string): string => {
  const normalized = decodeHtmlEntities(summary)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = normalized || String(fallbackTitle || '').trim();
  if (!base) return 'No summary available.';

  const sentences = base
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const topTwo = sentences.slice(0, 2).join(' ').trim();
  if (topTwo) return topTwo.length > 280 ? `${topTwo.slice(0, 277).trim()}...` : topTwo;

  return base.length > 200 ? `${base.slice(0, 197).trim()}...` : base;
};

const formatPublished = (value?: string): string => {
  if (!value) return 'Just now';
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toLocaleString();
};

const extractCreatorName = (story: LiveStory): string | null => {
  const title = String(story.title || '').trim();
  if (!title) return null;

  // Prefer a front-loaded creator pattern: "Creator - Episode title"
  const dashParts = title.split(/\s[-–—|]\s/);
  if (dashParts.length >= 2) {
    const candidate = dashParts[0]?.trim() || '';
    if (candidate.length >= 3 && candidate.length <= 42) {
      return candidate;
    }
  }

  const source = String(story.source || '').trim();
  if (source.length >= 3 && source.length <= 42) {
    return source;
  }

  return null;
};

const buildReasonText = (
  story: LiveStory,
  followedTopics: string[],
  followedSources: string[],
  followedCreators: string[]
): string => {
  const storyTopics = (story.topics || []).map((item) => normalizeText(item));
  const source = normalizeText(story.source || '');
  const title = normalizeText(story.title || '');
  const followTopic = followedTopics.find((item) => storyTopics.includes(normalizeText(item)));
  const followSource = followedSources.find((item) => source.includes(normalizeText(item)));
  const followCreator = followedCreators.find((item) => title.includes(normalizeText(item)));

  if (followTopic) return `Because you follow ${followTopic}`;
  if (followSource) return `From a source you follow: ${followSource}`;
  if (followCreator) return `Matches creator you follow: ${followCreator}`;
  if (story.reasonCodes?.includes('rapidly_rising')) return 'Trending quickly across sources';
  if (story.reasonCodes?.includes('high_source_diversity')) return 'Multiple trusted outlets are covering this';
  return 'Ranked by your recent interests and engagement';
};

export default function HomeScreen() {
  const router = useRouter();
  const { settings, saveSettings } = useSettingsStore();

  const [expandedTile, setExpandedTile] = useState<string | null>(null);

  const toggleExpand = (tile: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTile(expandedTile === tile ? null : tile);
  };

  const [prompt, setPrompt] = useState('');
  const [feedFilter, setFeedFilter] = useState('');
  const [hiddenStoryIds, setHiddenStoryIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVoiceOverlayVisible, setIsVoiceOverlayVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [metering, setMetering] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const impressionSentRef = useRef<Set<string>>(new Set());

  const homeSettings = useMemo(() => {
    return {
      tickerSymbol: settings?.home_market_symbol || 'BTC',
      tickerAssetType: settings?.home_market_asset_type || 'crypto',
      weatherUnit: settings?.home_weather_unit || 'f',
      tilePrefs: normalizeTilePreferences(settings?.home_tiles),
      followedTopics: settings?.followed_topics || [],
      followedSources: settings?.followed_sources || [],
      followedCreators: settings?.followed_creators || [],
    };
  }, [settings]);

  const {
    data: mediaList,
    error: mediaError,
    refetch: refetchMedia,
    isRefetching: isRefetchingMedia,
  } = useQuery({
    queryKey: ['home-media-list'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    retry: (failureCount, err: any) => {
      if (String(err?.message || '').toLowerCase().includes('too many requests')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const {
    data: feed = [],
    error: feedError,
    refetch: refetchFeed,
    isRefetching: isRefetchingFeed,
  } = useQuery({
    queryKey: ['home-for-you-feed'],
    queryFn: () => apiService.getLiveStories(36),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: weatherSnapshot, error: weatherError, isLoading: isWeatherLoading, refetch: refetchWeather } = useQuery({
    queryKey: ['home-weather', homeSettings.weatherUnit],
    queryFn: () => homeProviders.weather.getCurrentWeather(homeSettings.weatherUnit),
    enabled: homeSettings.tilePrefs.weather,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: marketQuote, error: marketError, isLoading: isMarketLoading, refetch: refetchMarket } = useQuery({
    queryKey: ['home-market', homeSettings.tickerSymbol, homeSettings.tickerAssetType],
    queryFn: () => homeProviders.market.getQuote(homeSettings.tickerSymbol, homeSettings.tickerAssetType),
    enabled: homeSettings.tilePrefs.market,
    staleTime: 90 * 1000,
    retry: 1,
  });

  const { data: verseOfDay, error: verseError, isLoading: isVerseLoading, refetch: refetchVerse } = useQuery({
    queryKey: ['home-verse'],
    queryFn: () => homeProviders.verse.getVerseOfDay(),
    enabled: homeSettings.tilePrefs.verse,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const allRssFeeds = useMemo(() => {
    const custom = settings?.custom_rss_feeds ?? [];
    return [...PRESET_RSS_FEEDS, ...custom];
  }, [settings?.custom_rss_feeds]);

  const { data: rssFeedItems, refetch: refetchRss } = useQuery({
    queryKey: ['widget-rss-feeds', allRssFeeds.map((f) => f.url).join(',')],
    queryFn: async (): Promise<RssItem[]> => {
      const results = await Promise.allSettled(
        allRssFeeds.map((f) => fetchRssFeed(f.url, f.label, 4))
      );
      return results
        .filter((r): r is PromiseFulfilledResult<RssItem[]> => r.status === 'fulfilled')
        .flatMap((r) => r.value)
        .slice(0, 16);
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });

  const completedJobs = useMemo(
    () => (mediaList ?? []).filter((job) => job.status === 'completed').slice(0, 10),
    [mediaList]
  );
  const activeJobs = useMemo(
    () => (mediaList ?? []).filter((job) => job.status === 'queued' || job.status === 'downloading').slice(0, 6),
    [mediaList]
  );

  const personalizedFeed = useMemo(() => {
    const followedTopics = homeSettings.followedTopics.map((item) => normalizeText(item));
    const followedSources = homeSettings.followedSources.map((item) => normalizeText(item));
    const followedCreators = homeSettings.followedCreators.map((item) => normalizeText(item));
    const filter = normalizeText(feedFilter || prompt);

    const scored = feed
      .filter((story) => !hiddenStoryIds.includes(story.id))
      .map((story) => {
        let score = Number(story.hotnessScore || 0) + Number(story.userInterestMatch || 0) * 2.5;
        const topicMatches = (story.topics || []).map((item) => normalizeText(item));
        const source = normalizeText(story.source || '');
        const title = normalizeText(story.title || '');

        if (followedTopics.some((topic) => topicMatches.includes(topic))) score += 18;
        if (followedSources.some((item) => source.includes(item))) score += 14;
        if (followedCreators.some((item) => title.includes(item))) score += 16;

        if (filter) {
          const haystack = normalizeText(`${story.title} ${story.summary || ''} ${story.source} ${(story.topics || []).join(' ')}`);
          if (!haystack.includes(filter)) score -= 20;
          else score += 10;
        }
        return { story, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.map((entry) => entry.story).slice(0, 12);
  }, [feed, feedFilter, hiddenStoryIds, homeSettings.followedCreators, homeSettings.followedSources, homeSettings.followedTopics, prompt]);

  useEffect(() => {
    // Enable background audio mode globally for this screen
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => undefined);

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    personalizedFeed.slice(0, 8).forEach((story) => {
      if (impressionSentRef.current.has(story.id)) return;
      impressionSentRef.current.add(story.id);
      apiService.sendFeedInteraction({
        item_id: story.id,
        item_type: 'story',
        event_type: 'impression',
        title: story.title,
        source: story.source,
        topics: story.topics || [],
        keywords: story.keywords || [],
      }).catch(() => undefined);
    });
  }, [personalizedFeed]);

  const refreshAll = async () => {
    await Promise.all([refetchMedia(), refetchFeed(), refetchWeather(), refetchMarket(), refetchVerse(), refetchRss()]);
  };

  const openExternal = async (url: string, title?: string, source?: string) => {
    router.push({
      pathname: '/article',
      params: {
        url: encodeURIComponent(url),
        title: title ? encodeURIComponent(title) : 'Article',
        source: source ? encodeURIComponent(source) : encodeURIComponent(new URL(url).hostname),
      },
    });
  };

  const persistSettings = async (updater: (current: NonNullable<typeof settings>) => NonNullable<typeof settings>) => {
    if (!settings) return;
    await saveSettings(updater(settings));
  };

  const updateFollowList = async (
    field: 'followed_topics' | 'followed_sources' | 'followed_creators',
    value: string
  ) => {
    const normalized = value.trim();
    if (!normalized) return;
    if (!settings) return;
    const existing = settings[field] || [];
    const alreadyFollowing = existing.some((item) => normalizeText(item) === normalizeText(normalized));
    const next = alreadyFollowing
      ? existing.filter((item) => normalizeText(item) !== normalizeText(normalized))
      : [...existing, normalized];

    await saveSettings({ ...settings, [field]: next });
  };

  const chooseTicker = () => {
    const buttons: AlertButton[] = [
      ...MARKET_CHOICES.map((choice) => ({
        text: choice.label,
        onPress: () => {
          persistSettings((current) => ({
            ...current,
            home_market_symbol: choice.symbol,
            home_market_asset_type: choice.assetType,
          })).catch(() => undefined);
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ];

    Alert.alert(
      'Track asset',
      'Choose which stock or crypto appears in your home tile.',
      buttons
    );
  };

  const toggleTile = async (tile: 'weather' | 'market' | 'verse') => {
    await persistSettings((current) => ({
      ...current,
      home_tiles: {
        ...normalizeTilePreferences(current.home_tiles),
        [tile]: !Boolean(current.home_tiles?.[tile]),
      },
    }));
  };

  const handleQueueUrl = async (url: string) => {
    setIsSubmitting(true);
    try {
      await apiService.submitDownload({ url: url.trim(), is_audio: false });
      Alert.alert('Queued', 'Media request sent to your server queue.');
      setPrompt('');
      await refetchMedia();
    } catch (error: any) {
      Alert.alert('Queue Error', error?.message || 'Failed to queue this URL.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleVoiceInteraction = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Please enable microphone access in your settings.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setIsVoiceOverlayVisible(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!recordingRef.current) return;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        processVoiceCommand(uri);
      } else {
        setIsVoiceOverlayVisible(false);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsVoiceOverlayVisible(false);
    }
  };

  const processVoiceCommand = async (uri: string) => {
    setIsSubmitting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const response = await apiService.runAiSpeechSearch(
        base64,
        Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/amr',
        'Ask AI a question based on your news library.'
      );

      const answer = (response.answer || '').trim();
      if (answer) {
        playTextToSpeech(answer);
        
        const alertButtons: AlertButton[] = [{ text: 'OK', style: 'cancel' }];
        const recommendedQuery = String(response.query || '').trim();
        const suggestedUrl = String(response.suggested_url || '').trim();

        if (suggestedUrl) {
          alertButtons.unshift({
            text: 'Queue Suggested Media',
            onPress: () => handleQueueUrl(suggestedUrl).catch(() => undefined),
          });
        }

        if (recommendedQuery) {
          setFeedFilter(recommendedQuery);
          await refetchFeed();
        }

        Alert.alert(
          `AI (${String(response.provider || 'none').toUpperCase()})`,
          answer,
          alertButtons
        );
      }
    } catch (err) {
      console.error('Voice process failed', err);
      Alert.alert('AI Error', 'Voice processing failed. Please try again.');
    } finally {
      setIsSubmitting(false);
      setIsVoiceOverlayVisible(false);
    }
  };

  const playTextToSpeech = async (text: string) => {
    try {
      setIsSpeaking(true);
      const response = await apiService.runAiTts(text);
      
      if (response.audio_base64) {
        const fileUri = `${FileSystem.cacheDirectory}home_speech.mp3`;
        await FileSystem.writeAsStringAsync(fileUri, response.audio_base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (soundRef.current) await soundRef.current.unloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
        soundRef.current = sound;
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) setIsSpeaking(false);
        });
      }
    } catch (err) {
      console.error('TTS failed', err);
      setIsSpeaking(false);
    }
  };

  const handlePrimaryAction = async () => {
    const value = prompt.trim();
    if (!value) {
      Alert.alert('Enter something', 'Type a topic, creator, or media URL.');
      return;
    }

    if (looksLikeUrl(value)) {
      await handleQueueUrl(value);
      return;
    }

    // Smart Ask behavior: non-URL input defaults to AI (questions + natural language).
    const shouldUseAi = looksLikeQuestion(value) || !looksLikeUrl(value);
    if (!shouldUseAi) {
      await handleQueueUrl(value);
      return;
    }

    if (settings && (settings.ai_provider === 'none' || !settings.has_ai_api_key)) {
      Alert.alert(
        'AI setup needed',
        'Go to Settings → AI + Voice, choose a provider, paste your API key, and tap Save AI/TTS Settings.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const ai = await apiService.runAiSearch(value);
      const recommendedQuery = String(ai.query || value).trim();
      const suggestedQueueInput = String(ai.suggested_url || recommendedQuery).trim();

      personalizationService.recordAiPrompt(`${value} ${recommendedQuery}`.trim()).catch(() => undefined);

      setFeedFilter(recommendedQuery || value);
      await refetchFeed();

      const alertButtons: AlertButton[] = [
        { text: 'OK', style: 'cancel' },
      ];

      if (suggestedQueueInput) {
        alertButtons.unshift({
          text: 'Queue Suggested Media',
          onPress: () => {
            handleQueueUrl(suggestedQueueInput).catch(() => undefined);
          },
        });
      }

      Alert.alert(
        `AI (${String(ai.provider || 'none').toUpperCase()})`,
        `${String(ai.answer || 'Done.').trim()}\n\nSearch query: ${recommendedQuery || value}`,
        alertButtons
      );
    } catch (error: any) {
      const message = String(error?.message || 'AI request failed.');
      Alert.alert(
        'AI request failed',
        `${message}\n\nIf needed, re-open Settings → AI + Voice and confirm provider + API key are saved.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendStoryEvent = (story: LiveStory, eventType: 'click' | 'save' | 'hide') => {
    apiService.sendFeedInteraction({
      item_id: story.id,
      item_type: 'story',
      event_type: eventType,
      title: story.title,
      source: story.source,
      topics: story.topics || [],
      creators: [],
      keywords: story.keywords || [],
      occurred_at: new Date().toISOString(),
    }).catch(() => undefined);
  };

  const openStory = (story: LiveStory) => {
    sendStoryEvent(story, 'click');
    router.push({
      pathname: '/article',
      params: {
        url: encodeURIComponent(story.url),
        title: encodeURIComponent(story.title),
        source: encodeURIComponent(story.source),
        storyId: story.id,
        topics: encodeURIComponent(JSON.stringify(story.topics || [])),
        keywords: encodeURIComponent(JSON.stringify(story.keywords || [])),
      },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingMedia || isRefetchingFeed}
            onRefresh={refreshAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headerRow}>
          <Ionicons name="pulse-outline" size={24} color={colors.primaryLight} />
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarText}>FW</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.brand}>FinchWire</Text>
        <Text style={styles.brandSub}>Personalized signal dashboard for media + news</Text>

        <View style={styles.searchBar}>
          <TouchableOpacity 
            style={styles.micButton} 
            onPress={toggleVoiceInteraction}
            disabled={isSubmitting}
          >
            <Ionicons name="mic" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Smart Ask: question or media URL..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handlePrimaryAction}
          />
          <TouchableOpacity onPress={handlePrimaryAction} disabled={isSubmitting}>
            <Ionicons name="arrow-up-circle" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.modeHint}>
          Smart Ask auto-detects your intent: URLs are queued for download, everything else is handled by AI.
        </Text>

        <SectionTitle
          title="Smart Tiles"
          rightAction={
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
              <Text style={styles.sectionLink}>Configure</Text>
            </TouchableOpacity>
          }
        />
        <View style={styles.tileGrid}>
          {homeSettings.tilePrefs.order.map((tileType) => {
            if (!homeSettings.tilePrefs[tileType]) return null;
            const isExpanded = expandedTile === tileType;
            
            if (tileType === 'weather') {
              return (
                <TouchableOpacity 
                  key={tileType} 
                  style={[styles.tileCard, isExpanded && styles.tileCardExpanded]}
                  onPress={() => toggleExpand('weather')}
                  activeOpacity={0.9}
                >
                  <TileHeader title={HOME_TILE_LABELS.weather} icon="partly-sunny-outline" onToggle={() => toggleTile('weather')} />
                  {isWeatherLoading ? <TileLoading /> : null}
                  {!isWeatherLoading && weatherError ? (
                    <Text style={styles.tileError}>Weather unavailable</Text>
                  ) : null}
                  {!isWeatherLoading && !weatherError && weatherSnapshot ? (
                    <>
                      <Text style={styles.tilePrimary}>
                        {homeSettings.weatherUnit === 'f'
                          ? `${Math.round(Number(weatherSnapshot.temperatureF || 0))}°F`
                          : `${Math.round(Number(weatherSnapshot.temperatureC || 0))}°C`}
                      </Text>
                      <Text style={styles.tileSecondary}>
                        {weatherSnapshot.condition || 'Unknown'} • {weatherSnapshot.locationLabel || 'Local'}
                      </Text>
                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          <Text style={styles.expandedText}>
                            High: {homeSettings.weatherUnit === 'f' ? `${Math.round(Number(weatherSnapshot.highF || 0))}°F` : `${Math.round(Number(weatherSnapshot.highC || 0))}°C`}
                          </Text>
                          <Text style={styles.expandedText}>
                            Low: {homeSettings.weatherUnit === 'f' ? `${Math.round(Number(weatherSnapshot.lowF || 0))}°F` : `${Math.round(Number(weatherSnapshot.lowC || 0))}°C`}
                          </Text>
                          <Text style={styles.expandedText}>
                            Observed at: {weatherSnapshot.observedAt || 'N/A'}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            }

            if (tileType === 'market') {
              const change = Number(marketQuote?.changePercent24h || 0);
              const isUp = change >= 0;
              return (
                <TouchableOpacity 
                  key={tileType} 
                  style={[styles.tileCard, isExpanded && styles.tileCardExpanded]}
                  onPress={() => toggleExpand('market')}
                  activeOpacity={0.9}
                >
                  <TileHeader title={HOME_TILE_LABELS.market} icon="trending-up-outline" onToggle={() => toggleTile('market')} />
                  {isMarketLoading ? <TileLoading /> : null}
                  {!isMarketLoading && marketError ? (
                    <Text style={styles.tileError}>Market data unavailable</Text>
                  ) : null}
                  {!isMarketLoading && !marketError && marketQuote ? (
                    <>
                      <Text style={styles.tilePrimary}>
                        {marketQuote.symbol} ${Number(marketQuote.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={[styles.tileSecondary, { color: isUp ? colors.success : colors.error }]}>
                        {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                      </Text>
                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          <Text style={styles.expandedText}>Display Name: {marketQuote.displayName}</Text>
                          <Text style={styles.expandedText}>Asset Type: {marketQuote.assetType}</Text>
                          <Text style={styles.expandedText}>Currency: {marketQuote.currency}</Text>
                          <TouchableOpacity style={styles.tileInlineButton} onPress={chooseTicker}>
                            <Text style={styles.tileInlineButtonText}>Change Asset</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity 
                key={tileType} 
                style={[styles.tileCard, isExpanded && styles.tileCardExpanded]}
                onPress={() => toggleExpand('verse')}
                activeOpacity={0.9}
              >
                <TileHeader title={HOME_TILE_LABELS.verse} icon="book-outline" onToggle={() => toggleTile('verse')} />
                {isVerseLoading ? <TileLoading /> : null}
                {!isVerseLoading && verseError ? <Text style={styles.tileError}>Verse unavailable</Text> : null}
                {!isVerseLoading && !verseError && verseOfDay ? (
                  <>
                    <Text style={styles.verseText} numberOfLines={isExpanded ? 15 : 4}>{verseOfDay.text}</Text>
                    <Text style={styles.verseRef}>{verseOfDay.reference}</Text>
                    {isExpanded && (
                      <TouchableOpacity 
                        style={styles.tileInlineButton} 
                        onPress={() => router.push('/devotional')}
                      >
                        <Text style={styles.tileInlineButtonText}>Read Full Devotional</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.settingsShortcuts}>
          <TouchableOpacity
            style={styles.shortcutChip}
            onPress={() =>
              persistSettings((current) => ({
                ...current,
                home_weather_unit: current.home_weather_unit === 'f' ? 'c' : 'f',
              })).catch(() => undefined)
            }
          >
            <Ionicons name="thermometer-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.shortcutText}>
              Unit: °{homeSettings.weatherUnit.toUpperCase()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcutChip} onPress={() => router.push('/devotional')}>
            <Ionicons name="book-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.shortcutText}>Daily Word</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCards}>
          <InfoCard title="Server Queue" value={String(activeJobs.length)} sub="Active downloads" />
          <InfoCard title="Library Size" value={String(completedJobs.length)} sub="Completed media items" />
          <InfoCard title="Needs Attention" value={String((mediaList || []).filter((job) => job.status === 'failed').length)} sub="Failed jobs" />
        </View>

        {mediaError ? (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>Media server warning: {(mediaError as Error).message}</Text>
          </View>
        ) : null}

        {/* ── RSS Headlines ── */}
        {(rssFeedItems ?? []).length > 0 ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle title="RSS Headlines" />
              <TouchableOpacity onPress={() => router.push('/rss-feeds')} style={styles.manageFeedsBtn}>
                <Ionicons name="radio-outline" size={14} color={colors.primary} />
                <Text style={styles.manageFeedsText}>Manage</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardList}>
              {(rssFeedItems ?? []).slice(0, 5).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.newsCard}
                  onPress={() => openExternal(item.link || '', item.title, item.source)}
                >
                  <Text style={styles.newsSource}>{item.source}</Text>
                  <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle
          title="For You"
          rightAction={
            <TouchableOpacity onPress={() => refetchFeed()}>
              <Text style={styles.sectionLink}>Refresh</Text>
            </TouchableOpacity>
          }
        />

        <View style={styles.feedSearch}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={styles.feedSearchInput}
            value={feedFilter}
            onChangeText={setFeedFilter}
            placeholder="Filter your personalized feed..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.followRow}>
          {homeSettings.followedTopics.slice(0, 6).map((topic) => (
            <TouchableOpacity
              key={`topic-${topic}`}
              style={styles.followChip}
              onPress={() => updateFollowList('followed_topics', topic).catch(() => undefined)}
            >
              <Text style={styles.followChipText}>#{topic}</Text>
            </TouchableOpacity>
          ))}
          {homeSettings.followedTopics.length === 0 ? (
            <Text style={styles.emptyFollowText}>Follow topics and sources to sharpen ranking.</Text>
          ) : null}
        </View>

        {feedError ? (
          <Text style={styles.errorText}>Could not load personalized feed: {(feedError as Error).message}</Text>
        ) : null}

        <View style={styles.cardList}>
          {personalizedFeed.map((story) => {
            const topTopic = story.topics?.[0];
            const creatorName = extractCreatorName(story);
            const isTopicFollowed = topTopic
              ? homeSettings.followedTopics.some((item) => normalizeText(item) === normalizeText(topTopic))
              : false;
            const isSourceFollowed = homeSettings.followedSources.some(
              (item) => normalizeText(item) === normalizeText(story.source || '')
            );
            const isCreatorFollowed = creatorName
              ? homeSettings.followedCreators.some((item) => normalizeText(item) === normalizeText(creatorName))
              : false;
            return (
              <View key={story.id} style={styles.storyCard}>
                <Text style={styles.storySource} numberOfLines={1}>
                  {story.source} • {formatPublished(story.publishedAt)}
                </Text>
                <Text style={styles.storyTitle} numberOfLines={3}>{story.title}</Text>
                <Text style={styles.storySummary} numberOfLines={3}>
                  {compactSummary(story.summary || '', story.title)}
                </Text>
                <Text style={styles.storyReason}>
                  {buildReasonText(
                    story,
                    homeSettings.followedTopics,
                    homeSettings.followedSources,
                    homeSettings.followedCreators
                  )}
                </Text>

                <View style={styles.storyActions}>
                  <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={() => openStory(story)}>
                    <Ionicons name="open-outline" size={14} color={colors.buttonText} />
                    <Text style={styles.actionBtnText}>Open</Text>
                  </TouchableOpacity>
                  {topTopic ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.secondaryBtn]}
                      onPress={async () => {
                        await updateFollowList('followed_topics', topTopic);
                        await apiService.sendFeedInteraction({
                          item_id: story.id,
                          item_type: 'story',
                          event_type: 'follow_topic',
                          title: story.title,
                          source: story.source,
                          topics: [topTopic],
                          keywords: story.keywords || [],
                        }).catch(() => undefined);
                      }}
                    >
                      <Ionicons name={isTopicFollowed ? 'checkmark-circle' : 'add-circle-outline'} size={14} color={colors.text} />
                      <Text style={styles.actionBtnTextSecondary}>
                        {isTopicFollowed ? 'Following Topic' : 'Follow Topic'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.storyActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.secondaryBtn]}
                    onPress={async () => {
                      await updateFollowList('followed_sources', story.source || 'Unknown');
                      await apiService.sendFeedInteraction({
                        item_id: story.id,
                        item_type: 'story',
                        event_type: 'follow_source',
                        title: story.title,
                        source: story.source,
                        topics: story.topics || [],
                        keywords: story.keywords || [],
                      }).catch(() => undefined);
                    }}
                  >
                    <Ionicons name={isSourceFollowed ? 'checkmark-circle' : 'newspaper-outline'} size={14} color={colors.text} />
                    <Text style={styles.actionBtnTextSecondary}>
                      {isSourceFollowed ? 'Following Source' : 'Follow Source'}
                    </Text>
                  </TouchableOpacity>

                  {creatorName ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.secondaryBtn]}
                      onPress={async () => {
                        await updateFollowList('followed_creators', creatorName);
                        await apiService.sendFeedInteraction({
                          item_id: story.id,
                          item_type: 'story',
                          event_type: 'follow_creator',
                          title: story.title,
                          source: story.source,
                          creators: [creatorName],
                          topics: story.topics || [],
                          keywords: story.keywords || [],
                        }).catch(() => undefined);
                      }}
                    >
                      <Ionicons name={isCreatorFollowed ? 'checkmark-circle' : 'person-add-outline'} size={14} color={colors.text} />
                      <Text style={styles.actionBtnTextSecondary}>
                        {isCreatorFollowed ? 'Following Creator' : 'Follow Creator'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.secondaryBtn]}
                    onPress={() => {
                      sendStoryEvent(story, 'save');
                      Alert.alert('Saved', 'Story saved signal recorded for ranking.');
                    }}
                  >
                    <Ionicons name="bookmark-outline" size={14} color={colors.text} />
                    <Text style={styles.actionBtnTextSecondary}>Save</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.secondaryBtn]}
                    onPress={() => {
                      sendStoryEvent(story, 'hide');
                      setHiddenStoryIds((current) => [...current, story.id]);
                    }}
                  >
                    <Ionicons name="eye-off-outline" size={14} color={colors.text} />
                    <Text style={styles.actionBtnTextSecondary}>Hide</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {personalizedFeed.length === 0 && !feedError ? (
            <Text style={styles.emptyText}>No stories matched yet. Try a topic in AI mode and refresh.</Text>
          ) : null}
        </View>

        <SectionTitle title="Recent Media" />
        <View style={styles.cardList}>
          {completedJobs.slice(0, 6).map((job) => (
            <View key={job.id} style={styles.mediaCard}>
              <View style={styles.mediaHeaderRow}>
                <Text style={styles.mediaTitle} numberOfLines={2}>{job.filename || 'Untitled'}</Text>
                <Text style={[styles.statusPill, { color: statusTone(job.status), borderColor: statusTone(job.status) }]}>
                  {job.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.mediaMeta} numberOfLines={1}>{job.source_domain || 'Unknown source'}</Text>
              <View style={styles.mediaActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={() => {
                    personalizationService.recordMediaInteraction(job.filename || 'Untitled', job.source_domain).catch(() => undefined);
                    router.push(`/player/${job.id}`);
                  }}
                >
                  <Ionicons name="play" size={16} color={colors.buttonText} />
                  <Text style={styles.actionBtnText}>Play</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.secondaryBtn]}
                  onPress={() => openExternal(getExternalLink(job), job.filename || 'Source', job.source_domain)}
                >
                  <Ionicons name="link-outline" size={16} color={colors.text} />
                  <Text style={styles.actionBtnTextSecondary}>Open URL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {completedJobs.length === 0 ? (
            <Text style={styles.emptyText}>No completed videos yet. Paste a URL in Smart Ask to start your first download.</Text>
          ) : null}
        </View>
      </ScrollView>

      {isVoiceOverlayVisible && (
        <View style={styles.voiceOverlay}>
          <VoiceVisualizer isListening={isRecording} isSpeaking={isSpeaking} metering={metering} />
          <Text style={styles.voiceHint}>
            {isRecording ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Thinking...'}
          </Text>
          <TouchableOpacity style={styles.stopVoiceBtn} onPress={stopRecording}>
            <Ionicons name="stop-circle" size={48} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SectionTitle({
  title,
  rightAction,
}: {
  title: string;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rightAction}
    </View>
  );
}

function InfoCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoSub}>{sub}</Text>
    </View>
  );
}

function TileHeader({
  title,
  icon,
  onToggle,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onToggle: () => void;
}) {
  return (
    <View style={styles.tileHeader}>
      <View style={styles.tileHeaderLeft}>
        <Ionicons name={icon} size={16} color={colors.primaryLight} />
        <Text style={styles.tileTitle}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onToggle}>
        <Ionicons name="close-circle-outline" size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

function TileLoading() {
  return <Text style={styles.tileLoading}>Loading...</Text>;
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
    marginBottom: spacing.md,
  },
  avatarRing: {
    minWidth: 34,
    height: 34,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  avatarText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  brand: {
    ...typography.h1,
    fontSize: 50,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  brandSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 11,
  },
  modeHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 28,
  },
  sectionLink: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tileCard: {
    width: '48.7%',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 124,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  tileHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  tileTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tilePrimary: {
    ...typography.h3,
    fontSize: 20,
    marginTop: spacing.xs,
  },
  tileSecondary: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  tileMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  tileLoading: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  tileError: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  tileInlineButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileInlineButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  verseText: {
    ...typography.bodySmall,
    color: colors.text,
    marginTop: spacing.xs,
  },
  verseRef: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: spacing.xs,
  },
  settingsShortcuts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  shortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
  },
  shortcutText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tileCardExpanded: {
    width: '100%',
    minHeight: 200,
  },
  expandedContent: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoCards: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  infoTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.h3,
    fontSize: 20,
    marginTop: 2,
  },
  infoSub: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A2A14',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#7A5A22',
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  warningText: {
    ...typography.caption,
    color: '#FFCE6A',
    flex: 1,
  },
  feedSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  feedSearchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 9,
  },
  followRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  followChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  followChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyFollowText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  cardList: {
    gap: spacing.sm,
  },
  storyCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
  },
  storySource: {
    ...typography.caption,
    color: colors.primaryLight,
    marginBottom: spacing.xs,
  },
  storyTitle: {
    ...typography.h3,
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  storySummary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  storyReason: {
    ...typography.caption,
    color: '#FFB6B6',
    marginTop: spacing.sm,
  },
  storyActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  mediaCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
  },
  mediaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mediaTitle: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  statusPill: {
    ...typography.caption,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mediaMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  mediaActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    ...typography.caption,
    color: colors.buttonText,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageFeedsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  manageFeedsText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  newsCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  newsSource: {
    ...typography.caption,
    color: colors.primaryLight ?? colors.primary,
    marginBottom: 4,
    fontWeight: '600',
  },
  newsTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  micButton: {
    padding: 8,
    marginRight: 4,
  },
  voiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  voiceHint: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  stopVoiceBtn: {
    marginTop: 20,
  },
});
