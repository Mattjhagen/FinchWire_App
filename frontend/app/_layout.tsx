// Root Layout - Auth Check and Navigation Setup
import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { apiService } from '../src/services/api';
import { storageService } from '../src/services/storage';
import { colors } from '../src/utils/theme';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadAuth, setupComplete, markSetupComplete } = useAuthStore();
  const { settings, loadSettings } = useSettingsStore();

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
  }, []);

  // Configure API service when settings change
  useEffect(() => {
    if (settings) {
      apiService.setBaseUrl(settings.backend_url);
      if (settings.password) {
        apiService.setAuthToken(settings.password);
      }
    }
  }, [settings]);

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
  }, [isAuthenticated, isLoading, setupComplete, segments]);

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
    <QueryClientProvider client={queryClient}>
      <RootLayoutNav />
    </QueryClientProvider>
  );
}
