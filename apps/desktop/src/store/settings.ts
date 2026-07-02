import { create } from 'zustand';
import { DEFAULT_SETTINGS, type SableSettings } from '@shared';

/**
 * Renderer mirror of the main-process settings (SQLite-backed). Hydrated once
 * at boot; `update` round-trips through main so the DB stays source of truth.
 */
interface SettingsStore {
  settings: SableSettings;
  set: (settings: SableSettings) => void;
  update: (patch: Partial<SableSettings>) => Promise<void>;
}

export const useSettings = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  set: (settings) => set({ settings }),
  update: async (patch) => {
    const next = await window.sable.setSettings(patch);
    if (next) set({ settings: next });
  },
}));
