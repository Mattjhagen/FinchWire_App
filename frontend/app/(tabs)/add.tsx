// Add Screen - Download new media
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { personalizationService } from '../../src/services/personalization';

const looksLikeUrl = (value: string): boolean => /^https?:\/\/\S+/i.test(value.trim());
const decodeParam = (value?: string | string[]): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
};

type SubmitState = 'idle' | 'submitting' | 'queued' | 'error';

export default function AddScreen() {
  const router = useRouter();
  const { sharedUrl, autoStart } = useLocalSearchParams<{ sharedUrl?: string; autoStart?: string }>();
  const [url, setUrl] = useState('');
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const lastAutoQueuedUrlRef = useRef<string | null>(null);

  const incomingUrl = decodeParam(sharedUrl);
  const isShareMode = Boolean(incomingUrl && looksLikeUrl(incomingUrl));
  const isLoading = submitState === 'submitting';

  const submitDownloadRequest = useCallback(async (inputUrl: string, audioOnly: boolean) => {
    const value = inputUrl.trim();
    if (!value) {
      Alert.alert('Error', 'Please enter a video URL or search phrase');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');
    try {
      if (!looksLikeUrl(value)) {
        personalizationService.recordAiPrompt(value).catch(() => {
          // Non-blocking signal for Discover personalization.
        });
      }

      const response = await apiService.submitDownload({
        url: value,
        is_audio: audioOnly,
      });

      if (response && response.id) {
        setSubmitState('queued');
        // In share mode, navigate to downloads automatically after a brief success moment.
        if (isShareMode) {
          setTimeout(() => {
            router.replace('/(tabs)/downloads');
          }, 1500);
        } else {
          Alert.alert(
            'Success',
            'Download job submitted successfully!',
            [
              {
                text: 'Go to Downloads',
                onPress: () => {
                  setUrl('');
                  setSubmitState('idle');
                  router.push('/(tabs)/downloads');
                },
              },
              {
                text: 'OK',
                onPress: () => {
                  setUrl('');
                  setSubmitState('idle');
                },
              },
            ]
          );
        }
      } else {
        setSubmitState('error');
        setErrorMessage('Failed to submit download. Please try again.');
      }
    } catch (error) {
      console.error('Download error:', error);
      setSubmitState('error');
      setErrorMessage((error as Error)?.message || 'Failed to connect to server. Ensure your backend is running.');
    }
  }, [isShareMode, router]);

  const handleDownload = async () => {
    await submitDownloadRequest(url, isAudioOnly);
  };

  useEffect(() => {
    if (!incomingUrl || !looksLikeUrl(incomingUrl)) return;

    setUrl(incomingUrl);
    if (autoStart !== '1') return;

    if (lastAutoQueuedUrlRef.current === incomingUrl || isLoading) {
      return;
    }

    lastAutoQueuedUrlRef.current = incomingUrl;
    void submitDownloadRequest(incomingUrl, isAudioOnly);
  // isAudioOnly intentionally excluded — we want the value at the moment of first auto-trigger
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, incomingUrl, submitDownloadRequest]);

  // Share-mode UI
  if (isShareMode) {
    return (
      <View style={styles.container}>
        <View style={styles.shareHeader}>
          <Ionicons name="share-social" size={28} color={colors.primary} />
          <Text style={styles.shareHeaderText}>FinchWire Download</Text>
        </View>

        <ScrollView contentContainerStyle={styles.shareScrollContent}>
          {/* Status card */}
          <View style={styles.shareCard}>
            {submitState === 'submitting' && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.statusTitle}>Queueing download…</Text>
                <Text style={styles.statusSub}>Sending to your FinchWire server</Text>
              </View>
            )}

            {submitState === 'queued' && (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={56} color={colors.success} />
                <Text style={styles.statusTitle}>Queued!</Text>
                <Text style={styles.statusSub}>Taking you to Downloads…</Text>
              </View>
            )}

            {submitState === 'error' && (
              <View style={styles.statusRow}>
                <Ionicons name="alert-circle" size={56} color={colors.error} />
                <Text style={styles.statusTitle}>Failed to queue</Text>
                <Text style={styles.statusSub}>{errorMessage}</Text>
              </View>
            )}

            {submitState === 'idle' && (
              <View style={styles.statusRow}>
                <Ionicons name="cloud-download-outline" size={56} color={colors.primary} />
                <Text style={styles.statusTitle}>Ready to download</Text>
              </View>
            )}

            {/* URL pill */}
            <View style={styles.urlPill}>
              <Ionicons name="link" size={14} color={colors.textSecondary} />
              <Text style={styles.urlPillText} numberOfLines={2}>{incomingUrl}</Text>
            </View>

            {/* Audio-only toggle — always visible so user can change before retry */}
            <TouchableOpacity
              style={styles.audioToggleRow}
              onPress={() => setIsAudioOnly((v) => !v)}
              disabled={isLoading || submitState === 'queued'}
            >
              <Ionicons
                name={isAudioOnly ? 'musical-notes' : 'videocam-outline'}
                size={20}
                color={isAudioOnly ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.audioToggleLabel, isAudioOnly && { color: colors.primary }]}>
                {isAudioOnly ? 'Audio only (.mp3)' : 'Video + Audio (.mp4)'}
              </Text>
              <Ionicons
                name={isAudioOnly ? 'toggle' : 'toggle-outline'}
                size={28}
                color={isAudioOnly ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Retry / action buttons */}
          {(submitState === 'idle' || submitState === 'error') && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => submitDownloadRequest(incomingUrl, isAudioOnly)}
            >
              <Ionicons name="cloud-upload" size={20} color={colors.buttonText} />
              <Text style={styles.primaryButtonText}>
                {submitState === 'error' ? 'Retry Download' : 'Download to Server'}
              </Text>
            </TouchableOpacity>
          )}

          {submitState !== 'queued' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // Standard add-URL UI
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="cloud-download" size={60} color={colors.primary} />
          <Text style={styles.title}>Download to Server</Text>
          <Text style={styles.subtitle}>
            Paste a direct URL or type a search phrase. FinchWire will queue the best match to your server.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Video URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://... or search topic (example: joe rogan theo von)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline={true}
            numberOfLines={2}
          />

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setIsAudioOnly(!isAudioOnly)}
            >
              <Ionicons
                name={isAudioOnly ? 'checkbox' : 'square-outline'}
                size={24}
                color={isAudioOnly ? colors.primary : colors.textTertiary}
              />
              <Text style={styles.optionLabel}>Download as Audio Only (.mp3)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, (!url.trim() || isLoading) && styles.buttonDisabled]}
            onPress={handleDownload}
            disabled={!url.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.buttonText} style={styles.buttonIcon} />
            ) : (
              <Ionicons name="cloud-upload" size={24} color={colors.buttonText} style={styles.buttonIcon} />
            )}
            <Text style={styles.buttonText}>
              {isLoading ? 'Submitting…' : 'Download to Server'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            The server will process the download in the background. You can track progress in the Downloads tab.
          </Text>
        </View>

        <View style={styles.shareHintBox}>
          <Ionicons name="share-social-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            Tip: Tap Share in YouTube, TikTok, or any video app and choose FinchWire to queue downloads instantly.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Share-mode styles ──────────────────────────────────
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: 52,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shareHeaderText: {
    ...typography.h2,
    color: colors.text,
  },
  shareScrollContent: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  shareCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  statusRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  statusTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  statusSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  urlPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  urlPillText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  audioToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  audioToggleLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // ── Standard add-URL styles ────────────────────────────
  scrollContent: {
    padding: spacing.xl,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  form: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionsContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLabel: {
    ...typography.body,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  shareHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
