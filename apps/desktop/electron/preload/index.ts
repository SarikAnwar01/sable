import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AdblockStats,
  type CreateTabOptions,
  type DownloadEntry,
  type SableBridge,
  type TabId,
  type TabState,
  type ViewportBounds,
} from '@shared';

/** Subscribe to a main->renderer channel; returns an unsubscribe fn. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: SableBridge = {
  createTab: (opts?: CreateTabOptions) => ipcRenderer.invoke(IPC.TabCreate, opts),
  closeTab: (id: TabId) => ipcRenderer.invoke(IPC.TabClose, id),
  activateTab: (id: TabId) => ipcRenderer.invoke(IPC.TabActivate, id),
  navigate: (id: TabId, input: string) => ipcRenderer.invoke(IPC.TabNavigate, { id, input }),
  goBack: (id: TabId) => ipcRenderer.invoke(IPC.TabGoBack, id),
  goForward: (id: TabId) => ipcRenderer.invoke(IPC.TabGoForward, id),
  reload: (id: TabId) => ipcRenderer.invoke(IPC.TabReload, id),
  stop: (id: TabId) => ipcRenderer.invoke(IPC.TabStop, id),
  suspendInactive: () => ipcRenderer.invoke(IPC.TabSuspendInactive),
  setSplit: (id: TabId | null) => ipcRenderer.invoke(IPC.TabSetSplit, id),
  showTabMenu: (id: TabId) => ipcRenderer.invoke(IPC.TabContextMenu, id),
  setViewportBounds: (b: ViewportBounds) => ipcRenderer.invoke(IPC.ViewportSetBounds, b),
  setContentOverlay: (on) => ipcRenderer.invoke(IPC.SetContentOverlay, on),
  setTheme: (mode) => ipcRenderer.invoke(IPC.SetTheme, mode),
  getTabs: () => ipcRenderer.invoke(IPC.StateGetTabs),
  getAdblockStats: () => ipcRenderer.invoke(IPC.AdblockGetStats),
  toggleAdblock: () => ipcRenderer.invoke(IPC.AdblockToggle),
  setSiteAllowed: (hostname, allowed) =>
    ipcRenderer.invoke(IPC.AdblockSetSite, { hostname, allowed }),
  getHeatmap: () => ipcRenderer.invoke(IPC.AdblockHeatmap),
  getHistory: (limit) => ipcRenderer.invoke(IPC.HistoryRecent, limit),
  searchHistory: (query) => ipcRenderer.invoke(IPC.HistorySearch, query),
  clearHistory: () => ipcRenderer.invoke(IPC.HistoryClear),
  listBookmarks: () => ipcRenderer.invoke(IPC.BookmarkList),
  toggleBookmark: (url, title) => ipcRenderer.invoke(IPC.BookmarkToggle, { url, title }),
  isBookmarked: (url) => ipcRenderer.invoke(IPC.BookmarkCheck, url),
  listDownloads: () => ipcRenderer.invoke(IPC.DownloadList),
  getSettings: () => ipcRenderer.invoke(IPC.SettingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
  onTabUpserted: (cb) => on<TabState>(IPC.TabUpserted, cb),
  onTabRemoved: (cb) => on<TabId>(IPC.TabRemoved, cb),
  onActiveTabChanged: (cb) => on<TabId | null>(IPC.ActiveTabChanged, cb),
  onFocusOmnibox: (cb) => on<void>(IPC.FocusOmnibox, () => cb()),
  onOpenCommandPalette: (cb) => on<void>(IPC.OpenCommandPalette, () => cb()),
  onOpenLibrary: (cb) => on<void>(IPC.OpenLibrary, () => cb()),
  onOpenSettings: (cb) => on<void>(IPC.OpenSettings, () => cb()),
  onToggleFocus: (cb) => on<void>(IPC.ToggleFocus, () => cb()),
  onAdblockStats: (cb) => on<AdblockStats>(IPC.AdblockStats, cb),
  onDownloadUpdated: (cb) => on<DownloadEntry>(IPC.DownloadUpdated, cb),
};

contextBridge.exposeInMainWorld('sable', bridge);
contextBridge.exposeInMainWorld('sableEnv', { platform: process.platform });
