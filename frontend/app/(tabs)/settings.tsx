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
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { apiService } from '../../src/services/api';

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearAuth } = useAuthStore();
  const { settings, saveSettings } = useSettingsStore();
  const [isEditingUrl, setIsEditingUrl] = React.useState(false);
  const [tempUrl, setTempUrl] = React.useState(settings?.backend_url || '');

  const handleSaveUrl = async () => {
    if (settings && tempUrl.trim()) {
      const trimmedUrl = tempUrl.trim();
      await saveSettings({ ...settings, backend_url: trimmedUrl });
      apiService.setBaseUrl(trimmedUrl);
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setIsEditingUrl(false);
      Alert.alert('Success', 'Backend URL updated');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.logout();
            } catch (error) {
              // Ignore logout errors
            }
            await clearAuth();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
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

  return (
    <ScrollView style={styles.container}>
      {/* Server Info */}
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

      {/* Download Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Downloads</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="wifi-outline" size={24} color={colors.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Wi-Fi Only</Text>
              <Text style={styles.rowDescription}>
                Only download over Wi-Fi connection
              </Text>
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

      {/* About */}
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

      {/* Logout */}
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
