/**
 * Sable shared contracts.
 *
 * Single source of truth shared across the desktop main/preload/renderer today,
 * and — by design — the Phase 2 Rust/Axum sync backend and future mobile clients.
 * Keep this runtime-light: types + pure functions + constants only. No Node,
 * Electron, or DOM imports so every target can consume it.
 */

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type TabId = string;

/** Serializable snapshot of a tab, sent main -> renderer on every change. */
export interface TabState {
  id: TabId;
  url: string;
  title: string;
  favicon: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPrivate: boolean;
  /** True when the tab's renderer has been discarded to save memory. */
  isSuspended: boolean;
  /** True when the tab is showing as the right pane of a split view. */
  isSplit: boolean;
  /** Phase 2: feeds the ad-block dashboard. */
  blockedCount: number;
}

export interface CreateTabOptions {
  url?: string;
  isPrivate?: boolean;
  /** Default true. */
  activate?: boolean;
}

/** Content-area rectangle (CSS px, relative to the window content view). */
export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// IPC channel names — kept here so main/preload/renderer can never drift.
// ---------------------------------------------------------------------------

export const IPC = {
  // renderer -> main (invoke)
  TabCreate: 'sable:tab:create',
  TabClose: 'sable:tab:close',
  TabActivate: 'sable:tab:activate',
  TabNavigate: 'sable:tab:navigate',
  TabGoBack: 'sable:tab:go-back',
  TabGoForward: 'sable:tab:go-forward',
  TabReload: 'sable:tab:reload',
  TabStop: 'sable:tab:stop',
  TabSuspendInactive: 'sable:tab:suspend-inactive',
  TabSetSplit: 'sable:tab:set-split',
  TabContextMenu: 'sable:tab:context-menu',
  ViewportSetBounds: 'sable:viewport:set-bounds',
  SetContentOverlay: 'sable:viewport:overlay',
  StateGetTabs: 'sable:state:get-tabs',
  SetTheme: 'sable:theme:set',
  AdblockGetStats: 'sable:adblock:get',
  AdblockToggle: 'sable:adblock:toggle',
  AdblockSetSite: 'sable:adblock:set-site',
  AdblockHeatmap: 'sable:adblock:heatmap',
  HistoryRecent: 'sable:history:recent',
  HistorySearch: 'sable:history:search',
  HistoryClear: 'sable:history:clear',
  BookmarkList: 'sable:bookmark:list',
  BookmarkToggle: 'sable:bookmark:toggle',
  BookmarkCheck: 'sable:bookmark:check',
  DownloadList: 'sable:download:list',
  SettingsGet: 'sable:settings:get',
  SettingsSet: 'sable:settings:set',
  // main -> renderer (send)
  AdblockStats: 'sable:adblock:stats',
  DownloadUpdated: 'sable:download:updated',
  TabUpserted: 'sable:tab:upserted',
  TabRemoved: 'sable:tab:removed',
  ActiveTabChanged: 'sable:tab:active-changed',
  FocusOmnibox: 'sable:ui:focus-omnibox',
  OpenCommandPalette: 'sable:ui:command-palette',
  OpenLibrary: 'sable:ui:open-library',
  OpenSettings: 'sable:ui:open-settings',
  ToggleFocus: 'sable:ui:toggle-focus',
} as const;

// ---------------------------------------------------------------------------
// Settings (Phase 2: synced)
// ---------------------------------------------------------------------------

export type ThemeMode = 'system' | 'light' | 'dark';
export type SearchEngineId = 'duckduckgo' | 'brave' | 'google' | 'bing';

