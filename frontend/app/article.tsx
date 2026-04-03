import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { borderRadius, colors, spacing, typography } from '../src/utils/theme';
import { apiService } from '../src/services/api';

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
    if (!url) return;
    apiService.sendFeedInteraction({
      item_id: storyId || url,
      item_type: 'story',
      event_type: 'open',
      title,
      source,
      topics,
      creators,
      categories,
      keywords,
      occurred_at: new Date().toISOString(),
    }).catch(() => undefined);
  }, [categories, creators, keywords, source, storyId, title, topics, url]);

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

  const openExternal = async () => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  const askArticleQuestion = async () => {
    const question = chatInput.trim();
    if (!question) return;

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{source || url}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={openExternal}>
          <Ionicons name="open-outline" size={18} color={colors.text} />
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
        <Text style={styles.chatTitle}>Ask FinchWire AI</Text>
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
        <View style={styles.chatComposer}>
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
  chatTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
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
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    ...typography.caption,
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
