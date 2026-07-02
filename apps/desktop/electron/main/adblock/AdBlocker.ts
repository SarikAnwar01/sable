import { app, webContents, type Session } from 'electron';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { ElectronBlocker, fromElectronDetails } from '@ghostery/adblocker-electron';
import type { AdblockStats } from '@shared';
import type { Storage } from '../storage/Storage';

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Rough per-resource-type byte estimates for "data saved". Blocked resources
 * are never downloaded, so we can only approximate from the request type.
 */
const SIZE_BY_TYPE: Record<string, number> = {
  script: 55_000,
  image: 18_000,
  stylesheet: 30_000,
  xmlhttprequest: 12_000,
  fetch: 12_000,
  sub_frame: 90_000,
  media: 200_000,
  font: 40_000,
  websocket: 4_000,
  ping: 1_000,
  beacon: 1_000,
};
const DEFAULT_SIZE = 20_000;

/**
 * Wraps the Ghostery engine. We wire the network filters directly onto each
 * session's `webRequest` rather than calling `enableBlockingInSession` — the
 * latter's cosmetic-filtering path needs Electron 35's `registerPreloadScript`,
 * and this keeps blocking on the stable Electron we ship. Cosmetic element
 * hiding is a later add; network + header blocking (the measurable core) is here.
 *
 * All normal tabs share one partition and private tabs another, so wiring those
 * two sessions covers every current and future tab.
 */
export class AdBlocker {
  private blocker: ElectronBlocker | null = null;
  private enabled = true;
  private readonly wiredSessions = new Set<Session>();

  private blocked = 0;
  private dataSaved = 0;
  private readonly domainCounts = new Map<string, number>();
  private readonly perTab = new Map<number, number>();
  private emitTimer: NodeJS.Timeout | null = null;
  private errLogged = false;

  /** Hostnames the user allow-listed (blocking off there). Backed by SQLite. */
  private readonly whitelist = new Set<string>();
  private pendingBlocked = 0;
  private pendingSaved = 0;

  constructor(
    private readonly onStats: (stats: AdblockStats) => void,
    private readonly onTabBlocked: (webContentsId: number, count: number) => void,
    private readonly storage: Storage,
  ) {
    for (const host of this.storage.listWhitelist()) this.whitelist.add(host);
  }

  async init(): Promise<void> {
    // Cache the compiled engine to disk so subsequent launches are instant/offline.
    const path = join(app.getPath('userData'), 'adblock-engine.bin');
    this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path,
      read: fs.readFile,
      write: fs.writeFile,
    });
  }

  /**
   * Install gated blocking on a session. Handlers are installed once and always
   * present; the `enabled` flag gates them, so toggling is instant and never
   * needs to add/remove listeners. Safe to call before `init()` — requests pass
   * through until the engine is loaded.
   */
  enableForSession(sess: Session): void {
    if (this.wiredSessions.has(sess)) return;
    this.wiredSessions.add(sess);

    // Run the match ourselves (rather than blocker.onBeforeRequest) so we can
    // count blocks + attribute them to a tab — the library's handler cancels
    // silently without emitting an event.
    sess.webRequest.onBeforeRequest((details, callback) => {
      if (!this.enabled || !this.blocker) {
        callback({});
        return;
      }
      try {
        const request = fromElectronDetails(details);
        // Never touch the top-level document navigation itself.
        if (request.isMainFrame()) {
          callback({});
          return;
        }
        // On allow-listed sites, pass everything through. Resolve the source
        // host from the initiating tab (only when the list is non-empty).
        if (this.whitelist.size > 0 && typeof details.webContentsId === 'number') {
          const wc = webContents.fromId(details.webContentsId);
          const sourceHost = wc && !wc.isDestroyed() ? safeHost(wc.getURL()) : '';
          if (sourceHost && this.whitelist.has(sourceHost)) {
            callback({});
            return;
          }
        }
        const { redirect, match } = this.blocker.match(request);
        if (redirect?.dataUrl) {
          this.record(request.hostname, request.type, details.webContentsId);
          callback({ redirectURL: redirect.dataUrl });
        } else if (match) {
          this.record(request.hostname, request.type, details.webContentsId);
          callback({ cancel: true });
        } else {
          callback({});
        }
      } catch (err) {
        if (!this.errLogged) {
          this.errLogged = true;
          console.error('[sable] adblock handler error:', err);
        }
        callback({});
      }
    });

    // Header-level ($csp) filtering — no counting, no preload needed.
    sess.webRequest.onHeadersReceived((details, callback) => {
      if (this.enabled && this.blocker) this.blocker.onHeadersReceived(details, callback);
      else callback({});
    });
  }

  setEnabled(on: boolean): AdblockStats {
    this.enabled = on;
    return this.flush();
  }

  toggle(): AdblockStats {
    return this.setEnabled(!this.enabled);
  }

  /** allowed=true => allow-list the host (blocking off there). Persists to SQLite. */
  setSiteAllowed(hostname: string, allowed: boolean): AdblockStats {
    const host = hostname.replace(/^www\./, '');
    for (const h of new Set([hostname, host])) {
      if (allowed) {
        this.whitelist.add(h);
        this.storage.addWhitelist(h);
      } else {
        this.whitelist.delete(h);
        this.storage.removeWhitelist(h);
      }
    }
    return this.flush();
  }

  getStats(): AdblockStats {
    const topDomains = [...this.domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([domain, count]) => ({ domain, count }));
    return {
      enabled: this.enabled,
      blocked: this.blocked,
      dataSaved: this.dataSaved,
      topDomains,
      whitelist: [...this.whitelist],
    };
  }

  private record(hostname: string, type: string, webContentsId: number | undefined): void {
    const saved = SIZE_BY_TYPE[type] ?? DEFAULT_SIZE;
    this.blocked += 1;
    this.dataSaved += saved;
    this.pendingBlocked += 1;
    this.pendingSaved += saved;

    const host = hostname || 'unknown';
    this.domainCounts.set(host, (this.domainCounts.get(host) ?? 0) + 1);

    if (typeof webContentsId === 'number' && webContentsId >= 0) {
      const count = (this.perTab.get(webContentsId) ?? 0) + 1;
      this.perTab.set(webContentsId, count);
      this.onTabBlocked(webContentsId, count);
    }

    this.scheduleEmit();
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => this.flush(), 250);
  }

  private flush(): AdblockStats {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    // Persist the day's blocked totals in a single batched write (~4/sec max).
    if (this.pendingBlocked > 0) {
      const day = new Date().toISOString().slice(0, 10);
      this.storage.bumpDaily(day, this.pendingBlocked, this.pendingSaved);
      this.pendingBlocked = 0;
      this.pendingSaved = 0;
    }
    const stats = this.getStats();
    this.onStats(stats);
    return stats;
  }
}
