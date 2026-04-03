import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { validatePin } from '../features/app-lock/policy';

const APP_LOCK_PIN_KEY = 'finchwire.app_lock.pin.v1';
const APP_LOCK_FALLBACK_PIN_KEY = 'finchwire.app_lock.pin.fallback.v1';

type StoredPinSecret = {
  hash: string;
  salt: string;
  updatedAt: string;
  version: number;
};

export type BiometricStatus = {
  available: boolean;
  enrolled: boolean;
  authenticationTypes: LocalAuthentication.AuthenticationType[];
};

export type BiometricAuthResult = {
  success: boolean;
  error?: string;
  warning?: string;
};

const toHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
};

const digestPin = async (pin: string, salt: string): Promise<string> => {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}:finchwire-app-lock`
  );
};

const readSecretRaw = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(APP_LOCK_FALLBACK_PIN_KEY);
  }
  try {
    return await SecureStore.getItemAsync(APP_LOCK_PIN_KEY);
  } catch {
    return AsyncStorage.getItem(APP_LOCK_FALLBACK_PIN_KEY);
  }
};

const writeSecretRaw = async (value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(APP_LOCK_FALLBACK_PIN_KEY, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(APP_LOCK_PIN_KEY, value);
    await AsyncStorage.removeItem(APP_LOCK_FALLBACK_PIN_KEY);
  } catch {
    await AsyncStorage.setItem(APP_LOCK_FALLBACK_PIN_KEY, value);
  }
};

const clearSecretRaw = async (): Promise<void> => {
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(APP_LOCK_PIN_KEY);
    } catch {
      // no-op; fallback is still cleared below
    }
  }
  await AsyncStorage.removeItem(APP_LOCK_FALLBACK_PIN_KEY);
};

const parseStoredSecret = (raw: string | null): StoredPinSecret | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPinSecret;
    if (!parsed?.hash || !parsed?.salt) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const appLockService = {
  validatePin,

  async hasPin(): Promise<boolean> {
    const secret = parseStoredSecret(await readSecretRaw());
    return Boolean(secret?.hash && secret?.salt);
  },

  async setPin(pin: string): Promise<void> {
    const validation = validatePin(pin);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid PIN');
    }
    const saltBytes = Crypto.getRandomBytes(16);
    const salt = toHex(saltBytes);
    const hash = await digestPin(validation.normalized, salt);
    const payload: StoredPinSecret = {
      hash,
      salt,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    await writeSecretRaw(JSON.stringify(payload));
  },

  async verifyPin(pin: string): Promise<boolean> {
    const validation = validatePin(pin);
    if (!validation.valid) return false;
    const secret = parseStoredSecret(await readSecretRaw());
    if (!secret) return false;
    const computed = await digestPin(validation.normalized, secret.salt);
    return computed === secret.hash;
  },

  async clearPin(): Promise<void> {
    await clearSecretRaw();
  },

  async getBiometricStatus(): Promise<BiometricStatus> {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return {
      available,
      enrolled,
      authenticationTypes: types,
    };
  },

  async authenticateWithBiometrics(promptMessage = 'Unlock FinchWire'): Promise<BiometricAuthResult> {
    const status = await this.getBiometricStatus();
    if (!status.available) {
      return { success: false, error: 'Biometrics are not available on this device.' };
    }
    if (!status.enrolled) {
      return { success: false, error: 'No biometrics are enrolled on this device.' };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return {
      success: result.success,
      error: 'error' in result ? result.error : undefined,
      warning: 'warning' in result ? result.warning : undefined,
    };
  },
};
