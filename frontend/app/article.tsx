import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { borderRadius, colors, spacing, typography } from '../src/utils/theme';
import { apiService } from '../src/services/api';
import { VoiceVisualizer } from '../src/components/VoiceVisualizer';
import { TypingIndicator } from '../src/components/TypingIndicator';

const decodeParam = (value: string | string[] | undefined): string => {
  if (!value) return '';
  const first = Array.isArray(value) ? value[0] : value;
  try {
    return decodeURIComponent(first);
  } catch {
    return first;
  }
};

const decodeJsonListParam = (value: string | string[] | undefined): string[] => {
  const decoded = decodeParam(value);
  if (!decoded) return [];
  try {
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 24);
  } catch {
    return [];
  }
};

type ArticleChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isAudio?: boolean;
};

const buildArticleAwarePrompt = (question: string, articleTitle: string, articleSource: string, articleUrl: string): string => {
  return [
    'You are FinchWire article assistant.',
    'Answer concisely in 2-4 sentences.',
    `Article title: ${articleTitle || 'Unknown title'}`,
    `Article source: ${articleSource || 'Unknown source'}`,
    `Article URL: ${articleUrl || 'n/a'}`,
    `User question: ${question}`,
  ].join('\n');
};

export default function ArticleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    url?: string;
    title?: string;
    source?: string;
    storyId?: string;
    topics?: string;
    keywords?: string;
    creators?: string;
    categories?: string;
  }>();
  
  const [isLoading, setIsLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [chatMessages, setChatMessages] = useState<ArticleChatMessage[]>([]);
  
  // Voice states
  const [isVoiceOverlayVisible, setIsVoiceOverlayVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [metering, setMetering] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const activeStartRef = useRef<number>(Date.now());
  const activeReadMsRef = useRef<number>(0);
  const appStateRef = useRef(AppState.currentState);

  const url = useMemo(() => decodeParam(params.url), [params.url]);
  const title = useMemo(() => decodeParam(params.title) || 'Article', [params.title]);
  const source = useMemo(() => decodeParam(params.source), [params.source]);
  const storyId = useMemo(() => decodeParam(params.storyId) || url, [params.storyId, url]);
  const topics = useMemo(() => decodeJsonListParam(params.topics), [params.topics]);
  const keywords = useMemo(() => decodeJsonListParam(params.keywords), [params.keywords]);
  const creators = useMemo(() => decodeJsonListParam(params.creators), [params.creators]);
  const categories = useMemo(() => decodeJsonListParam(params.categories), [params.categories]);

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
    if (!url) return;
    const startedAtMs = startedAtRef.current;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const now = Date.now();
      if (appStateRef.current === 'active' && nextState !== 'active') {
        activeReadMsRef.current += Math.max(0, now - activeStartRef.current);
      }
      if (appStateRef.current !== 'active' && nextState === 'active') {
        activeStartRef.current = now;
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
      const now = Date.now();
      if (appStateRef.current === 'active') {
        activeReadMsRef.current += Math.max(0, now - activeStartRef.current);
      }
      const dwellSeconds = Math.round(activeReadMsRef.current / 1000);
      const screenLifetimeSeconds = Math.round((now - startedAtMs) / 1000);

      if (dwellSeconds >= 3 && screenLifetimeSeconds >= 3) {
        apiService.sendFeedInteraction({
          item_id: storyId || url,
          item_type: 'story',
          event_type: 'dwell',
          title,
          source,
          topics,
          creators,
          categories,
          keywords,
          value: dwellSeconds,
          occurred_at: new Date().toISOString(),
        }).catch(() => undefined);
      }
    };
  }, [categories, creators, keywords, source, storyId, title, topics, url]);

  const shareLink = async () => {
    if (!url) return;
    try {
      await Share.share({
        message: `${title}: ${url}`,
        url: url,
      });
    } catch {
      // Ignore share failures
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
      if (permission.status !== 'granted') return;

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
    setIsAskingAi(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const response = await apiService.runAiSpeechSearch(
        base64,
        Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/amr',
        buildArticleAwarePrompt('User spoken query', title, source, url)
      );

      const answer = (response.answer || '').trim();
      if (answer) {
        setChatMessages(prev => [...prev, {
          id: `ai-voice-${Date.now()}`,
          role: 'assistant',
          text: answer
        }]);
        playTextToSpeech(answer);
      }
    } catch (err) {
      console.error('Voice process failed', err);
    } finally {
      setIsAskingAi(false);
      setIsVoiceOverlayVisible(false);
    }
  };

  const playTextToSpeech = async (text: string) => {
    try {
      setIsSpeaking(true);
      const response = await apiService.runAiTts(text);
      
      if (response.audio_base64) {
        const fileUri = `${FileSystem.cacheDirectory}speech.mp3`;
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

  const askArticleQuestion = async () => {
    const question = chatInput.trim();
    if (!question) return;

    Keyboard.dismiss();
    const userMessage: ArticleChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setIsAskingAi(true);

    try {
      const response = await apiService.runAiSearch(
        buildArticleAwarePrompt(question, title, source, url)
      );
      const answer = String(response.answer || '').trim() || 'No answer returned.';
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: answer,
        },
      ]);

      // Update backend interests based on conversational intent
      apiService.sendInterestFeedback({
        interaction_type: 'ai_interaction',
        story_id: storyId || url,
        title,
        source,
        topics,
        creators,
        categories,
        keywords,
        ai_query: question,
        ai_answer: answer,
        occurred_at: new Date().toISOString(),
      }).catch(() => undefined);
    } catch (error: any) {
      const message = String(error?.message || 'AI request failed.');
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: `AI unavailable right now: ${message}`,
        },
      ]);
    } finally {
      setIsAskingAi(false);
    }
  };

  if (!url) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Missing article URL.</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => router.back()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{source || url}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={shareLink}>
          <Ionicons name="share-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading article...</Text>
        </View>
      ) : null}

      <WebView
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures
      />

      <View style={styles.chatPanel}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>Ask FinchWire AI</Text>
          <TouchableOpacity
            style={styles.summarizeBtn}
            onPress={() => {
              setChatInput('Summarize this article in 1-2 concise sentences.');
              askArticleQuestion();
            }}
            disabled={isAskingAi}
          >
            <Text style={styles.summarizeBtnText}>Summarize</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.chatHistory} contentContainerStyle={styles.chatHistoryContent}>
          {chatMessages.length === 0 ? (
            <Text style={styles.chatHint}>
              Ask about this article, related context, or request a quick 1-2 sentence summary.
            </Text>
          ) : (
            chatMessages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.chatBubble,
                  message.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                ]}
              >
                <Text
                  style={[
                    styles.chatBubbleText,
                    message.role === 'user' ? styles.chatBubbleTextUser : styles.chatBubbleTextAssistant,
                  ]}
                >
                  {message.text}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        {isAskingAi && chatMessages.length > 0 && <TypingIndicator />}

        <View style={styles.chatComposer}>
          <TouchableOpacity style={styles.voiceBtn} onPress={toggleVoiceInteraction}>
            <Ionicons name="mic" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.chatInput}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask about this article..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="sentences"
            autoCorrect
            returnKeyType="send"
            onSubmitEditing={askArticleQuestion}
            editable={!isAskingAi}
          />
          <TouchableOpacity
            style={[styles.chatSendButton, (isAskingAi || !chatInput.trim()) && styles.chatSendButtonDisabled]}
            onPress={askArticleQuestion}
            disabled={isAskingAi || !chatInput.trim()}
          >
            <Ionicons name={isAskingAi ? 'hourglass-outline' : 'send'} size={16} color={colors.buttonText} />
          </TouchableOpacity>
        </View>
      </View>

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
    </KeyboardAvoidingView>
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
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundLight,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundLight,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  chatTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  summarizeBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summarizeBtnText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.buttonText,
    fontWeight: '700',
  },
  chatHistory: {
    maxHeight: 148,
    marginBottom: spacing.xs,
  },
  chatHistoryContent: {
    gap: spacing.xs,
  },
  chatHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  chatBubble: {
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chatBubbleUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  chatBubbleAssistant: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '96%',
  },
  chatBubbleText: {
    ...typography.caption,
  },
  chatBubbleTextUser: {
    color: colors.buttonText,
  },
  chatBubbleTextAssistant: {
    color: colors.text,
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chatInput: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    ...typography.caption,
    color: colors.text,
  },
  chatSendButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    opacity: 0.5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 80,
    left: spacing.md,
    right: spacing.md,
    zIndex: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  voiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  voiceHint: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  voiceBtn: {
    padding: 8,
  },
  stopVoiceBtn: {
    marginTop: 20,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.text,
  },
  errorButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  errorButtonText: {
    ...typography.bodySmall,
    color: colors.buttonText,
    fontWeight: '700',
  },
});
