import { useEffect, useState } from 'react';
import type { Bookmark, DownloadEntry, HistoryEntry } from '@shared';
import { useUi } from '@/store/ui';
import { useBrowser } from '@/store/browser';
import { formatBytes } from '@/store/adblock';

type Section = 'history' | 'bookmarks' | 'downloads';

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Library overlay: history, bookmarks, downloads — all backed by SQLite. Shown
 * by hiding the active web view (same overlay mechanism as the ad-block
 * dashboard). Clicking an entry navigates the active tab there.
 */
export function Library() {
  const setOverlay = useUi((s) => s.setOverlay);
  const activeId = useBrowser((s) => s.activeId);
  const [section, setSection] = useState<Section>('history');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);

  useEffect(() => {
    window.sable.getHistory().then(setHistory);
    window.sable.listBookmarks().then(setBookmarks);
    window.sable.listDownloads().then(setDownloads);
  }, []);

  useEffect(
    () => window.sable.onDownloadUpdated(() => window.sable.listDownloads().then(setDownloads)),
    [],
  );

  useEffect(() => {
    if (section !== 'history') return;
    const t = setTimeout(() => {
      const q = query.trim();
      (q ? window.sable.searchHistory(q) : window.sable.getHistory()).then(setHistory);
    }, 150);
    return () => clearTimeout(t);
  }, [query, section]);

  const open = (url: string) => {
    if (activeId) window.sable.navigate(activeId, url);
    setOverlay('none');
  };

  const removeBookmark = async (b: Bookmark) => {
    await window.sable.toggleBookmark(b.url, b.title);
    setBookmarks((bs) => bs.filter((x) => x.id !== b.id));
  };

  const clearHistory = async () => {
    await window.sable.clearHistory();
    setHistory([]);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-2xl px-10 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg text-accent">✳</span>
            <div>
              <div className="font-mono text-[11px] tracking-[0.24em] text-subtle">LIBRARY</div>
              <h1 className="text-xl text-fg">History, bookmarks &amp; downloads</h1>
            </div>
          </div>
          <button
            onClick={() => setOverlay('none')}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-lg text-subtle hover:bg-panel-hover hover:text-fg"
          >
            ×
          </button>
        </div>

        <div className="mt-6 flex gap-1 border-b border-line">
          {(['history', 'bookmarks', 'downloads'] as Section[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${
                section === s
                  ? 'border-b-2 border-accent text-fg'
                  : 'border-b-2 border-transparent text-muted hover:text-fg'
              }`}
            >
              <span className="font-mono text-[10px] text-subtle">{`0${i + 1}`}</span>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {section === 'history' && (
          <div className="mt-5">
            <div className="mb-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search history"
                spellCheck={false}
                className="flex-1 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent"
              />
              <button
                onClick={clearHistory}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-panel-hover hover:text-fg"
              >
                Clear all
              </button>
            </div>
            <Rows
              items={history.map((h) => ({
                key: String(h.id),
                title: h.title || h.url,
                sub: host(h.url),
                meta: timeAgo(h.visitedAt),
                onClick: () => open(h.url),
              }))}
              empty="No history yet."
            />
          </div>
        )}

        {section === 'bookmarks' && (
          <div className="mt-5">
            <Rows
              items={bookmarks.map((b) => ({
                key: b.id,
                title: b.title || b.url,
                sub: host(b.url),
                meta: '★',
                onClick: () => open(b.url),
                onRemove: () => removeBookmark(b),
              }))}
              empty="No bookmarks yet — star a page to save it."
            />
          </div>
        )}

        {section === 'downloads' && (
          <div className="mt-5">
            {downloads.length === 0 ? (
              <Empty text="No downloads yet." />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {downloads.map((d) => {
                  const pct = d.totalBytes
                    ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100))
                    : d.state === 'completed'
                      ? 100
                      : 0;
                  return (
                    <li key={d.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm text-fg">{d.filename}</span>
                        <span className="shrink-0 font-mono text-[10px] text-subtle">{d.state}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">
                          {formatBytes(d.receivedBytes)}
                          {d.totalBytes ? ` / ${formatBytes(d.totalBytes)}` : ''}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Row {
  key: string;
  title: string;
  sub: string;
  meta: string;
  onClick: () => void;
  onRemove?: () => void;
}

function Rows({ items, empty }: { items: Row[]; empty: string }) {
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((r) => (
        <li key={r.key} className="group flex items-center gap-3 py-2.5">
          <button
            onClick={r.onClick}
            className="flex min-w-0 flex-1 flex-col items-start text-left"
          >
            <span className="max-w-full truncate text-sm text-fg group-hover:text-accent">
              {r.title}
            </span>
            <span className="max-w-full truncate text-xs text-subtle">{r.sub}</span>
          </button>
          <span className="shrink-0 font-mono text-[10px] text-subtle">{r.meta}</span>
          {r.onRemove && (
            <button
              onClick={r.onRemove}
              aria-label="Remove"
              className="shrink-0 rounded px-1 text-subtle opacity-0 hover:text-fg group-hover:opacity-100"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-subtle">{text}</p>;
}
