import {
  BrowserWindow,
  Menu,
  WebContentsView,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { showPageContextMenu } from './contextMenu';
import {
  IPC,
  DEFAULT_SETTINGS,
  PERSIST_PARTITION,
  PRIVATE_PARTITION,
  resolveOmnibox,
  type TabId,
  type TabState,
  type CreateTabOptions,
  type ViewportBounds,
} from '@shared';
import type { Storage } from '../storage/Storage';
import type { AppSettings } from '../settings/AppSettings';

interface ManagedTab {
  id: TabId;
  isPrivate: boolean;
  /** Kept in sync from the webContents so it survives suspension. */
  url: string;
  title: string;
  favicon: string | null;
  blockedCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  /** null while suspended (renderer discarded). */
  view: WebContentsView | null;
  suspended: boolean;
  lastActiveAt: number;
}

const SUSPEND_AFTER_MS = 10 * 60 * 1000; // discard tabs idle longer than this
const SWEEP_INTERVAL_MS = 30 * 1000;

/**
 * Owns every open tab. Each active tab is a Chromium WebContentsView (its own
 * renderer process) layered over the React "chrome" UI. Inactive tabs are
 * *suspended* — their renderer is destroyed to free memory, and the tab's
 * url/title/favicon are kept so it can be recreated on focus. (Back/forward
 * history is not preserved across suspension on this Electron version.)
 */
export class TabManager {
  private readonly tabs = new Map<TabId, ManagedTab>();
  private order: TabId[] = [];
  private activeId: TabId | null = null;
  private bounds: ViewportBounds = { x: 0, y: 0, width: 0, height: 0 };
  private overlay = false;
  /** Tab shown as the right pane of a split view (active tab is the left). */
  private splitId: TabId | null = null;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly win: BrowserWindow,
    private readonly storage: Storage | null,
    private readonly getSettings: () => AppSettings | null = () => null,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  // -- lifecycle ------------------------------------------------------------

  createTab(opts: CreateTabOptions = {}): TabId {
    const id = randomUUID();
    const tab: ManagedTab = {
      id,
      isPrivate: !!opts.isPrivate,
      url: opts.url ?? DEFAULT_SETTINGS.homeUrl,
      title: 'New Tab',
      favicon: null,
      blockedCount: 0,
      canGoBack: false,
      canGoForward: false,
      view: null,
      suspended: false,
      lastActiveAt: Date.now(),
    };
    this.tabs.set(id, tab);
    this.order.push(id);
    this.createView(tab, tab.url);
    this.emit(tab);
    if (opts.activate !== false) this.activateTab(id);
    return id;
  }

  private createView(tab: ManagedTab, url: string): void {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: tab.isPrivate ? PRIVATE_PARTITION : PERSIST_PARTITION,
      },
    });
    tab.view = view;
    tab.suspended = false;
    this.win.contentView.addChildView(view);
    view.setVisible(false);
    this.wireEvents(tab, view.webContents);
    view.webContents.loadURL(url);
  }

  private wireEvents(tab: ManagedTab, wc: WebContents): void {
    const sync = () => {
      tab.url = wc.getURL() || tab.url;
      tab.title = wc.getTitle() || tab.title;
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      this.emit(tab);
    };

    wc.on('page-title-updated', sync);
    wc.on('did-start-loading', () => this.emit(tab));
    wc.on('did-stop-loading', sync);
    wc.on('did-navigate', sync);
    wc.on('did-navigate-in-page', sync);
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? null;
      this.emit(tab);
    });

    // window.open / target=_blank -> open as a Sable tab, never a native popup.
    wc.setWindowOpenHandler(({ url }) => {
      this.createTab({ url, isPrivate: tab.isPrivate });
      return { action: 'deny' };
    });

    wc.on('did-fail-load', (_e, code, desc, url) => {
      if (code === -3) return; // ERR_ABORTED — normal on redirects/cancels
      console.error('[sable] tab load failed:', code, desc, url);
    });

    // Native right-click menu: link/image/selection actions + Inspect Element.
    wc.on('context-menu', (_e, params) => {
      showPageContextMenu(wc, params, {
        openInNewTab: (url) => this.createTab({ url, isPrivate: tab.isPrivate }),
        openInSplit: (url) => this.openInSplit(url, tab.isPrivate),
        engine: () => this.getSettings()?.searchEngine ?? DEFAULT_SETTINGS.searchEngine,
      });
    });

    // Record history — real pages only, never private tabs or internal pages.
    wc.on('did-finish-load', () => {
      tab.url = wc.getURL() || tab.url;
      tab.title = wc.getTitle() || tab.title;
      if (!tab.isPrivate && this.storage && /^https?:/i.test(tab.url)) {
        this.storage.addHistory(tab.url, tab.title || tab.url);
      }
      this.emit(tab);
    });
  }

  closeTab(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const wasActive = this.activeId === id;
    const splitWas = this.splitId;
    if (this.splitId === id) this.splitId = null;

    this.destroyView(tab);
    this.tabs.delete(id);
    this.order = this.order.filter((t) => t !== id);
    this.send(IPC.TabRemoved, id);

    if (wasActive) {
      // Closing the left pane promotes the split pane to full-window active.
      this.splitId = null;
      const next =
        splitWas && splitWas !== id && this.tabs.has(splitWas)
          ? splitWas
          : (this.order[this.order.length - 1] ?? null);
      this.activeId = null;
      if (next) this.activateTab(next);
    } else if (splitWas === id) {
      this.refreshViews();
      this.emitAll();
    }
  }

  closeActive(): void {
    if (this.activeId) this.closeTab(this.activeId);
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const id of [...this.tabs.keys()]) this.closeTab(id);
  }

  // -- suspension -----------------------------------------------------------

  private canSuspend(tab: ManagedTab): boolean {
    return (
      tab.id !== this.activeId &&
      tab.id !== this.splitId && // split pane is visible — never discard it
      !tab.suspended &&
      tab.view !== null
    );
  }

  private destroyView(tab: ManagedTab): void {
    if (!tab.view) return;
    this.win.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    tab.view = null;
  }

  suspend(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab || !this.canSuspend(tab)) return;
    this.destroyView(tab);
    tab.suspended = true;
    tab.canGoBack = false;
    tab.canGoForward = false;
    this.emit(tab);
  }

  /** Suspend every tab except the active one (manual / command palette). */
  suspendInactive(): void {
    for (const id of [...this.order]) if (id !== this.activeId) this.suspend(id);
  }

  private restore(tab: ManagedTab): void {
    if (!tab.suspended) return;
    this.createView(tab, tab.url);
    this.emit(tab);
  }

  private sweep(): void {
    const now = Date.now();
    for (const tab of this.tabs.values()) {
      if (this.canSuspend(tab) && now - tab.lastActiveAt > SUSPEND_AFTER_MS) {
        this.suspend(tab.id);
      }
    }
  }

  // -- activation & layout --------------------------------------------------

  activateTab(id: TabId): void {
    const target = this.tabs.get(id);
    if (!target) return;
    if (target.suspended) this.restore(target);

    // Activating the split pane swaps the pair instead of collapsing it.
    if (this.splitId === id && this.activeId && this.activeId !== id) {
      this.splitId = this.activeId;
    }

    // Reset the previously active tab's idle clock so its countdown starts now.
    const prev = this.activeId ? this.tabs.get(this.activeId) : null;
    if (prev && prev.id !== id) prev.lastActiveAt = Date.now();

    target.lastActiveAt = Date.now();
    this.activeId = id;
    this.refreshViews();
    this.send(IPC.ActiveTabChanged, id);
    this.emitAll(); // split flags may have moved between tabs
  }

  // -- split view -----------------------------------------------------------

  /** Show `id` as the right pane next to the active tab; null closes the split. */
  setSplit(id: TabId | null): void {
    if (id === null) {
      this.splitId = null;
    } else {
      if (id === this.activeId) return; // can't split a tab with itself
      const tab = this.tabs.get(id);
      if (!tab) return;
      if (tab.suspended) this.restore(tab);
      tab.lastActiveAt = Date.now();
      this.splitId = id;
    }
    this.refreshViews();
    this.emitAll();
  }

  /** Open a URL as a fresh tab in the right-hand split pane. */
  openInSplit(url: string, isPrivate = false): void {
    const id = this.createTab({ url, isPrivate, activate: false });
    this.setSplit(id);
  }

  /** Native context menu for a sidebar tab row. */
  tabContextMenu(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const template: MenuItemConstructorOptions[] = [
      ...(id !== this.activeId
        ? [{ label: 'Open in Split View', click: () => this.setSplit(id) }]
        : []),
      ...(this.splitId === id
        ? [{ label: 'Close Split View', click: () => this.setSplit(null) }]
        : []),
      {
        label: 'Suspend Tab',
        enabled: this.canSuspend(tab),
        click: () => this.suspend(id),
      },
      { type: 'separator' },
      { label: 'Close Tab', click: () => this.closeTab(id) },
    ];
    Menu.buildFromTemplate(template).popup();
  }

  /** ⌘\\ — close the split if open, else split with the next tab over. */
  toggleSplit(): void {
    if (this.splitId) {
      this.setSplit(null);
      return;
    }
    if (!this.activeId || this.order.length < 2) return;
    const i = this.order.indexOf(this.activeId);
    this.setSplit(this.order[(i + 1) % this.order.length]);
  }

  /** Apply visibility + bounds for the active tab (and split pane, if any). */
  private refreshViews(): void {
    const active = this.activeId ? this.tabs.get(this.activeId) : null;
    const split = this.splitId ? this.tabs.get(this.splitId) : null;

    for (const [tid, t] of this.tabs) {
      const shown = !this.overlay && (tid === this.activeId || tid === this.splitId);
      t.view?.setVisible(shown);
      if (shown && t.view) this.win.contentView.addChildView(t.view); // re-add == front
    }

    const b = this.bounds;
    if (active?.view && split?.view) {
      const gap = 1; // hairline between panes
      const half = Math.floor((b.width - gap) / 2);
      active.view.setBounds({ x: b.x, y: b.y, width: half, height: b.height });
      split.view.setBounds({
        x: b.x + half + gap,
        y: b.y,
        width: b.width - half - gap,
        height: b.height,
      });
    } else if (active?.view) {
      active.view.setBounds(b);
    }
  }

  /** Activate the Nth tab (0-based); used by ⌘1..9. */
  activateByIndex(index: number): void {
    const id = this.order[index];
    if (id) this.activateTab(id);
  }

  /** Cycle to the next (+1) or previous (-1) tab, wrapping. */
  cycle(delta: number): void {
    if (this.order.length < 2 || !this.activeId) return;
    const i = this.order.indexOf(this.activeId);
    const next = this.order[(i + delta + this.order.length) % this.order.length];
    this.activateTab(next);
  }

  /** Hide/show the visible web views so a chrome overlay can take the content area. */
  setOverlay(on: boolean): void {
    this.overlay = on;
    this.refreshViews();
  }

  /** Attribute a blocked request to its tab (by webContents id) and refresh it. */
  recordBlocked(webContentsId: number, count: number): void {
    for (const tab of this.tabs.values()) {
      const wc = tab.view?.webContents;
      if (wc && !wc.isDestroyed() && wc.id === webContentsId) {
        tab.blockedCount = count;
        this.emit(tab);
        return;
      }
    }
  }

  /** Renderer reports the pixel rect of the content area on resize. */
  setBounds(b: ViewportBounds): void {
    this.bounds = b;
    this.refreshViews();
  }

  // -- navigation -----------------------------------------------------------

  navigate(id: TabId, input: string): void {
    const engine = this.getSettings()?.searchEngine ?? DEFAULT_SETTINGS.searchEngine;
    const url = resolveOmnibox(input, engine);
    const wc = this.wc(id);
    if (wc) {
      wc.loadURL(url);
    } else {
      // Suspended tab — recreate it pointed at the new URL.
      const tab = this.tabs.get(id);
      if (tab) {
        tab.url = url;
        this.restore(tab);
      }
    }
  }

  goBack(id: TabId): void {
    const wc = this.wc(id);
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(id: TabId): void {
    const wc = this.wc(id);
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(id: TabId): void {
    this.wc(id)?.reload();
  }

  reloadActive(): void {
    if (this.activeId) this.reload(this.activeId);
  }

  stop(id: TabId): void {
    this.wc(id)?.stop();
  }

  // -- state export ---------------------------------------------------------

  getAll(): { tabs: TabState[]; activeId: TabId | null } {
    return {
      tabs: this.order.map((id) => this.snapshot(this.tabs.get(id)!)),
      activeId: this.activeId,
    };
  }

  // -- internals ------------------------------------------------------------

  private wc(id: TabId): WebContents | null {
    const wc = this.tabs.get(id)?.view?.webContents;
    return wc && !wc.isDestroyed() ? wc : null;
  }

  private snapshot(tab: ManagedTab): TabState {
    const wc = tab.view?.webContents;
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title || 'New Tab',
      favicon: tab.favicon,
      isLoading: wc && !wc.isDestroyed() ? wc.isLoadingMainFrame() : false,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      isPrivate: tab.isPrivate,
      isSuspended: tab.suspended,
      isSplit: tab.id === this.splitId,
      blockedCount: tab.blockedCount,
    };
  }

  private emitAll(): void {
    for (const tab of this.tabs.values()) this.emit(tab);
  }

  private emit(tab: ManagedTab): void {
    if (!this.tabs.has(tab.id)) return;
    this.send(IPC.TabUpserted, this.snapshot(tab));
  }

  private send(channel: string, payload: unknown): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }
}
