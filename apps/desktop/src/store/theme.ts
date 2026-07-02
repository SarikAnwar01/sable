import { create } from 'zustand';
import type { ThemeMode } from '@shared';

const KEY = 'sable:theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Collapse 'system' to the OS's current scheme. */
function resolve(mode: ThemeMode): 'dark' | 'light' {
  return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
}

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
}

/**
 * Apply a theme everywhere at once:
 *  - `data-theme` on <html> flips the token layer for the chrome UI,
 *  - `nativeTheme` (via the bridge) makes Chromium report the matching
 *    prefers-color-scheme, so the sable://newtab page and sites follow along.
 * localStorage is only a fast-path for first paint; SQLite (via settings) is
 * the durable source of truth, hydrated in App at boot.
 */
function apply(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  document.documentElement.setAttribute('data-theme', resolve(mode));
  window.sable?.setTheme(mode);
}

interface ThemeStore {
  mode: ThemeMode;
  /** The concrete scheme in effect ('system' collapsed). */
  resolved: 'dark' | 'light';
  /** Apply without writing back to the settings DB (boot hydration). */
  hydrate: (mode: ThemeMode) => void;
  /** Apply + persist to the settings DB. */
  set: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>((set, get) => ({
  mode: initialMode(),
  resolved: resolve(initialMode()),
  hydrate: (mode) => {
    apply(mode);
    set({ mode, resolved: resolve(mode) });
  },
  set: (mode) => {
    get().hydrate(mode);
    window.sable?.setSettings({ theme: mode });
  },
  toggle: () => get().set(get().resolved === 'dark' ? 'light' : 'dark'),
}));

// Follow OS scheme changes while in 'system' mode.
media.addEventListener('change', () => {
  if (useTheme.getState().mode === 'system') useTheme.getState().hydrate('system');
});

// Sync the DOM + nativeTheme to the persisted choice on first load.
apply(useTheme.getState().mode);
