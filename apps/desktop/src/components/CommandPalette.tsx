import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { HistoryEntry } from '@shared';
import { useBrowser } from '@/store/browser';
import { useUi } from '@/store/ui';
import { useTheme } from '@/store/theme';
import { useAdblock } from '@/store/adblock';

interface Item {
  id: string;
  label: string;
  sub?: string;
  kind: 'nav' | 'command' | 'history';
  run: () => void;
}

const isHttp = (url: string | undefined): url is string => !!url && /^https?:/i.test(url);

/**
 * VS Code-style command palette (⌘K). Shown over the hidden web view. Fuzzy-ish
 * filter over a fixed command set plus live history matches; a leading "Go to"
 * item navigates the active tab. Arrow keys move, Enter runs, Esc closes.
 */
export function CommandPalette() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setOverlay = useUi((s) => s.setOverlay);
  const tabs = useBrowser((s) => s.tabs);
  const activeId = useBrowser((s) => s.activeId);
  const active = tabs.find((t) => t.id === activeId) ?? null;

  const [query, setQuery] = useState('');
  const [historyMatches, setHistoryMatches] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => setPaletteOpen(false);
  const withClose = (fn: () => void) => () => {
    fn();
    close();
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Live history matches for the current query.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHistoryMatches([]);
      return;
    }
    const t = setTimeout(() => {
      window.sable.searchHistory(q).then((rows) => setHistoryMatches(rows.slice(0, 5)));
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  const commands = useMemo<Item[]>(
    () => [
      { id: 'new-tab', label: 'New tab', kind: 'command', run: () => window.sable.createTab({}) },
      {
        id: 'new-private',
        label: 'New private tab',
        kind: 'command',
        run: () => window.sable.createTab({ isPrivate: true }),
      },
      {
        id: 'close-tab',
        label: 'Close tab',
        kind: 'command',
        run: () => active && window.sable.closeTab(active.id),
      },
      {
        id: 'reload',
        label: 'Reload page',
        kind: 'command',
        run: () => active && window.sable.reload(active.id),
      },
      {
        id: 'adblock-dash',
        label: 'Open ad-block dashboard',
        kind: 'command',
        run: () => setOverlay('adblock'),
      },
      {
        id: 'toggle-adblock',
        label: 'Toggle ad blocker',
        kind: 'command',
        run: () =>
          window.sable.toggleAdblock().then((s) => s && useAdblock.getState().setStats(s)),
      },
      { id: 'library', label: 'Open library', kind: 'command', run: () => setOverlay('library') },
      { id: 'settings', label: 'Open settings', kind: 'command', run: () => setOverlay('settings') },
      {
        id: 'focus',
        label: 'Toggle focus mode',
        kind: 'command',
        run: () => useUi.getState().toggleFocus(),
      },
      ...(tabs.some((t) => t.isSplit)
        ? [
            {
              id: 'split-off',
              label: 'Close split view',
              kind: 'command' as const,
              run: () => window.sable.setSplit(null),
            },
          ]
        : []),
      ...tabs
        .filter((t) => t.id !== activeId)
        .map((t) => ({
          id: `split-${t.id}`,
          label: `Split with: ${t.title || 'New Tab'}`,
          kind: 'command' as const,
          run: () => window.sable.setSplit(t.id),
        })),
      {
        id: 'theme',
        label: 'Toggle theme',
        kind: 'command',
        run: () => useTheme.getState().toggle(),
      },
      {
        id: 'suspend',
        label: 'Suspend background tabs',
        kind: 'command',
        run: () => window.sable.suspendInactive(),
      },
      {
        id: 'bookmark',
        label: 'Bookmark this page',
        kind: 'command',
        run: () => isHttp(active?.url) && window.sable.toggleBookmark(active.url, active.title),
      },
      {
        id: 'clear-history',
        label: 'Clear history',
        kind: 'command',
        run: () => window.sable.clearHistory(),
      },
    ],
    [active, tabs, activeId, setOverlay],
  );

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const ql = q.toLowerCase();
    const list: Item[] = [];
    if (q && active) {
      list.push({
        id: 'nav',
        label: `Go to "${q}"`,
        kind: 'nav',
        run: () => window.sable.navigate(active.id, q),
      });
    }
    for (const c of commands) if (!ql || c.label.toLowerCase().includes(ql)) list.push(c);
    for (const h of historyMatches) {
      list.push({
        id: `h-${h.id}`,
        label: h.title || h.url,
        sub: h.url,
        kind: 'history',
        run: () => active && window.sable.navigate(active.id, h.url),
      });
    }
    return list;
  }, [query, commands, historyMatches, active]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selected];
      if (item) withClose(item.run)();
    }
  };

  const KIND_LABEL: Record<Item['kind'], string> = {
    nav: 'GO',
    command: 'CMD',
    history: 'HIST',
  };

  return (
    <div
      className="absolute inset-0 flex items-start justify-center bg-black/40"
      onClick={close}
    >
      <div
        className="mt-[16vh] w-[560px] max-w-[88%] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command, search history, or enter a URL"
          spellCheck={false}
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <li className="px-4 py-3 text-sm text-subtle">No matches</li>
          )}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setSelected(i)}
                onClick={withClose(item.run)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                  i === selected ? 'bg-active' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${
                      i === selected ? 'text-accent' : 'text-fg'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.sub && (
                    <span className="block truncate text-xs text-subtle">{item.sub}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[9px] tracking-wider text-subtle">
                  {KIND_LABEL[item.kind]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
