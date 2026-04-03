/* eslint-disable import/first */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as localAuthentication from 'expo-local-authentication';

const secureStorage: Record<string, string> = {};
const fallbackStorage: Record<string, string> = {};

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => fallbackStorage[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      fallbackStorage[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete fallbackStorage[key];
    }),
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStorage[key] ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStorage[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete secureStorage[key];
  }),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: vi.fn(async (_algo: string, value: string) => {
    return createHash('sha256').update(value).digest('hex');
  }),
  getRandomBytes: vi.fn((size: number) => new Uint8Array(Array.from({ length: size }, (_, i) => i + 1))),
}));

vi.mock('expo-local-authentication', () => ({
  hasHardwareAsync: vi.fn(async () => true),
  isEnrolledAsync: vi.fn(async () => true),
  supportedAuthenticationTypesAsync: vi.fn(async () => [1]),
  authenticateAsync: vi.fn(async () => ({ success: true })),
}));

import { appLockService } from './appLockService';

describe('appLockService', () => {
  beforeEach(() => {
    Object.keys(secureStorage).forEach((key) => delete secureStorage[key]);
    Object.keys(fallbackStorage).forEach((key) => delete fallbackStorage[key]);
  });

  it('stores PIN as salted hash and verifies correctly', async () => {
    await appLockService.setPin('1234');

    const storedValues = Object.values(secureStorage);
    expect(storedValues.length).toBe(1);
    expect(storedValues[0]).not.toContain('1234');

    await expect(appLockService.verifyPin('1234')).resolves.toBe(true);
    await expect(appLockService.verifyPin('9999')).resolves.toBe(false);
  });

  it('reports PIN presence and clears pin', async () => {
    await expect(appLockService.hasPin()).resolves.toBe(false);
    await appLockService.setPin('123456');
    await expect(appLockService.hasPin()).resolves.toBe(true);
    await appLockService.clearPin();
    await expect(appLockService.hasPin()).resolves.toBe(false);
  });

  it('returns biometric auth failure when not enrolled', async () => {
    vi.mocked(localAuthentication.isEnrolledAsync).mockResolvedValueOnce(false);
    const result = await appLockService.authenticateWithBiometrics();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No biometrics are enrolled');
  });
});
