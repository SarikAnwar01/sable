import { create } from 'zustand';

/** Which full-content overlay is showing (hides the web view when not 'none'). */
export type Overlay = 'none' | 'adblock' | 'library' | 'settings';

interface UiStore {
  overlay: Overlay;
  paletteOpen: boolean;
  /** Focus mode: hide all chrome, pure full-window web (⌘⇧F). */
  focus: boolean;
  setOverlay: (overlay: Overlay) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleFocus: () => void;
}

export const useUi = create<UiStore>((set) => ({
  overlay: 'none',
  paletteOpen: false,
  focus: false,
  setOverlay: (overlay) => set({ overlay }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
}));
