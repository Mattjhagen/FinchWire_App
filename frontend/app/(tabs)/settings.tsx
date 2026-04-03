// Settings Screen
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useAppLockStore } from '../../src/store/appLockStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { apiService } from '../../src/services/api';
import { appLockService } from '../../src/services/appLockService';
import { pushNotificationsService } from '../../src/services/pushNotifications';
import { APP_LOCK_TIMEOUT_OPTIONS } from '../../src/features/app-lock/policy';
import { AiProvider, AppLockTimeout, AssetType, NotificationPreferences, TtsProvider } from '../../src/types';

const AI_PROVIDER_OPTIONS: { label: string; value: AiProvider }[] = [
  { label: 'None', value: 'none' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Groq', value: 'groq' },
];

const TTS_PROVIDER_OPTIONS: { label: string; value: TtsProvider }[] = [
  { label: 'None', value: 'none' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'ElevenLabs', value: 'elevenlabs' },
];

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: true,
  breakingStory: true,
  risingStory: true,
  creatorLive: true,
  creatorUpload: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  minSeverity: 20,
  dailyCap: 12,
  personalizedOnly: false,
};

const HOME_MARKET_CHOICES: { symbol: string; assetType: AssetType; label: string }[] = [
  { symbol: 'BTC', assetType: 'crypto', label: 'BTC (Crypto)' },
  { symbol: 'ETH', assetType: 'crypto', label: 'ETH (Crypto)' },
  { symbol: 'SOL', assetType: 'crypto', label: 'SOL (Crypto)' },
  { symbol: 'TSLA', assetType: 'stock', label: 'TSLA (Stock)' },
  { symbol: 'NVDA', assetType: 'stock', label: 'NVDA (Stock)' },
  { symbol: 'SPY', assetType: 'stock', label: 'SPY (ETF)' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { clearAuth, setAuthToken } = useAuthStore();
  const { setHasPin: setGlobalHasPin, setLocked } = useAppLockStore();
  const { settings, saveSettings } = useSettingsStore();

  const [isEditingUrl, setIsEditingUrl] = React.useState(false);
  const [tempUrl, setTempUrl] = React.useState(settings?.backend_url || '');

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);

  const [aiProvider, setAiProvider] = React.useState<AiProvider>(settings?.ai_provider || 'none');
  const [ttsProvider, setTtsProvider] = React.useState<TtsProvider>(settings?.tts_provider || 'none');
  const [aiApiKey, setAiApiKey] = React.useState('');
  const [ttsApiKey, setTtsApiKey] = React.useState('');
  const [hasAiApiKey, setHasAiApiKey] = React.useState(Boolean(settings?.has_ai_api_key));
  const [hasTtsApiKey, setHasTtsApiKey] = React.useState(Boolean(settings?.has_tts_api_key));
  const [isSavingProviders, setIsSavingProviders] = React.useState(false);
  const [notificationPrefs, setNotificationPrefs] = React.useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFS);
  const [isSavingNotificationPrefs, setIsSavingNotificationPrefs] = React.useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = React.useState(false);
  const [pushToken, setPushToken] = React.useState<string | null>(null);
  const [hasAppLockPin, setHasAppLockPin] = React.useState(false);
  const [appLockError, setAppLockError] = React.useState<string | null>(null);
  const [isAppLockBusy, setIsAppLockBusy] = React.useState(false);
  const [pinFlow, setPinFlow] = React.useState<'none' | 'setup' | 'change' | 'verify-disable'>('none');
  const [pendingEnableAfterPinSetup, setPendingEnableAfterPinSetup] = React.useState(false);
  const [currentPinInput, setCurrentPinInput] = React.useState('');
  const [newPinInput, setNewPinInput] = React.useState('');
  const [confirmPinInput, setConfirmPinInput] = React.useState('');
  const [biometricSummary, setBiometricSummary] = React.useState('Checking biometric support...');

  React.useEffect(() => {
    if (!settings) return;
    setTempUrl(settings.backend_url);
    setAiProvider(settings.ai_provider || 'none');
    setTtsProvider(settings.tts_provider || 'none');
    setHasAiApiKey(Boolean(settings.has_ai_api_key));
    setHasTtsApiKey(Boolean(settings.has_tts_api_key));
  }, [settings]);

  const resetPinFlowState = React.useCallback(() => {
    setPinFlow('none');
    setPendingEnableAfterPinSetup(false);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setAppLockError(null);
  }, []);

  const refreshAppLockStatus = React.useCallback(async () => {
    try {
      const [pinExists, biometricStatus] = await Promise.all([
        appLockService.hasPin(),
        appLockService.getBiometricStatus().catch(() => ({
          available: false,
          enrolled: false,
          authenticationTypes: [],
        })),
      ]);

      setHasAppLockPin(pinExists);
      setGlobalHasPin(pinExists);

      if (!biometricStatus.available) {
        setBiometricSummary('Biometrics unavailable on this device');
      } else if (!biometricStatus.enrolled) {
        setBiometricSummary('Biometrics available but not enrolled');
      } else {
        setBiometricSummary('Biometrics ready');
      }
    } catch {
      setBiometricSummary('Biometric status unavailable');
    }
  }, [setGlobalHasPin]);

  React.useEffect(() => {
    void refreshAppLockStatus();
  }, [refreshAppLockStatus]);

  React.useEffect(() => {
    let isMounted = true;
    const loadServerSettings = async () => {
      try {
        const [serverSettings, prefs, storedPushToken] = await Promise.all([
          apiService.getServerSettings(),
          apiService.getNotificationPreferences().catch(() => DEFAULT_NOTIFICATION_PREFS),
          pushNotificationsService.getStoredPushToken(),
        ]);
        if (!isMounted) return;
        setAiProvider(serverSettings.ai_provider);
        setTtsProvider(serverSettings.tts_provider);
        setHasAiApiKey(serverSettings.has_ai_api_key);
        setHasTtsApiKey(serverSettings.has_tts_api_key);
        setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...prefs });
        setPushToken(storedPushToken);
      } catch {
        // Non-blocking: keep local settings fallback.
      }
    };

    loadServerSettings();
    return () => {
      isMounted = false;
    };
  }, [settings?.backend_url]);

  const persistProviderState = async (next: {
    ai_provider: AiProvider;
    tts_provider: TtsProvider;
    has_ai_api_key: boolean;
    has_tts_api_key: boolean;
  }) => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      ai_provider: next.ai_provider,
      tts_provider: next.tts_provider,
      has_ai_api_key: next.has_ai_api_key,
      has_tts_api_key: next.has_tts_api_key,
    });
  };

  const handleSaveUrl = async () => {
    if (settings && tempUrl.trim()) {
      await saveSettings({ ...settings, backend_url: tempUrl.trim() });
      setIsEditingUrl(false);
      Alert.alert('Success', 'Backend URL updated. Restart the app if needed.');
    }
  };

  const handleChangePassword = async () => {
    if (!settings) return;

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Missing fields', 'Enter current password, new password, and confirmation.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    if (newPassword.trim().length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiService.changePassword(currentPassword, newPassword.trim());

      const sessionToken = `session:${newPassword.trim()}`;
      apiService.setAuthToken(sessionToken);
      await setAuthToken(sessionToken);

      await saveSettings({ ...settings, password: newPassword.trim() });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your admin password was updated on the server.');
    } catch (error: any) {
      Alert.alert('Password update failed', error?.message || 'Could not change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveProviders = async () => {
    if (!settings) return;
    setIsSavingProviders(true);

    try {
      const payload: {
        ai_provider: AiProvider;
        tts_provider: TtsProvider;
        ai_api_key?: string;
        tts_api_key?: string;
      } = {
        ai_provider: aiProvider,
        tts_provider: ttsProvider,
      };

      if (aiApiKey.trim()) payload.ai_api_key = aiApiKey.trim();
      if (ttsApiKey.trim()) payload.tts_api_key = ttsApiKey.trim();

      const updated = await apiService.updateServerSettings(payload);
      setAiProvider(updated.ai_provider);
      setTtsProvider(updated.tts_provider);
      setHasAiApiKey(updated.has_ai_api_key);
      setHasTtsApiKey(updated.has_tts_api_key);
      setAiApiKey('');
      setTtsApiKey('');

      await persistProviderState(updated);
      Alert.alert('Saved', 'AI/TTS provider settings have been saved to your server.');
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Could not save AI/TTS settings.');
    } finally {
      setIsSavingProviders(false);
    }
  };

  const clearServerKey = async (kind: 'ai' | 'tts') => {
    if (!settings) return;
    try {
      const payload = kind === 'ai' ? { ai_api_key: '' } : { tts_api_key: '' };
      const updated = await apiService.updateServerSettings(payload);
      setHasAiApiKey(updated.has_ai_api_key);
      setHasTtsApiKey(updated.has_tts_api_key);
      await persistProviderState(updated);
      Alert.alert('Cleared', `${kind.toUpperCase()} key removed from server.`);
    } catch (error: any) {
      Alert.alert('Clear failed', error?.message || 'Could not clear key.');
    }
  };

  const updateNotificationField = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    setNotificationPrefs((current) => ({ ...current, [key]: value }));
  };

  const handleSaveNotificationPrefs = async () => {
    setIsSavingNotificationPrefs(true);
    try {
      const updated = await apiService.updateNotificationPreferences(notificationPrefs);
      setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...updated });
      Alert.alert('Saved', 'Notification preferences updated.');
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Could not save notification settings.');
    } finally {
      setIsSavingNotificationPrefs(false);
    }
  };

  const handleRegisterPush = async () => {
    setIsRegisteringPush(true);
    try {
      const token = await pushNotificationsService.registerDeviceForPush();
      if (!token) {
        throw new Error('Could not register push token.');
      }
      await apiService.subscribePushToken(token);
      setPushToken(token);
      Alert.alert('Push enabled', 'This device is now subscribed for FinchWire alerts.');
    } catch (error: any) {
      Alert.alert('Push setup failed', error?.message || 'Could not enable push notifications.');
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const handleUnregisterPush = async () => {
    if (!pushToken) {
      Alert.alert('No token', 'No registered push token is stored on this device.');
      return;
    }
    try {
      await apiService.unsubscribePushToken(pushToken);
      await pushNotificationsService.clearStoredPushToken();
      setPushToken(null);
      Alert.alert('Push disabled', 'This device is unsubscribed from push alerts.');
    } catch (error: any) {
      Alert.alert('Disable failed', error?.message || 'Could not disable push notifications.');
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiService.logout();
          } catch {
            // Ignore logout errors
          }
          await clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const toggleWifiOnly = async (value: boolean) => {
    if (settings) {
      await saveSettings({ ...settings, wifi_only: value });
    }
  };

  const toggleAutoDelete = async (value: boolean) => {
    if (settings) {
      await saveSettings({ ...settings, auto_delete: value });
    }
  };

  const toggleHomeTile = async (tile: 'weather' | 'market' | 'verse', value: boolean) => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      home_tiles: {
        ...settings.home_tiles,
        [tile]: value,
      },
    });
  };

  const updateHomeWeatherUnit = async (unit: 'f' | 'c') => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      home_weather_unit: unit,
    });
  };

  const updateTrackedAsset = async (symbol: string, assetType: AssetType) => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      home_market_symbol: symbol,
      home_market_asset_type: assetType,
    });
  };

  const removeFollow = async (field: 'followed_topics' | 'followed_sources' | 'followed_creators', value: string) => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      [field]: (settings[field] || []).filter((entry) => entry !== value),
    });
  };

  const updateAppLockTimeout = async (timeout: AppLockTimeout) => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      app_lock_timeout: timeout,
    });
  };

  const applyDisableAppLock = async () => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      app_lock_enabled: false,
      app_lock_biometrics: false,
    });
    setLocked(false);
    resetPinFlowState();
  };

  const startDisableFlow = async () => {
    if (!settings) return;
    setAppLockError(null);

    if (settings.app_lock_biometrics) {
      try {
        const biometricResult = await appLockService.authenticateWithBiometrics('Disable FinchWire App Lock');
        if (biometricResult.success) {
          await applyDisableAppLock();
          Alert.alert('App Lock disabled', 'FinchWire no longer requires unlock on this device.');
          return;
        }
      } catch {
        // Fall through to PIN verification.
      }
    }

    setPinFlow('verify-disable');
  };

  const handleToggleAppLockEnabled = async (value: boolean) => {
    if (!settings) return;
    if (value) {
      if (!hasAppLockPin) {
        setPendingEnableAfterPinSetup(true);
        setPinFlow('setup');
        setAppLockError(null);
        Alert.alert('Create PIN first', 'Set a 4-6 digit PIN before enabling App Lock.');
        return;
      }
      await saveSettings({
        ...settings,
        app_lock_enabled: true,
      });
      setLocked(false); // keep current active session unlocked
      Alert.alert('App Lock enabled', 'FinchWire will require unlock on next lock event.');
      return;
    }
    await startDisableFlow();
  };

  const handleToggleBiometrics = async (value: boolean) => {
    if (!settings) return;
    setAppLockError(null);

    if (!value) {
      await saveSettings({
        ...settings,
        app_lock_biometrics: false,
      });
      return;
    }

    if (!hasAppLockPin) {
      setPinFlow('setup');
      Alert.alert('PIN required', 'Create a PIN first. Biometrics always requires PIN fallback.');
      return;
    }

    const biometricStatus = await appLockService.getBiometricStatus().catch(() => null);
    if (!biometricStatus?.available) {
      Alert.alert('Biometrics unavailable', 'This device does not support biometric unlock.');
      return;
    }
    if (!biometricStatus.enrolled) {
      Alert.alert('No biometrics enrolled', 'Enroll Face ID or fingerprint on this device, then try again.');
      return;
    }

    await saveSettings({
      ...settings,
      app_lock_biometrics: true,
    });
  };

  const handlePinSetup = async () => {
    const nextPin = newPinInput.trim();
    const confirmPin = confirmPinInput.trim();
    const validation = appLockService.validatePin(nextPin);
    if (!validation.valid) {
      setAppLockError(validation.error || 'Invalid PIN.');
      return;
    }
    if (validation.normalized !== appLockService.validatePin(confirmPin).normalized) {
      setAppLockError('PIN confirmation does not match.');
      return;
    }

    setIsAppLockBusy(true);
    try {
      await appLockService.setPin(validation.normalized);
      setHasAppLockPin(true);
      setGlobalHasPin(true);

      if (pendingEnableAfterPinSetup && settings) {
        await saveSettings({
          ...settings,
          app_lock_enabled: true,
        });
      }

      resetPinFlowState();
      Alert.alert('PIN saved', pendingEnableAfterPinSetup ? 'App Lock is now enabled.' : 'PIN fallback is ready.');
    } catch {
      setAppLockError('Could not save PIN securely on this device.');
    } finally {
      setIsAppLockBusy(false);
    }
  };

  const handlePinChange = async () => {
    const currentValidation = appLockService.validatePin(currentPinInput.trim());
    if (!currentValidation.valid) {
      setAppLockError('Enter your current PIN.');
      return;
    }

    const newValidation = appLockService.validatePin(newPinInput.trim());
    if (!newValidation.valid) {
      setAppLockError(newValidation.error || 'New PIN is invalid.');
      return;
    }
    if (newValidation.normalized !== appLockService.validatePin(confirmPinInput.trim()).normalized) {
      setAppLockError('New PIN confirmation does not match.');
      return;
    }

    setIsAppLockBusy(true);
    try {
      const isCurrentValid = await appLockService.verifyPin(currentValidation.normalized);
      if (!isCurrentValid) {
        setAppLockError('Current PIN is incorrect.');
        return;
      }
      await appLockService.setPin(newValidation.normalized);
      resetPinFlowState();
      Alert.alert('PIN updated', 'Your App Lock PIN has been changed.');
    } catch {
      setAppLockError('Unable to change PIN right now.');
    } finally {
      setIsAppLockBusy(false);
    }
  };

  const handleDisableViaPin = async () => {
    const validation = appLockService.validatePin(currentPinInput.trim());
    if (!validation.valid) {
      setAppLockError('Enter your PIN to disable App Lock.');
      return;
    }
    setIsAppLockBusy(true);
    try {
      const isValid = await appLockService.verifyPin(validation.normalized);
      if (!isValid) {
        setAppLockError('Incorrect PIN.');
        return;
      }
      await applyDisableAppLock();
      Alert.alert('App Lock disabled', 'FinchWire no longer requires unlock on this device.');
    } catch {
      setAppLockError('Unable to verify PIN right now.');
    } finally {
      setIsAppLockBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="server-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Backend URL</Text>
              {isEditingUrl ? (
                <View style={styles.urlEditRow}>
                  <TextInput
                    style={styles.urlInput}
                    value={tempUrl}
                    onChangeText={setTempUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://..."
                    placeholderTextColor={colors.textTertiary}
                  />
                  <TouchableOpacity onPress={handleSaveUrl} style={styles.saveIconButton}>
                    <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.urlDisplayRow}>
                  <Text style={styles.rowValue}>{settings?.backend_url}</Text>
                  <TouchableOpacity onPress={() => { setIsEditingUrl(true); setTempUrl(settings?.backend_url || ''); }}>
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Home Dashboard</Text>
        <View style={styles.card}>
          <Text style={styles.inlineLabel}>Smart Tiles</Text>
          <View style={styles.row}>
            <View style={styles.rowContentNoIcon}>
              <Text style={styles.rowLabel}>Weather Tile</Text>
              <Text style={styles.rowDescription}>Current temp + condition.</Text>
            </View>
            <Switch
              value={Boolean(settings?.home_tiles?.weather)}
              onValueChange={(value) => toggleHomeTile('weather', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.home_tiles?.weather ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowContentNoIcon}>
              <Text style={styles.rowLabel}>Market Tile</Text>
              <Text style={styles.rowDescription}>Track one stock/crypto on Home.</Text>
            </View>
            <Switch
              value={Boolean(settings?.home_tiles?.market)}
              onValueChange={(value) => toggleHomeTile('market', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.home_tiles?.market ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowContentNoIcon}>
              <Text style={styles.rowLabel}>Verse Tile</Text>
              <Text style={styles.rowDescription}>Daily Bible verse signal tile.</Text>
            </View>
            <Switch
              value={Boolean(settings?.home_tiles?.verse)}
              onValueChange={(value) => toggleHomeTile('verse', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.home_tiles?.verse ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.inlineLabel}>Temperature Unit</Text>
          <View style={styles.chipWrap}>
            <TouchableOpacity
              style={[
                styles.providerChip,
                settings?.home_weather_unit === 'f' && styles.providerChipActive,
              ]}
              onPress={() => updateHomeWeatherUnit('f')}
            >
              <Text
                style={[
                  styles.providerChipText,
                  settings?.home_weather_unit === 'f' && styles.providerChipTextActive,
                ]}
              >
                Fahrenheit (°F)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.providerChip,
                settings?.home_weather_unit === 'c' && styles.providerChipActive,
              ]}
              onPress={() => updateHomeWeatherUnit('c')}
            >
              <Text
                style={[
                  styles.providerChipText,
                  settings?.home_weather_unit === 'c' && styles.providerChipTextActive,
                ]}
              >
                Celsius (°C)
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inlineLabel}>Tracked Market Asset</Text>
          <View style={styles.chipWrap}>
            {HOME_MARKET_CHOICES.map((choice) => {
              const active = settings?.home_market_symbol === choice.symbol
                && settings?.home_market_asset_type === choice.assetType;
              return (
                <TouchableOpacity
                  key={`${choice.symbol}-${choice.assetType}`}
                  style={[styles.providerChip, active && styles.providerChipActive]}
                  onPress={() => updateTrackedAsset(choice.symbol, choice.assetType)}
                >
                  <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>
                    {choice.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.inlineLabel}>Followed Topics</Text>
          <View style={styles.chipWrap}>
            {(settings?.followed_topics || []).map((topic) => (
              <TouchableOpacity
                key={`topic-${topic}`}
                style={styles.removeChip}
                onPress={() => removeFollow('followed_topics', topic)}
              >
                <Text style={styles.removeChipText}>#{topic} ✕</Text>
              </TouchableOpacity>
            ))}
            {(settings?.followed_topics || []).length === 0 ? (
              <Text style={styles.rowDescription}>No topics followed yet.</Text>
            ) : null}
          </View>

          <Text style={styles.inlineLabel}>Followed Sources</Text>
          <View style={styles.chipWrap}>
            {(settings?.followed_sources || []).map((source) => (
              <TouchableOpacity
                key={`source-${source}`}
                style={styles.removeChip}
                onPress={() => removeFollow('followed_sources', source)}
              >
                <Text style={styles.removeChipText}>{source} ✕</Text>
              </TouchableOpacity>
            ))}
            {(settings?.followed_sources || []).length === 0 ? (
              <Text style={styles.rowDescription}>No sources followed yet.</Text>
            ) : null}
          </View>

          <Text style={styles.inlineLabel}>Followed Creators</Text>
          <View style={styles.chipWrap}>
            {(settings?.followed_creators || []).map((creator) => (
              <TouchableOpacity
                key={`creator-${creator}`}
                style={styles.removeChip}
                onPress={() => removeFollow('followed_creators', creator)}
              >
                <Text style={styles.removeChipText}>{creator} ✕</Text>
              </TouchableOpacity>
            ))}
            {(settings?.followed_creators || []).length === 0 ? (
              <Text style={styles.rowDescription}>No creators followed yet.</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Lock</Text>
        <View style={styles.card}>
          <Text style={styles.rowDescription}>
            Optional local device protection. Disabled by default.
          </Text>

          <View style={styles.row}>
            <View style={styles.rowContentNoIcon}>
              <Text style={styles.rowLabel}>Enable App Lock</Text>
              <Text style={styles.rowDescription}>Require unlock on app start/return.</Text>
            </View>
            <Switch
              value={Boolean(settings?.app_lock_enabled)}
              onValueChange={handleToggleAppLockEnabled}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.app_lock_enabled ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowContentNoIcon}>
              <Text style={styles.rowLabel}>Unlock with Biometrics</Text>
              <Text style={styles.rowDescription}>
                {biometricSummary}. PIN fallback always remains enabled.
              </Text>
            </View>
            <Switch
              value={Boolean(settings?.app_lock_biometrics)}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.app_lock_biometrics ? colors.primary : colors.textTertiary}
            />
          </View>

          <Text style={styles.inlineLabel}>Relock Timing</Text>
          <View style={styles.chipWrap}>
            {APP_LOCK_TIMEOUT_OPTIONS.map((option) => {
              const active = settings?.app_lock_timeout === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.providerChip, active && styles.providerChipActive]}
                  onPress={() => updateAppLockTimeout(option.value)}
                >
                  <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.appLockActions}>
            {!hasAppLockPin ? (
              <TouchableOpacity
                style={[styles.secondaryActionButton, styles.compactButton]}
                onPress={() => {
                  setPinFlow('setup');
                  setPendingEnableAfterPinSetup(false);
                  setAppLockError(null);
                }}
              >
                <Text style={styles.secondaryActionText}>Set PIN</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.secondaryActionButton, styles.compactButton]}
              onPress={() => {
                setPinFlow('change');
                setAppLockError(null);
              }}
              disabled={!hasAppLockPin}
            >
              <Text style={styles.secondaryActionText}>Change PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryActionButton, styles.compactButton]}
              onPress={startDisableFlow}
              disabled={!settings?.app_lock_enabled}
            >
              <Text style={styles.secondaryActionText}>Disable Lock</Text>
            </TouchableOpacity>
          </View>

          {pinFlow !== 'none' ? (
            <View style={styles.appLockPanel}>
              <Text style={styles.inlineLabel}>
                {pinFlow === 'setup'
                  ? 'Set PIN (4-6 digits)'
                  : pinFlow === 'change'
                    ? 'Change PIN'
                    : 'Verify PIN to Disable'}
              </Text>

              {(pinFlow === 'change' || pinFlow === 'verify-disable') ? (
                <>
                  <Text style={styles.inlineLabel}>Current PIN</Text>
                  <TextInput
                    style={styles.textInput}
                    value={currentPinInput}
                    onChangeText={(value) => setCurrentPinInput(value.replace(/\D/g, '').slice(0, 6))}
                    secureTextEntry
                    keyboardType="number-pad"
                    placeholder="Current PIN"
                    placeholderTextColor={colors.textTertiary}
                  />
                </>
              ) : null}

              {(pinFlow === 'setup' || pinFlow === 'change') ? (
                <>
                  <Text style={styles.inlineLabel}>New PIN</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newPinInput}
                    onChangeText={(value) => setNewPinInput(value.replace(/\D/g, '').slice(0, 6))}
                    secureTextEntry
                    keyboardType="number-pad"
                    placeholder="4 to 6 digits"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={styles.inlineLabel}>Confirm New PIN</Text>
                  <TextInput
                    style={styles.textInput}
                    value={confirmPinInput}
                    onChangeText={(value) => setConfirmPinInput(value.replace(/\D/g, '').slice(0, 6))}
                    secureTextEntry
                    keyboardType="number-pad"
                    placeholder="Re-enter PIN"
                    placeholderTextColor={colors.textTertiary}
                  />
                </>
              ) : null}

              {appLockError ? <Text style={styles.linkDanger}>{appLockError}</Text> : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.primaryActionButton, styles.compactButton, isAppLockBusy && styles.buttonDisabled]}
                  disabled={isAppLockBusy}
                  onPress={() => {
                    if (pinFlow === 'setup') {
                      void handlePinSetup();
                    } else if (pinFlow === 'change') {
                      void handlePinChange();
                    } else {
                      void handleDisableViaPin();
                    }
                  }}
                >
                  <Text style={styles.primaryActionText}>
                    {isAppLockBusy ? 'Working...' : pinFlow === 'verify-disable' ? 'Verify PIN' : 'Save PIN'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionButton, styles.compactButton]}
                  onPress={resetPinFlowState}
                >
                  <Text style={styles.secondaryActionText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <Text style={styles.inlineLabel}>Current Password</Text>
          <TextInput
            style={styles.textInput}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter current password"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.inlineLabel}>New Password</Text>
          <TextInput
            style={styles.textInput}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 8 characters"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.inlineLabel}>Confirm New Password</Text>
          <TextInput
            style={styles.textInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Re-enter new password"
            placeholderTextColor={colors.textTertiary}
          />

          <TouchableOpacity
            style={[styles.primaryActionButton, isChangingPassword && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={isChangingPassword}
          >
            <Text style={styles.primaryActionText}>
              {isChangingPassword ? 'Updating...' : 'Change Password'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI + Voice</Text>
        <View style={styles.card}>
          <Text style={styles.inlineLabel}>AI Provider</Text>
          <View style={styles.chipWrap}>
            {AI_PROVIDER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.providerChip,
                  aiProvider === option.value && styles.providerChipActive,
                ]}
                onPress={() => setAiProvider(option.value)}
              >
                <Text
                  style={[
                    styles.providerChipText,
                    aiProvider === option.value && styles.providerChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inlineLabel}>TTS Provider</Text>
          <View style={styles.chipWrap}>
            {TTS_PROVIDER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.providerChip,
                  ttsProvider === option.value && styles.providerChipActive,
                ]}
                onPress={() => setTtsProvider(option.value)}
              >
                <Text
                  style={[
                    styles.providerChipText,
                    ttsProvider === option.value && styles.providerChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inlineLabel}>AI API Key</Text>
          <TextInput
            style={styles.textInput}
            value={aiApiKey}
            onChangeText={setAiApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder={
              hasAiApiKey
                ? 'Key saved on server (enter new key to replace)'
                : 'Enter AI provider API key'
            }
            placeholderTextColor={colors.textTertiary}
          />
          <View style={styles.statusRow}>
            <Text style={styles.keyStatusText}>
              AI key status: {hasAiApiKey ? 'Saved on server' : 'Not set'}
            </Text>
            {hasAiApiKey ? (
              <TouchableOpacity onPress={() => clearServerKey('ai')}>
                <Text style={styles.linkDanger}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.inlineLabel}>TTS API Key</Text>
          <TextInput
            style={styles.textInput}
            value={ttsApiKey}
            onChangeText={setTtsApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder={
              hasTtsApiKey
                ? 'Key saved on server (enter new key to replace)'
                : 'Enter TTS provider API key'
            }
            placeholderTextColor={colors.textTertiary}
          />
          <View style={styles.statusRow}>
            <Text style={styles.keyStatusText}>
              TTS key status: {hasTtsApiKey ? 'Saved on server' : 'Not set'}
            </Text>
            {hasTtsApiKey ? (
              <TouchableOpacity onPress={() => clearServerKey('tts')}>
                <Text style={styles.linkDanger}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryActionButton, isSavingProviders && styles.buttonDisabled]}
            onPress={handleSaveProviders}
            disabled={isSavingProviders}
          >
            <Text style={styles.primaryActionText}>
              {isSavingProviders ? 'Saving...' : 'Save AI/TTS Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerts + Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Device Push Token</Text>
              <Text style={styles.rowDescription}>
                {pushToken ? 'Registered on this device' : 'Not registered'}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.primaryActionButton, styles.compactButton, isRegisteringPush && styles.buttonDisabled]}
              onPress={handleRegisterPush}
              disabled={isRegisteringPush}
            >
              <Text style={styles.primaryActionText}>
                {isRegisteringPush ? 'Registering...' : 'Enable Push'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryActionButton, styles.compactButton]}
              onPress={handleUnregisterPush}
            >
              <Text style={styles.secondaryActionText}>Disable Push</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Master Alerts</Text>
            <Switch
              value={Boolean(notificationPrefs.enabled)}
              onValueChange={(value) => updateNotificationField('enabled', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.enabled ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Breaking Stories</Text>
            <Switch
              value={Boolean(notificationPrefs.breakingStory)}
              onValueChange={(value) => updateNotificationField('breakingStory', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.breakingStory ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rising Stories</Text>
            <Switch
              value={Boolean(notificationPrefs.risingStory)}
              onValueChange={(value) => updateNotificationField('risingStory', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.risingStory ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Favorite Creator Live</Text>
            <Switch
              value={Boolean(notificationPrefs.creatorLive)}
              onValueChange={(value) => updateNotificationField('creatorLive', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.creatorLive ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Favorite Creator Uploads</Text>
            <Switch
              value={Boolean(notificationPrefs.creatorUpload)}
              onValueChange={(value) => updateNotificationField('creatorUpload', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.creatorUpload ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Only Highly Relevant</Text>
            <Switch
              value={Boolean(notificationPrefs.personalizedOnly)}
              onValueChange={(value) => updateNotificationField('personalizedOnly', value)}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={notificationPrefs.personalizedOnly ? colors.primary : colors.textTertiary}
            />
          </View>

          <Text style={styles.inlineLabel}>Quiet Hours Start (HH:MM)</Text>
          <TextInput
            style={styles.textInput}
            value={String(notificationPrefs.quietHoursStart || '')}
            onChangeText={(value) => updateNotificationField('quietHoursStart', value || null)}
            autoCapitalize="none"
            placeholder="22:00"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.inlineLabel}>Quiet Hours End (HH:MM)</Text>
          <TextInput
            style={styles.textInput}
            value={String(notificationPrefs.quietHoursEnd || '')}
            onChangeText={(value) => updateNotificationField('quietHoursEnd', value || null)}
            autoCapitalize="none"
            placeholder="07:00"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.inlineLabel}>Minimum Severity (0-100)</Text>
          <TextInput
            style={styles.textInput}
            value={String(notificationPrefs.minSeverity ?? 20)}
            onChangeText={(value) => updateNotificationField('minSeverity', Number(value) || 0)}
            keyboardType="numeric"
            placeholder="20"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.inlineLabel}>Daily Notification Cap</Text>
          <TextInput
            style={styles.textInput}
            value={String(notificationPrefs.dailyCap ?? 12)}
            onChangeText={(value) => updateNotificationField('dailyCap', Number(value) || 0)}
            keyboardType="numeric"
            placeholder="12"
            placeholderTextColor={colors.textTertiary}
          />

          <TouchableOpacity
            style={[styles.primaryActionButton, isSavingNotificationPrefs && styles.buttonDisabled]}
            onPress={handleSaveNotificationPrefs}
            disabled={isSavingNotificationPrefs}
          >
            <Text style={styles.primaryActionText}>
              {isSavingNotificationPrefs ? 'Saving...' : 'Save Notification Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Downloads</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="wifi-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Wi-Fi Only</Text>
              <Text style={styles.rowDescription}>Only download over Wi-Fi connection</Text>
            </View>
            <Switch
              value={settings?.wifi_only || false}
              onValueChange={toggleWifiOnly}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.wifi_only ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Ionicons name="trash-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Auto-Delete Old Files</Text>
              <Text style={styles.rowDescription}>
                Delete downloads not played in {settings?.retention_days || 30} days
              </Text>
            </View>
            <Switch
              value={settings?.auto_delete || false}
              onValueChange={toggleAutoDelete}
              trackColor={{ false: colors.surface, true: colors.primaryLight }}
              thumbColor={settings?.auto_delete ? colors.primary : colors.textTertiary}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>FinchWire</Text>
              <Text style={styles.rowValue}>Version 1.0.0</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>FinchWire Media Streaming</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowContentNoIcon: {
    flex: 1,
    marginLeft: 0,
  },
  rowLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  rowValue: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowDescription: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  inlineLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    marginBottom: spacing.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  primaryActionButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryActionText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.buttonText,
  },
  secondaryActionButton: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryActionText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  appLockActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  appLockPanel: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  compactButton: {
    flex: 1,
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  urlDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urlEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  urlInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveIconButton: {
    padding: 2,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  providerChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  providerChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDark,
  },
  providerChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  providerChipTextActive: {
    color: colors.buttonText,
  },
  removeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  removeChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  keyStatusText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  linkDanger: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: {
    ...typography.body,
    color: colors.error,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  footerText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
