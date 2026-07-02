import { ipcMain, nativeTheme } from 'electron';
import {
  IPC,
  type CreateTabOptions,
  type SableSettings,
  type TabId,
  type ThemeMode,
  type ViewportBounds,
} from '@shared';
import type { TabManager } from '../tabs/TabManager';
import type { AdBlocker } from '../adblock/AdBlocker';
import type { Storage } from '../storage/Storage';
import type { AppSettings } from '../settings/AppSettings';

/**
 * Wire every renderer intent to the TabManager. Handlers resolve dependencies
 * lazily so IPC can be registered once at app start, before any window exists.
 */
export function registerIpc(
  getManager: () => TabManager | null,
  getAdblocker: () => AdBlocker | null,
  getStorage: () => Storage | null,
  getAppSettings: () => AppSettings | null,
): void {
  const tm = (): TabManager => {
    const m = getManager();
    if (!m) throw new Error('TabManager not ready');
    return m;
  };
  const st = () => getStorage();

  ipcMain.handle(IPC.TabCreate, (_e, opts: CreateTabOptions) => tm().createTab(opts ?? {}));
  ipcMain.handle(IPC.TabClose, (_e, id: TabId) => tm().closeTab(id));
  ipcMain.handle(IPC.TabActivate, (_e, id: TabId) => tm().activateTab(id));
  ipcMain.handle(IPC.TabNavigate, (_e, p: { id: TabId; input: string }) =>
    tm().navigate(p.id, p.input),
  );
  ipcMain.handle(IPC.TabGoBack, (_e, id: TabId) => tm().goBack(id));
  ipcMain.handle(IPC.TabGoForward, (_e, id: TabId) => tm().goForward(id));
  ipcMain.handle(IPC.TabReload, (_e, id: TabId) => tm().reload(id));
  ipcMain.handle(IPC.TabStop, (_e, id: TabId) => tm().stop(id));
  ipcMain.handle(IPC.TabSuspendInactive, () => tm().suspendInactive());
  ipcMain.handle(IPC.TabSetSplit, (_e, id: TabId | null) => tm().setSplit(id));
  ipcMain.handle(IPC.TabContextMenu, (_e, id: TabId) => tm().tabContextMenu(id));
  ipcMain.handle(IPC.ViewportSetBounds, (_e, b: ViewportBounds) => tm().setBounds(b));
  ipcMain.handle(IPC.SetContentOverlay, (_e, on: boolean) => tm().setOverlay(on));
  ipcMain.handle(IPC.StateGetTabs, () => tm().getAll());

  // Drive Chromium's reported color scheme so web content (incl. the new-tab
  // page) matches the chrome theme.
  ipcMain.handle(IPC.SetTheme, (_e, mode: ThemeMode) => {
    nativeTheme.themeSource = mode;
  });

  // Ad / tracker blocker.
  ipcMain.handle(IPC.AdblockGetStats, () => getAdblocker()?.getStats() ?? null);
  ipcMain.handle(IPC.AdblockToggle, () => {
    const stats = getAdblocker()?.toggle() ?? null;
    if (stats) getAppSettings()?.update({ adblockEnabled: stats.enabled });
    return stats;
  });
  ipcMain.handle(
    IPC.AdblockSetSite,
    (_e, p: { hostname: string; allowed: boolean }) => {
      const stats = getAdblocker()?.setSiteAllowed(p.hostname, p.allowed) ?? null;
      tm().reloadActive(); // apply the change to the current page immediately
      return stats;
    },
  );
  ipcMain.handle(IPC.AdblockHeatmap, () => st()?.heatmap() ?? []);

  // Storage: history, bookmarks, downloads.
  ipcMain.handle(IPC.HistoryRecent, (_e, limit?: number) => st()?.recentHistory(limit) ?? []);
  ipcMain.handle(IPC.HistorySearch, (_e, query: string) => st()?.searchHistory(query) ?? []);
  ipcMain.handle(IPC.HistoryClear, () => st()?.clearHistory());
  ipcMain.handle(IPC.BookmarkList, () => st()?.listBookmarks() ?? []);
  ipcMain.handle(IPC.BookmarkToggle, (_e, p: { url: string; title: string }) =>
    st()?.toggleBookmark(p.url, p.title) ?? false,
  );
  ipcMain.handle(IPC.BookmarkCheck, (_e, url: string) => st()?.isBookmarked(url) ?? false);
  ipcMain.handle(IPC.DownloadList, () => st()?.listDownloads() ?? []);

  // Settings. A changed adblockEnabled also flips the live blocker.
  ipcMain.handle(IPC.SettingsGet, () => getAppSettings()?.all ?? null);
  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<SableSettings>) => {
    const settings = getAppSettings();
    if (!settings) return null;
    const next = settings.update(patch);
    if (patch.adblockEnabled !== undefined) getAdblocker()?.setEnabled(patch.adblockEnabled);
    return next;
  });
}
