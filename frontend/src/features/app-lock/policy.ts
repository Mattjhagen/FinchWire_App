import { AppLockTimeout } from '../../types';

export const APP_LOCK_TIMEOUT_OPTIONS: { value: AppLockTimeout; label: string }[] = [
  { value: 'immediate', label: 'Immediately on background' },
  { value: '1m', label: 'After 1 minute' },
  { value: '5m', label: 'After 5 minutes' },
];

export const getAppLockTimeoutMs = (policy: AppLockTimeout): number => {
  switch (policy) {
    case 'immediate':
      return 0;
    case '5m':
      return 5 * 60 * 1000;
    case '1m':
    default:
      return 60 * 1000;
  }
};

export const shouldRelockFromBackground = (
  policy: AppLockTimeout,
  lastBackgroundedAt: number,
  nowMs: number = Date.now()
): boolean => {
  const thresholdMs = getAppLockTimeoutMs(policy);
  if (thresholdMs <= 0) return true;
  const elapsedMs = Math.max(0, nowMs - lastBackgroundedAt);
  return elapsedMs >= thresholdMs;
};

export const normalizePin = (input: string): string => String(input || '').replace(/\D/g, '');

export const validatePin = (input: string): { valid: boolean; normalized: string; error?: string } => {
  const normalized = normalizePin(input);
  if (!normalized) {
    return { valid: false, normalized, error: 'PIN is required.' };
  }
  if (!/^\d{4,6}$/.test(normalized)) {
    return { valid: false, normalized, error: 'PIN must be 4 to 6 digits.' };
  }
  return { valid: true, normalized };
};
