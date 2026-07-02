import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Bookmark, DailyBlock, DownloadEntry, HistoryEntry } from '@shared';

/**
 * All local persistence lives here: history, bookmarks, downloads, settings,
 * the ad-block whitelist, and daily blocked totals (for the heatmap). SQLite via
 * better-sqlite3 (synchronous — fine in the main process, and the fastest option
 * in Electron). One file in userData. Designed so the Phase 2 sync engine can
 * read updated_at columns and push deltas.
 */
export class Storage {
  private readonly db: Database.Database;

  constructor() {
    this.db = new Database(join(app.getPath('userData'), 'sable.db'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        url        TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT '',
        visited_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id         TEXT PRIMARY KEY,
        url        TEXT NOT NULL UNIQUE,
        title      TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id             TEXT PRIMARY KEY,
        url            TEXT NOT NULL,
        filename       TEXT NOT NULL,
        save_path      TEXT NOT NULL,
        total_bytes    INTEGER NOT NULL DEFAULT 0,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        state          TEXT NOT NULL,
        started_at     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS whitelist (
        host TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS adblock_daily (
        day        TEXT PRIMARY KEY,
        blocked    INTEGER NOT NULL DEFAULT 0,
        data_saved INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  // -- settings -------------------------------------------------------------

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  // -- history --------------------------------------------------------------

  addHistory(url: string, title: string): void {
    // Collapse rapid repeats of the same URL (reloads, redirects).
    const last = this.db
      .prepare('SELECT url FROM history ORDER BY visited_at DESC LIMIT 1')
      .get() as { url: string } | undefined;
    if (last?.url === url) return;
    this.db
      .prepare('INSERT INTO history (url, title, visited_at) VALUES (?, ?, ?)')
      .run(url, title, Date.now());
  }

  recentHistory(limit = 300): HistoryEntry[] {
    return this.db
      .prepare(
        'SELECT id, url, title, visited_at as visitedAt FROM history ORDER BY visited_at DESC LIMIT ?',
      )
      .all(limit) as HistoryEntry[];
  }

  searchHistory(query: string, limit = 150): HistoryEntry[] {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT id, url, title, visited_at as visitedAt FROM history
         WHERE url LIKE ? OR title LIKE ? ORDER BY visited_at DESC LIMIT ?`,
      )
      .all(like, like, limit) as HistoryEntry[];
  }

  clearHistory(): void {
    this.db.exec('DELETE FROM history');
  }

  // -- bookmarks ------------------------------------------------------------

  isBookmarked(url: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM bookmarks WHERE url = ?').get(url);
  }

  /** Toggle a bookmark; returns the new bookmarked state. */
  toggleBookmark(url: string, title: string): boolean {
    if (this.isBookmarked(url)) {
      this.db.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
      return false;
    }
    this.db
      .prepare('INSERT INTO bookmarks (id, url, title, created_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), url, title, Date.now());
    return true;
  }

  listBookmarks(): Bookmark[] {
    return this.db
      .prepare(
        'SELECT id, url, title, created_at as createdAt FROM bookmarks ORDER BY created_at DESC',
      )
      .all() as Bookmark[];
  }

  // -- downloads ------------------------------------------------------------

  upsertDownload(d: DownloadEntry): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, url, filename, save_path, total_bytes, received_bytes, state, started_at)
         VALUES (@id, @url, @filename, @savePath, @totalBytes, @receivedBytes, @state, @startedAt)
         ON CONFLICT(id) DO UPDATE SET
           received_bytes = excluded.received_bytes,
           total_bytes    = excluded.total_bytes,
           state          = excluded.state`,
      )
      .run(d);
  }

  listDownloads(limit = 100): DownloadEntry[] {
    return this.db
      .prepare(
        `SELECT id, url, filename, save_path as savePath, total_bytes as totalBytes,
                received_bytes as receivedBytes, state, started_at as startedAt
         FROM downloads ORDER BY started_at DESC LIMIT ?`,
      )
      .all(limit) as DownloadEntry[];
  }

  // -- whitelist ------------------------------------------------------------

  listWhitelist(): string[] {
    return (this.db.prepare('SELECT host FROM whitelist').all() as { host: string }[]).map(
      (r) => r.host,
    );
  }

  addWhitelist(host: string): void {
    this.db.prepare('INSERT OR IGNORE INTO whitelist (host) VALUES (?)').run(host);
  }

  removeWhitelist(host: string): void {
    this.db.prepare('DELETE FROM whitelist WHERE host = ?').run(host);
  }

  // -- adblock daily (heatmap) ---------------------------------------------

  bumpDaily(day: string, blocked: number, dataSaved: number): void {
    this.db
      .prepare(
        `INSERT INTO adblock_daily (day, blocked, data_saved) VALUES (?, ?, ?)
         ON CONFLICT(day) DO UPDATE SET
           blocked    = blocked + excluded.blocked,
           data_saved = data_saved + excluded.data_saved`,
      )
      .run(day, blocked, dataSaved);
  }

  heatmap(days = 180): DailyBlock[] {
    return this.db
      .prepare(
        `SELECT day, blocked FROM adblock_daily
         WHERE day >= date('now', ?) ORDER BY day ASC`,
      )
      .all(`-${days} days`) as DailyBlock[];
  }
}
