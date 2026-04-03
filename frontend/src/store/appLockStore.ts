import { create } from 'zustand';

interface AppLockState {
  initialized: boolean;
  isLocked: boolean;
  hasPin: boolean;
  lastBackgroundedAt: number | null;
  setInitialized: (value: boolean) => void;
  setLocked: (value: boolean) => void;
  setHasPin: (value: boolean) => void;
  markBackgrounded: (value: number) => void;
  resetSession: () => void;
}

export const useAppLockStore = create<AppLockState>((set) => ({
  initialized: false,
  isLocked: false,
  hasPin: false,
  lastBackgroundedAt: null,
  setInitialized: (value) => set({ initialized: value }),
  setLocked: (value) => set({ isLocked: value }),
  setHasPin: (value) => set({ hasPin: value }),
  markBackgrounded: (value) => set({ lastBackgroundedAt: value }),
  resetSession: () => set({ initialized: false, isLocked: false, hasPin: false, lastBackgroundedAt: null }),
}));
