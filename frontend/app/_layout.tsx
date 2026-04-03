// Root Layout - Auth Check and Navigation Setup
import React, { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { apiService } from '../src/services/api';
import { storageService } from '../src/services/storage';
import { colors } from '../src/utils/theme';

const queryClient = new QueryClient();
const PENDING_INCOMING_URL_KEY = '@finchwire_pending_incoming_url';
const FINCHWIRE_MEDIA_HOSTS = new Set(['media.p3lending.space', 'yt.finchwire.site']);
const HTTP_URL_REGEX = /https?:\/\/[^\s]+/i;

const normalizeIncomingUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const candidate = String(value).trim();
  const matched = candidate.match(HTTP_URL_REGEX);
  if (!matched?.[0]) return null;
  try {
    return new URL(matched[0]).toString();
  } catch {
    return null;
  }
};

const shouldOpenInSharedPlayer = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return FINCHWIRE_MEDIA_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith('/media/');
  } catch {
    return false;
  }
};

const getSharedTitleFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'Shared media');
    return rawName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim() || 'Shared media';
  } catch {
    return 'Shared media';
  }
};

const extractShareIntentUrl = (shareIntent: { webUrl?: string | null; text?: string | null }): string | null => {
  return normalizeIncomingUrl(shareIntent?.webUrl) || normalizeIncomingUrl(shareIntent?.text);
};

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, authToken, isLoading, loadAuth, setupComplete } = useAuthStore();
  const { settings, loadSettings } = useSettingsStore();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const lastRoutedUrlRef = useRef<string | null>(null);

  // Initialize stores and services
  useEffect(() => {
    const init = async () => {
      await loadSettings();
      await loadAuth();
      
      // Initialize storage service (skip on web due to WASM issues)
      try {
        await storageService.init();
      } catch (error) {
        console.warn('Storage service initialization skipped (web platform):', error);
      }
    };
    init();
  }, [loadAuth, loadSettings]);

  // Configure API service when settings or auth changes
  useEffect(() => {
    if (settings) {
      apiService.setBaseUrl(settings.backend_url);
    }
    if (authToken) {
      apiService.setAuthToken(authToken);
    } else {
      apiService.setAuthToken('');
    }
  }, [settings, authToken]);

  const routeIncomingUrl = useCallback(async (incomingUrl: string) => {
    if (!incomingUrl) return;

    if (!setupComplete || !isAuthenticated) {
      await AsyncStorage.setItem(PENDING_INCOMING_URL_KEY, incomingUrl);
      return;
    }

    if (lastRoutedUrlRef.current === incomingUrl) {
      return;
    }
    lastRoutedUrlRef.current = incomingUrl;
    await AsyncStorage.removeItem(PENDING_INCOMING_URL_KEY);

    if (shouldOpenInSharedPlayer(incomingUrl)) {
      router.push({
        pathname: '/player/shared',
        params: {
          url: incomingUrl,
          title: getSharedTitleFromUrl(incomingUrl),
        },
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/add',
      params: {
        sharedUrl: incomingUrl,
        autoStart: '1',
      },
    });
  }, [isAuthenticated, router, setupComplete]);

  // Handle Android share-sheet payloads delivered by expo-share-intent.
  useEffect(() => {
    if (!hasShareIntent) return;

    const incomingUrl = extractShareIntentUrl(shareIntent || {});
    resetShareIntent();
    if (!incomingUrl) return;

    void routeIncomingUrl(incomingUrl);
  }, [hasShareIntent, resetShareIntent, routeIncomingUrl, shareIntent]);

  // Handle direct app links (https://media.p3lending.space/media/...).
  useEffect(() => {
    let cancelled = false;

    const handleIncoming = (url?: string | null) => {
      const normalized = normalizeIncomingUrl(url);
      if (!normalized || cancelled) return;
      void routeIncomingUrl(normalized);
    };

    Linking.getInitialURL()
      .then((initialUrl) => {
        handleIncoming(initialUrl);
      })
      .catch(() => {
        // Ignore link-read failures.
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncoming(url);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [routeIncomingUrl]);

  // Handle push-notification deep links.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const incoming = response?.notification?.request?.content?.data?.url;
      const normalized = normalizeIncomingUrl(
        typeof incoming === 'string' ? incoming : null
      );
      if (!normalized) return;
      void routeIncomingUrl(normalized);
    });

    return () => {
      sub.remove();
    };
  }, [routeIncomingUrl]);

  // Replay pending incoming URL after login/setup completes.
  useEffect(() => {
    if (!setupComplete || !isAuthenticated) return;

    let cancelled = false;
    (async () => {
      const pending = await AsyncStorage.getItem(PENDING_INCOMING_URL_KEY);
      if (cancelled || !pending) return;
      void routeIncomingUrl(pending);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, routeIncomingUrl, setupComplete]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading || setupComplete === null) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!setupComplete) {
      if (segments[0] !== 'setup') {
        router.replace('/setup');
      }
    } else if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      if (inAuthGroup || segments[0] === 'setup') {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, router, setupComplete, segments]);

  if (isLoading || setupComplete === null) {
    return null; // Could show a splash screen here
  }

  return (
    <>
      <Stack 
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="setup" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="article" />
        <Stack.Screen 
          name="player/[id]" 
          options={{ 
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }} 
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <QueryClientProvider client={queryClient}>
        <RootLayoutNav />
      </QueryClientProvider>
    </ShareIntentProvider>
  );
}
