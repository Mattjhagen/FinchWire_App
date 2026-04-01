// Login Screen
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { apiService } from '../../src/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const { setAuthToken } = useAuthStore();
  const { settings } = useSettingsStore();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Attempting login to:', settings?.backend_url);
      const response = await apiService.login(password);
      console.log('Login response:', response);
      
      if (response.success) {
        await setAuthToken(password);
        apiService.setAuthToken(password);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Login Failed', response.error || 'Invalid password');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Error', 
        error?.message || 'Failed to connect to server. Please check:\n\n1. Backend URL is correct\n2. Server is running\n3. Network connection is active'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="play-circle" size={80} color={colors.primary} />
          </View>
          <Text style={styles.title}>FinchWire</Text>
          <Text style={styles.subtitle}>
            {settings?.backend_url || 'Media Server'}
          </Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
  },
});