export interface SableSettings {
  theme: ThemeMode;
  searchEngine: SearchEngineId;
  adblockEnabled: boolean;
  homeUrl: string;
  /** Local profile display name (cloud sign-in arrives with sync in Phase 2). */
  profileName: string;
}

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; query: string }> = {
  duckduckgo: { name: 'DuckDuckGo', query: 'https://duckduckgo.com/?q=%s' },
  brave: { name: 'Brave', query: 'https://search.brave.com/search?q=%s' },
  google: { name: 'Google', query: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', query: 'https://www.bing.com/search?q=%s' },
};

/** Internal page served by the custom `sable://` protocol (see main/newtab.ts). */
export const NEWTAB_URL = 'sable://newtab';

/**
 * Session partitions. Normal tabs share a persistent session; private tabs share
 * one ephemeral session (no `persist:` prefix => in-memory, cleared on quit).
 * The `sable://` protocol handler must be installed on each of these.
 */
export const PERSIST_PARTITION = 'persist:sable';
export const PRIVATE_PARTITION = 'sable-private';

export const DEFAULT_SETTINGS: SableSettings = {
  theme: 'system',
  searchEngine: 'google',
  adblockEnabled: true,
  homeUrl: NEWTAB_URL,
  profileName: 'Guest',
};

// ---------------------------------------------------------------------------
// Omnibox: decide whether input is a URL to open or a search query.
// Pure + shared so main and renderer agree on behaviour.
// ---------------------------------------------------------------------------

export function resolveOmnibox(input: string, engine: SearchEngineId): string {
  const text = input.trim();
  if (!text) return DEFAULT_SETTINGS.homeUrl;

  // Explicit scheme -> pass through.
  if (/^(https?|file|about|sable):/i.test(text)) return text;

  // localhost / localhost:port
  if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`;

  // Bare IPv4 with optional port/path.
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text)) return `http://${text}`;

  // Looks like a domain: single token containing a dot and a plausible TLD.
  const looksLikeDomain = !/\s/.test(text) && /^[^\s]+\.[^\s.]{2,}$/.test(text);
  if (looksLikeDomain) return `https://${text}`;

  return SEARCH_ENGINES[engine].query.replace('%s', encodeURIComponent(text));
}

// ---------------------------------------------------------------------------
// Ad / tracker blocker (M2)
// ---------------------------------------------------------------------------

export interface AdblockDomain {
  domain: string;
  count: number;
}

export interface AdblockStats {
  enabled: boolean;
  /** Total requests blocked this session. */
  blocked: number;
  /** Estimated bytes not downloaded (blocked resources are never fetched). */
  dataSaved: number;
  /** Most-blocked domains this session, descending. */
  topDomains: AdblockDomain[];
  /** Hostnames the user has allow-listed (blocking off there). Persisted. */
  whitelist: string[];
}

// ---------------------------------------------------------------------------
// Local storage (M3) — history, bookmarks, downloads
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  visitedAt: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

export interface DownloadEntry {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: DownloadState;
  startedAt: number;
}

/** One day's blocked totals — feeds the contribution-graph heatmap. */
export interface DailyBlock {
  day: string; // YYYY-MM-DD
  blocked: number;
}

// ---------------------------------------------------------------------------
// Sync DTOs (Phase 2 contract — Rust/Axum implements this schema)
// Offline-first: every record carries updatedAt + a tombstone for LWW merge.
// ---------------------------------------------------------------------------

export interface SyncRecord<T> {
  id: string;
  /** epoch ms */
  updatedAt: number;
  deleted: boolean;
  payload: T;
}

export interface BookmarkPayload {
  title: string;
  url: string;
  folderId: string | null;
}

export interface HistoryPayload {
  url: string;
  title: string;
  visitedAt: number;
}

// ---------------------------------------------------------------------------
// The bridge surface exposed to the renderer via contextBridge.
// Implemented in preload, consumed as `window.sable` in the renderer.
// ---------------------------------------------------------------------------

export interface SableBridge {
  createTab(opts?: CreateTabOptions): Promise<TabId>;
  closeTab(id: TabId): Promise<void>;
  activateTab(id: TabId): Promise<void>;
  navigate(id: TabId, input: string): Promise<void>;
  goBack(id: TabId): Promise<void>;
  goForward(id: TabId): Promise<void>;
  reload(id: TabId): Promise<void>;
  stop(id: TabId): Promise<void>;
  suspendInactive(): Promise<void>;
  /** Show `id` as the right pane of a split view; null closes the split. */
  setSplit(id: TabId | null): Promise<void>;
  /** Pop the native context menu for a sidebar tab row. */
  showTabMenu(id: TabId): Promise<void>;
  setViewportBounds(b: ViewportBounds): Promise<void>;
  setContentOverlay(on: boolean): Promise<void>;
  setTheme(mode: ThemeMode): Promise<void>;
  getTabs(): Promise<{ tabs: TabState[]; activeId: TabId | null }>;
  getAdblockStats(): Promise<AdblockStats>;
  toggleAdblock(): Promise<AdblockStats>;
  /** allowed=true allow-lists the host (blocking off there); false re-blocks it. */
  setSiteAllowed(hostname: string, allowed: boolean): Promise<AdblockStats>;
  onAdblockStats(cb: (stats: AdblockStats) => void): () => void;
  getHeatmap(): Promise<DailyBlock[]>;
  // storage
  getHistory(limit?: number): Promise<HistoryEntry[]>;
  searchHistory(query: string): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  listBookmarks(): Promise<Bookmark[]>;
  /** Toggle a bookmark for the URL; resolves to the new bookmarked state. */
  toggleBookmark(url: string, title: string): Promise<boolean>;
  isBookmarked(url: string): Promise<boolean>;
  listDownloads(): Promise<DownloadEntry[]>;
  onDownloadUpdated(cb: (download: DownloadEntry) => void): () => void;
  getSettings(): Promise<SableSettings>;
  setSettings(patch: Partial<SableSettings>): Promise<SableSettings>;
  onTabUpserted(cb: (tab: TabState) => void): () => void;
  onTabRemoved(cb: (id: TabId) => void): () => void;
  onActiveTabChanged(cb: (id: TabId | null) => void): () => void;
  onFocusOmnibox(cb: () => void): () => void;
  onOpenCommandPalette(cb: () => void): () => void;
  onOpenLibrary(cb: () => void): () => void;
  onOpenSettings(cb: () => void): () => void;
  onToggleFocus(cb: () => void): () => void;
}
