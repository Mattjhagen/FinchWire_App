import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../utils/theme';
import { LiveChannel } from '../types';
import { getLiveEmbedResult } from '../providers';

interface LivePlayerProps {
  channel: LiveChannel | null;
}

// Injected into the WebView to listen for YouTube's JS API error events.
// YouTube fires a postMessage with {event:'onError', info:<code>} when playback fails.
const YT_ERROR_LISTENER_JS = `
(function() {
  window.addEventListener('message', function(evt) {
    try {
      var d = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
      if (d && d.event === 'onError') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'yt_error', code: d.info }));
      }
      if (d && d.event === 'onStateChange' && d.info === -1) {
        // state -1 = unstarted; harmless but useful for debugging
      }
    } catch(e) {}
  });
  true;
})();
`;

// A robust desktop Chrome user-agent helps bypass some embed restrictions.
const WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export function LivePlayer({ channel }: LivePlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  // Incrementing this key forces a full WebView remount (crash recovery).
  const [mountKey, setMountKey] = useState(0);

  const embed = useMemo(() => {
    if (!channel) {
      return { url: null, sourceUrl: null, error: 'No channel selected.' };
    }
    return getLiveEmbedResult(channel);
  }, [channel]);

  useEffect(() => {
    setIsLoading(true);
    setRuntimeError(null);
    setMountKey((k) => k + 1); // force remount when channel changes
  }, [channel?.id]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg?.type === 'yt_error') {
        const code = Number(msg.code);
        if (code === 150 || code === 101) {
          setRuntimeError('This stream has embedding disabled. Tap "Watch on YouTube" to view it.');
        } else if (code === 5) {
          setRuntimeError('HTML5 player error. Try watching directly on YouTube.');
        } else {
          setRuntimeError(`Playback error (code ${code}). Try watching on YouTube.`);
        }
        setIsLoading(false);
      }
    } catch {
      // Not a message we handle.
    }
  }, []);

  const handleReload = useCallback(() => {
    setRuntimeError(null);
    setIsLoading(true);
    setMountKey((k) => k + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (embed.sourceUrl) {
      Linking.openURL(embed.sourceUrl).catch(() => undefined);
    }
  }, [embed.sourceUrl]);

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
        {embed.sourceUrl ? (
          <TouchableOpacity style={styles.externalBtn} onPress={handleOpenExternal}>
            <Ionicons name="logo-youtube" size={16} color={colors.buttonText} />
            <Text style={styles.externalBtnText}>Watch on YouTube</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // Show error overlay when embedding fails (Error 153 / embed disabled)
  if (errorMessage && !isLoading) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="alert-circle-outline" size={30} color={colors.warning} />
        <Text style={styles.placeholderTitle}>Stream Unavailable</Text>
        <Text style={styles.placeholderText}>{errorMessage}</Text>
        <View style={styles.errorActions}>
          {embed.sourceUrl ? (
            <TouchableOpacity style={styles.externalBtn} onPress={handleOpenExternal}>
              <Ionicons name="logo-youtube" size={16} color={colors.buttonText} />
              <Text style={styles.externalBtnText}>Watch on YouTube</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.reloadBtn} onPress={handleReload}>
            <Ionicons name="refresh" size={16} color={colors.text} />
            <Text style={styles.reloadBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
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
        // Changing key forces a full remount — used on channel switch and crash recovery
        key={`${channel.id}-${mountKey}`}
        source={{ uri: embed.url }}
        style={styles.player}
        // Playback settings
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Prevents YouTube from opening new windows/tabs which causes the grey screen
        setSupportMultipleWindows={false}
        // Android: prevents grey screen after render process crash
        onRenderProcessGone={() => {
          setRuntimeError(null);
          setIsLoading(true);
          setMountKey((k) => k + 1);
        }}
        // User agent so YouTube doesn't refuse the embed
        userAgent={WEBVIEW_USER_AGENT}
        // Allow JS for the YouTube iframe API error listener
        javaScriptEnabled
        injectedJavaScript={YT_ERROR_LISTENER_JS}
        onMessage={handleMessage}
        // Lifecycle
        onLoadStart={() => {
          setIsLoading(true);
          setRuntimeError(null);
        }}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setRuntimeError('This stream could not be loaded right now.');
          setIsLoading(false);
        }}
        onHttpError={(syntheticEvent) => {
          const { statusCode } = syntheticEvent.nativeEvent;
          if (statusCode === 403 || statusCode === 451) {
            setRuntimeError('This stream is geo-restricted or embedding is blocked. Tap "Watch on YouTube".');
          } else {
            setRuntimeError(`Stream returned HTTP ${statusCode}. Try watching on YouTube.`);
          }
          setIsLoading(false);
        }}
      />

      {/* Persistent "Watch on YouTube" shortcut when stream is playing but error-prone */}
      {!isLoading && !errorMessage && embed.sourceUrl ? (
        <TouchableOpacity style={styles.ytShortcut} onPress={handleOpenExternal}>
          <Ionicons name="logo-youtube" size={13} color={colors.textSecondary} />
          <Text style={styles.ytShortcutText}>Open in YouTube</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  playerShell: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#000',
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
  errorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FF0000',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  externalBtnText: {
    ...typography.caption,
    color: colors.buttonText,
    fontWeight: '700',
  },
  reloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reloadBtnText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  ytShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.sm,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  ytShortcutText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
});
