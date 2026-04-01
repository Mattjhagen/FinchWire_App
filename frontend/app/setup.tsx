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
  const { markSetupComplete, setAuthToken } = useAuthStore();
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSetup = async () => {
    if (!backendUrl.trim()) {
      Alert.alert('Error', 'Please enter a backend URL');
      return;
    }

    try {
      // PRE-SET: Use default values and bypass to go straight to library
      await saveSettings({
        backend_url: backendUrl.trim() || DEFAULT_BACKEND_URL,
        password: 'bypass',
        retention_days: DEFAULT_RETENTION_DAYS,
        wifi_only: false,
        auto_delete: false,
      });

      await markSetupComplete();
      await setAuthToken('bypass');
      apiService.setAuthToken('bypass');
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
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
            placeholder="https://yt.finchwire.site"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            This is your media server URL
          </Text>

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Admin Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Your MEDIA_DROP_ADMIN_PASSWORD
          </Text>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSetup}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Setting up...' : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.buttonText} />
          </TouchableOpacity>
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
});
