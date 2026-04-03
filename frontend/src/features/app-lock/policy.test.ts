import { describe, expect, it } from 'vitest';
import { getAppLockTimeoutMs, shouldRelockFromBackground, validatePin } from './policy';

describe('app lock policy', () => {
  it('validates PIN rules (4-6 digits, numeric only)', () => {
    expect(validatePin('12').valid).toBe(false);
    expect(validatePin('1234567').valid).toBe(false);
    expect(validatePin('12ab').valid).toBe(false);
    expect(validatePin('1234').valid).toBe(true);
    expect(validatePin('123456').valid).toBe(true);
  });

  it('returns timeout ms for each policy', () => {
    expect(getAppLockTimeoutMs('immediate')).toBe(0);
    expect(getAppLockTimeoutMs('1m')).toBe(60_000);
    expect(getAppLockTimeoutMs('5m')).toBe(300_000);
  });

  it('locks immediately when policy is immediate', () => {
    expect(shouldRelockFromBackground('immediate', 1000, 1001)).toBe(true);
  });

  it('locks only after timeout threshold', () => {
    expect(shouldRelockFromBackground('1m', 10_000, 69_999)).toBe(false);
    expect(shouldRelockFromBackground('1m', 10_000, 70_000)).toBe(true);
    expect(shouldRelockFromBackground('5m', 10_000, 309_999)).toBe(false);
    expect(shouldRelockFromBackground('5m', 10_000, 310_000)).toBe(true);
  });
});
