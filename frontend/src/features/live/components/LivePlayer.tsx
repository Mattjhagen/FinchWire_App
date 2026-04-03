import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../../../utils/theme';
import { LiveChannel } from '../types';
import { getLiveEmbedResult } from '../providers';

interface LivePlayerProps {
  channel: LiveChannel | null;
}

// Injected into the WebView to catch YouTube iframe API error postMessages.
const YT_ERROR_LISTENER_JS = `
(function() {
  window.addEventListener('message', function(evt) {
    try {
      var d = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
      if (d && d.event === 'onError') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'yt_error', code: d.info }));
      }
    } catch(e) {}
  });
  true;
})();
`;

const WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export function LivePlayer({ channel }: LivePlayerProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [isLoading, setIsLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Auto-hide controls overlay after 3 s in fullscreen
  useEffect(() => {
    if (!isFullscreen || !controlsVisible) return;
    const t = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(t);
  }, [isFullscreen, controlsVisible]);

  // Exit fullscreen when rotating back to portrait
  useEffect(() => {
    if (!isLandscape && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [isLandscape, isFullscreen]);

  const embed = useMemo(() => {
    if (!channel) return { url: null, sourceUrl: null, error: 'No channel selected.' };
    return getLiveEmbedResult(channel);
  }, [channel]);

  useEffect(() => {
    setIsLoading(true);
    setRuntimeError(null);
    setMountKey((k) => k + 1);
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
    if (embed.sourceUrl) Linking.openURL(embed.sourceUrl).catch(() => undefined);
  }, [embed.sourceUrl]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
    setControlsVisible(true);
  }, []);

  const errorMessage = runtimeError || embed.error;

  // ── Placeholder states ─────────────────────────────────────────────────────

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
        {embed.sourceUrl ? <ExternalBtn onPress={handleOpenExternal} /> : null}
      </View>
    );
  }

  if (errorMessage && !isLoading) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="alert-circle-outline" size={30} color={colors.warning} />
        <Text style={styles.placeholderTitle}>Stream Unavailable</Text>
        <Text style={styles.placeholderText}>{errorMessage}</Text>
        <View style={styles.errorActions}>
          {embed.sourceUrl ? <ExternalBtn onPress={handleOpenExternal} /> : null}
          <TouchableOpacity style={styles.reloadBtn} onPress={handleReload}>
            <Ionicons name="refresh" size={16} color={colors.text} />
            <Text style={styles.reloadBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Player dimensions ──────────────────────────────────────────────────────
  // In fullscreen or landscape: fill the whole screen.
  // In portrait inline: fixed 16:9 box.
  const playerWidth = isFullscreen || isLandscape ? width : width - spacing.md * 2;
  const playerHeight = isFullscreen || isLandscape ? height : Math.round(playerWidth * (9 / 16));

  const shellStyle = [
    styles.playerShell,
    (isFullscreen || isLandscape) && {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width,
      height,
      zIndex: 100,
      borderRadius: 0,
      borderWidth: 0,
    },
  ];

  return (
    <View style={shellStyle}>
      {isFullscreen || isLandscape ? (
        <StatusBar hidden />
      ) : (
        <StatusBar hidden={false} />
      )}

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading stream...</Text>
        </View>
      ) : null}

      <WebView
        key={`${channel.id}-${mountKey}`}
        source={{ uri: embed.url }}
        style={{ width: playerWidth, height: playerHeight, backgroundColor: '#000' }}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        onRenderProcessGone={() => {
          setRuntimeError(null);
          setIsLoading(true);
          setMountKey((k) => k + 1);
        }}
        userAgent={WEBVIEW_USER_AGENT}
        javaScriptEnabled
        injectedJavaScript={YT_ERROR_LISTENER_JS}
        onMessage={handleMessage}
        onLoadStart={() => { setIsLoading(true); setRuntimeError(null); }}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => { setRuntimeError('This stream could not be loaded right now.'); setIsLoading(false); }}
        onHttpError={(e) => {
          const code = e.nativeEvent.statusCode;
          setRuntimeError(
            code === 403 || code === 451
              ? 'Stream is geo-restricted or embedding is blocked. Tap "Watch on YouTube".'
              : `Stream returned HTTP ${code}. Try watching on YouTube.`
          );
          setIsLoading(false);
        }}
      />

      {/* Tappable overlay to show/hide controls in fullscreen */}
      <TouchableOpacity
        style={styles.controlsTap}
        activeOpacity={1}
        onPress={() => isFullscreen && setControlsVisible((v) => !v)}
      >
        {/* Controls row — always visible in portrait, fade in/out in fullscreen */}
        {(!isFullscreen || controlsVisible) ? (
          <View style={[styles.controlsRow, (isFullscreen || isLandscape) && styles.controlsRowFullscreen]}>
            {/* Fullscreen / exit button */}
            <TouchableOpacity style={styles.iconBtn} onPress={toggleFullscreen}>
              <Ionicons
                name={isFullscreen ? 'contract-outline' : 'expand-outline'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>

            {/* YouTube shortcut */}
            {embed.sourceUrl ? (
              <TouchableOpacity style={styles.ytShortcut} onPress={handleOpenExternal}>
                <Ionicons name="logo-youtube" size={13} color={colors.textSecondary} />
                <Text style={styles.ytShortcutText}>YouTube</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function ExternalBtn({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.externalBtn} onPress={onPress}>
      <Ionicons name="logo-youtube" size={16} color="#fff" />
      <Text style={styles.externalBtnText}>Watch on YouTube</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  playerShell: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 5,
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
  // Invisible tap target covering the whole player
  controlsTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'flex-end',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    padding: spacing.xs,
    paddingBottom: Platform.OS === 'android' ? spacing.xs : spacing.sm,
  },
  controlsRowFullscreen: {
    paddingBottom: 24, // extra bottom padding in fullscreen / landscape
  },
  iconBtn: {
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    padding: 8,
  },
  ytShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  ytShortcutText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
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
    color: '#fff',
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
});
