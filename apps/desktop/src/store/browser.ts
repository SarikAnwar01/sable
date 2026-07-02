import { create } from 'zustand';
import type { TabId, TabState } from '@shared';

/**
 * Mirror of the main process's tab state. The renderer is a pure projection:
 * it never owns truth, it just reflects TabUpserted / TabRemoved / active
 * events and sends intents back over the bridge.
 */
interface BrowserStore {
  tabs: TabState[];
  activeId: TabId | null;
  upsert: (tab: TabState) => void;
  remove: (id: TabId) => void;
  setActive: (id: TabId | null) => void;
  setAll: (tabs: TabState[], activeId: TabId | null) => void;
}

export const useBrowser = create<BrowserStore>((set) => ({
  tabs: [],
  activeId: null,
  upsert: (tab) =>
    set((s) => {
      const i = s.tabs.findIndex((t) => t.id === tab.id);
      if (i === -1) return { tabs: [...s.tabs, tab] };
      const next = s.tabs.slice();
      next[i] = tab;
      return { tabs: next };
    }),
  remove: (id) =>
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),
  setActive: (id) => set({ activeId: id }),
  setAll: (tabs, activeId) => set({ tabs, activeId }),
}));
