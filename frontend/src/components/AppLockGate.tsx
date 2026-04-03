import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appLockService } from '../services/appLockService';
import { borderRadius, colors, spacing, typography } from '../utils/theme';

interface AppLockGateProps {
  biometricsEnabled: boolean;
  onUnlock: () => void;
}

export function AppLockGate({ biometricsEnabled, onUnlock }: AppLockGateProps) {
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [hasAutoPrompted, setHasAutoPrompted] = React.useState(false);

  const tryBiometric = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await appLockService.authenticateWithBiometrics();
      if (result.success) {
        onUnlock();
        return;
      }
      setError(result.error || 'Biometric unlock failed. Enter PIN to continue.');
    } catch {
      setError('Biometric unlock unavailable. Enter your PIN.');
    } finally {
      setIsBusy(false);
    }
  }, [onUnlock]);

  React.useEffect(() => {
    if (!biometricsEnabled || hasAutoPrompted) return;
    setHasAutoPrompted(true);
    void tryBiometric();
  }, [biometricsEnabled, hasAutoPrompted, tryBiometric]);

  const submitPin = async () => {
    const validation = appLockService.validatePin(pin);
    if (!validation.valid) {
      setError(validation.error || 'Invalid PIN');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const isValid = await appLockService.verifyPin(validation.normalized);
      if (!isValid) {
        setError('Incorrect PIN. Please try again.');
        return;
      }
      setPin('');
      onUnlock();
    } catch {
      setError('Unable to verify PIN right now. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="lock-closed" size={30} color={colors.primary} />
          <Text style={styles.title}>FinchWire Locked</Text>
          <Text style={styles.subtitle}>Unlock with biometrics or your PIN.</Text>
        </View>

        {biometricsEnabled ? (
          <TouchableOpacity style={styles.biometricButton} onPress={tryBiometric} disabled={isBusy}>
            <Ionicons name="finger-print-outline" size={18} color={colors.buttonText} />
            <Text style={styles.biometricButtonText}>Use Biometrics</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.pinLabel}>PIN (4-6 digits)</Text>
        <TextInput
          value={pin}
          onChangeText={(value) => {
            setPin(value.replace(/\D/g, '').slice(0, 6));
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          style={styles.pinInput}
          placeholder="••••"
          placeholderTextColor={colors.textTertiary}
          editable={!isBusy}
          onSubmitEditing={submitPin}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.unlockButton} onPress={submitPin} disabled={isBusy}>
          {isBusy ? <ActivityIndicator size="small" color={colors.buttonText} /> : null}
          <Text style={styles.unlockButtonText}>{isBusy ? 'Verifying...' : 'Unlock'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    backgroundColor: '#020305',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLight,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  biometricButtonText: {
    ...typography.bodySmall,
    color: colors.buttonText,
    fontWeight: '700',
  },
  pinLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  pinInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 22,
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  unlockButtonText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
});
