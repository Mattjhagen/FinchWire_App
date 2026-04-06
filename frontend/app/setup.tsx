// Setup Screen - First Launch Configuration
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../src/utils/theme';
import { useSettingsStore } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { apiService } from '../src/services/api';
import { DEFAULT_BACKEND_URL, DEFAULT_RETENTION_DAYS } from '../src/utils/constants';

export default function SetupScreen() {
  const router = useRouter();
  const { saveSettings } = useSettingsStore();
  const { markSetupComplete } = useAuthStore();
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleSetup = async () => {
    if (!backendUrl.trim()) {
      Alert.alert('Error', 'Please enter a backend URL');
      return;
    }

    setIsLoading(true);
    try {
      // Test connectivity before saving
      apiService.setBaseUrl(backendUrl.trim());
      const { reachable, error: connError } = await apiService.testConnection();

      if (!reachable) {
        Alert.alert(
          'Cannot Reach Server',
          `Failed to connect to:\n${backendUrl.trim()}\n\nReason: ${connError}\n\nCheck that:\n• The URL is correct (e.g. https://media.p3lending.space or http://192.168.1.213:8080)\n• Your phone and server are on the same Wi-Fi (if using local IP)\n• The server is running`,
          [
            { text: 'Try Anyway', onPress: () => completeSetup(backendUrl.trim()) },
            { text: 'Go Back', style: 'cancel' },
          ]
        );
        return;
      }

      await completeSetup(backendUrl.trim());
    } catch {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  const completeSetup = async (url: string) => {
    await saveSettings({
      backend_url: url,
      password: '',
      retention_days: DEFAULT_RETENTION_DAYS,
      wifi_only: false,
      auto_delete: false,
      app_lock_enabled: false,
      app_lock_biometrics: false,
      app_lock_timeout: '1m',
      ai_provider: 'none',
      tts_provider: 'none',
      has_ai_api_key: false,
      has_tts_api_key: false,
      weather_provider: 'open_meteo',
      market_provider: 'coingecko_yahoo',
      has_weather_api_key: false,
      has_market_api_key: false,
      has_youtube_api_key: false,
      weather_location: 'Omaha, NE',
      weather_lat: '41.2565',
      weather_lon: '-95.9345',
      home_market_symbol: 'BTC',
      home_market_asset_type: 'crypto',
      home_weather_unit: 'f',
      home_tiles: {
        weather: true,
        market: true,
        verse: true,
        order: ['weather', 'market', 'verse'],
      },
      followed_topics: [],
      followed_sources: [],
      followed_creators: [],
      custom_rss_feeds: [],
    });

    await markSetupComplete();
    apiService.setBaseUrl(url);
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo/Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="play-circle" size={80} color={colors.primary} />
          </View>
          <Text style={styles.title}>Welcome to FinchWire</Text>
          <Text style={styles.subtitle}>
            Stream and download your media library anywhere
          </Text>
        </View>

        {/* Setup Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Backend Server URL</Text>
          <TextInput
            style={styles.input}
            value={backendUrl}
            onChangeText={setBackendUrl}
            placeholder="https://media.p3lending.space"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSetup}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Get Started' : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.buttonText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.helpButton}
            onPress={() => setShowHelp(true)}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.helpButtonText}>How do I set this up?</Text>
          </TouchableOpacity>

          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.helpButton, { marginTop: spacing.sm }]}
              onPress={() => setBackendUrl(DEFAULT_BACKEND_URL)}
            >
              <Ionicons name="refresh-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.helpButtonText, { color: colors.textSecondary }]}>Reset to Recommended Server</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Setup Help Modal */}
        <Modal
          visible={showHelp}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowHelp(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Server Setup Guide</Text>
                <TouchableOpacity onPress={() => setShowHelp(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                <Text style={styles.stepTitle}>1. Requirements</Text>
                <Text style={styles.stepText}>
                  You need a Linux server or NAS (Ubuntu/Debian) to host your media backend.
                </Text>

                <Text style={styles.stepTitle}>2. Installation</Text>
                <Text style={styles.codeBlock}>
                  git clone https://github.com/Mattjhagen/YT-Download.git{"\n"}
                  cd YT-Download/app{"\n"}
                  npm install
                </Text>

                <Text style={styles.stepTitle}>3. Configuration</Text>
                <Text style={styles.stepText}>
                  Set your admin password in a .env file:
                </Text>
                <Text style={styles.codeBlock}>
                  MEDIA_DROP_ADMIN_PASSWORD=your_password
                </Text>

                <Text style={styles.stepTitle}>4. Run Server</Text>
                <Text style={styles.codeBlock}>
                  node server.js
                </Text>

                <Text style={styles.stepText}>
                  Once running, enter your server&apos;s IP address (starting with http:// or https://) in the Setup screen.
                </Text>

                <View style={{ height: spacing.xl }} />
              </ScrollView>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowHelp(false)}
              >
                <Text style={styles.buttonText}>Got it!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoContainer: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
    marginRight: spacing.sm,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  helpButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: spacing.xs,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h2,
  },
  modalScroll: {
    marginBottom: spacing.xl,
  },
  stepTitle: {
    ...typography.body,
    fontWeight: 'bold',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    color: colors.primary,
  },
  stepText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  codeBlock: {
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    marginBottom: spacing.md,
  },
  closeModalButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
});
