# FinchWire App Lock

FinchWire now supports an **optional App Lock** for local device protection.

## What It Does

- Disabled by default.
- When enabled, the app requires unlock:
  - on cold start, and
  - after returning from background based on timeout policy.
- Unlock methods:
  - Biometrics (optional), plus
  - PIN fallback (required whenever biometrics are enabled).

## Settings

The App Lock section lives in:

- `/frontend/app/(tabs)/settings.tsx`

User controls:

- `Enable App Lock`
- `Unlock with Biometrics`
- `Relock Timing`
  - Immediate
  - 1 minute
  - 5 minutes
- `Set PIN` / `Change PIN`
- `Disable Lock` (requires biometric or PIN verification if lock is active)

## Storage and Security

Service implementation:

- `/frontend/src/services/appLockService.ts`

Security model:

- PIN is validated as numeric `4-6` digits.
- PIN is **not stored in plaintext**.
- Stored secret uses:
  - random salt
  - SHA-256 hash of `salt + pin + app-specific pepper string`
- Native secure storage:
  - iOS Keychain / Android Keystore via `expo-secure-store`
- Web or secure-store failure fallback:
  - AsyncStorage fallback path (best effort, lower security than secure store)

## Lock Session Behavior

Policy logic:

- `/frontend/src/features/app-lock/policy.ts`

Session state:

- `/frontend/src/store/appLockStore.ts`

Lifecycle behavior:

- App maintains unlocked session while active.
- On background transition, timestamp is saved.
- On foreground:
  - relock happens only if timeout threshold is met.
- Immediate policy relocks as soon as app backgrounds.

## Biometrics Unavailable Behavior

If biometrics are unsupported, not enrolled, or canceled:

- user is shown clear status/error messaging
- PIN fallback remains available
- user is never forced into biometric-only unlock

## Root Gate Architecture

Central lock enforcement is in:

- `/frontend/app/_layout.tsx`
- `/frontend/src/components/AppLockGate.tsx`

Protected content is blocked by a full-screen gate until unlock succeeds.

## Tests

Added tests:

- `/frontend/src/features/app-lock/policy.test.ts`
- `/frontend/src/services/appLockService.test.ts`

Coverage includes:

- PIN validation
- timeout policy evaluation
- secure hashed PIN verification
- biometric unavailable/not-enrolled branch behavior

## Known Limitations

- Secure storage fallback to AsyncStorage is less secure than native keychain/keystore.
- No hard lockout policy after repeated failed PIN attempts yet.
- No remote reset flow (this lock is local-device scope only).
- Biometric prompt messaging behavior can vary by OEM/Android version.
