import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../utils/theme';
import { LiveChannel } from '../types';
import { getLiveEmbedResult } from '../providers';

interface LivePlayerProps {
  channel: LiveChannel | null;
}

export function LivePlayer({ channel }: LivePlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const embed = useMemo(() => {
    if (!channel) {
      return { url: null, sourceUrl: null, error: 'No channel selected.' };
    }
    return getLiveEmbedResult(channel);
  }, [channel]);

  useEffect(() => {
    setIsLoading(true);
    setRuntimeError(null);
  }, [channel?.id]);

  const errorMessage = runtimeError || embed.error;

  if (!channel) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="tv-outline" size={30} color={colors.textSecondary} />
        <Text style={styles.placeholderTitle}>No channel selected</Text>
        <Text style={styles.placeholderText}>Select a channel from the guide to start playback.</Text>
      </View>
    );
  }

  if (!embed.url) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="warning-outline" size={30} color={colors.warning} />
        <Text style={styles.placeholderTitle}>Channel unavailable</Text>
        <Text style={styles.placeholderText}>{errorMessage || 'Embed URL is missing.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.playerShell}>
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading stream...</Text>
        </View>
      ) : null}

      <WebView
        key={channel.id}
        source={{ uri: embed.url }}
        style={styles.player}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadStart={() => {
          setIsLoading(true);
          setRuntimeError(null);
        }}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setRuntimeError('This stream could not be loaded right now.');
          setIsLoading(false);
        }}
        onHttpError={() => {
          setRuntimeError('The provider blocked or rejected this embed.');
          setIsLoading(false);
        }}
      />

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  playerShell: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    overflow: 'hidden',
    minHeight: 220,
  },
  player: {
    height: 260,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 3,
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  loadingText: {
    ...typography.caption,
    color: colors.text,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#2A1616',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
  },
  placeholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholderTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  placeholderText: {
    ...typography.bodySmall,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
