import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NEWTAB_URL, SEARCH_ENGINES } from '@shared';
import { useBrowser } from '@/store/browser';
import { useTheme } from '@/store/theme';
import { useAdblock, formatCount } from '@/store/adblock';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import {
  IconBack,
  IconForward,
  IconReload,
  IconX,
  IconPlus,
  IconShield,
  IconLibrary,
  IconGear,
  IconSun,
  IconMoon,
  IconStar,
  IconLock,
  IconGlobe,
  IconSplit,
} from '@/components/icons';

const isMac = window.sableEnv?.platform === 'darwin';
const isHttp = (url: string | undefined): url is string => !!url && /^https?:/i.test(url);

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'G';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Brutalist left sidebar (inherited from sarikanwar.com.np): ✳ wordmark, mono
 * numeric indices, hairline dividers, teal accent — now with a proper stroke
 * icon set, an https indicator in the omnibox, right-clickable tab rows, and a
 * profile section anchoring the bottom.
 */
export function Sidebar() {
  const tabs = useBrowser((s) => s.tabs);
  const activeId = useBrowser((s) => s.activeId);
  const active = tabs.find((t) => t.id === activeId) ?? null;
  const resolvedTheme = useTheme((s) => s.resolved);
  const toggleTheme = useTheme((s) => s.toggle);
  const blocked = useAdblock((s) => s.stats.blocked);
  const setOverlay = useUi((s) => s.setOverlay);
  const engine = useSettings((s) => s.settings.searchEngine);
  const profileName = useSettings((s) => s.settings.profileName);

  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = active && active.url !== NEWTAB_URL ? active.url : '';
  const secure = displayUrl.startsWith('https://');

  useEffect(() => {
    if (!editing) setValue(displayUrl);
  }, [active?.id, displayUrl, editing]);

  useEffect(() => {
    return window.sable.onFocusOmnibox(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    if (isHttp(active?.url)) window.sable.isBookmarked(active.url).then(setBookmarked);
    else setBookmarked(false);
  }, [active?.url]);

  const toggleBookmark = async () => {
    if (!isHttp(active?.url)) return;
    setBookmarked(await window.sable.toggleBookmark(active.url, active.title || active.url));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (active) window.sable.navigate(active.id, value);
    inputRef.current?.blur();
  };

  return (
    <aside
      className={`app-drag flex h-screen w-64 shrink-0 flex-col bg-canvas ${
        isMac ? 'pt-8' : 'pt-3'
      }`}
    >
      {/* brand header */}
      <div className="app-no-drag flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none text-accent">✳</span>
          <span className="font-mono text-[11px] font-medium tracking-[0.28em] text-fg">
            SABLE
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setOverlay('adblock')}
            title="Ad & tracker blocking"
            className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:bg-panel-hover hover:text-fg"
          >
            <IconShield size={13} />
            <span className="font-mono text-[10px] text-accent">{formatCount(blocked)}</span>
          </button>
          <IconBtn title="Library (⌘Y)" onClick={() => setOverlay('library')}>
            <IconLibrary size={13} />
          </IconBtn>
          <IconBtn title="Toggle theme" onClick={toggleTheme}>
            {resolvedTheme === 'dark' ? <IconMoon size={13} /> : <IconSun size={13} />}
          </IconBtn>
        </div>
      </div>
      <div className="mx-3 border-b border-line" />

      {/* nav + omnibox */}
      <div className="app-no-drag flex flex-col gap-2 px-3 pt-3">
        <div className="flex items-center gap-1">
          <IconBtn
            title="Back"
            disabled={!active?.canGoBack}
            onClick={() => active && window.sable.goBack(active.id)}
          >
            <IconBack />
          </IconBtn>
          <IconBtn
            title="Forward"
            disabled={!active?.canGoForward}
            onClick={() => active && window.sable.goForward(active.id)}
          >
            <IconForward />
          </IconBtn>
          <IconBtn
            title={active?.isLoading ? 'Stop' : 'Reload'}
            disabled={!active}
            onClick={() =>
              active &&
              (active.isLoading ? window.sable.stop(active.id) : window.sable.reload(active.id))
            }
          >
            {active?.isLoading ? <IconX /> : <IconReload />}
          </IconBtn>
          <div className="flex-1" />
          <IconBtn
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            disabled={!isHttp(active?.url)}
            onClick={toggleBookmark}
            className={bookmarked ? 'text-accent hover:text-accent' : ''}
          >
            <IconStar filled={bookmarked} />
          </IconBtn>
        </div>

        <form onSubmit={submit} className="relative">
          {secure && !editing && (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-accent">
              <IconLock size={11} />
            </span>
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            placeholder={`Search ${SEARCH_ENGINES[engine].name} or enter address`}
            spellCheck={false}
            disabled={!active}
            className={`w-full rounded-lg border border-line bg-panel py-1.5 pr-3 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-40 ${
              secure && !editing ? 'pl-7' : 'pl-3'
            }`}
          />
        </form>
      </div>

      {/* tabs section label */}
      <div className="app-no-drag mt-4 flex items-center justify-between px-3 pb-1.5">
        <span className="font-mono text-[10px] tracking-[0.22em] text-subtle">TABS</span>
        <span className="font-mono text-[10px] text-subtle">
          {tabs.length.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="mx-3 border-b border-line" />

      {/* vertical tab list */}
      <div className="app-no-drag flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pt-1.5">
        {tabs.map((t, i) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              onClick={() => window.sable.activateTab(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                window.sable.showTabMenu(t.id);
              }}
              title={t.title}
              className={`group flex cursor-default items-center gap-2.5 rounded-lg border-l-2 py-2 pr-2 pl-2.5 text-sm transition-colors select-none ${
                isActive
                  ? 'border-accent bg-active text-fg'
                  : 'border-transparent text-muted hover:bg-panel-hover'
              } ${t.isSuspended && !isActive ? 'opacity-45' : ''}`}
            >
              <span
                className={`w-4 shrink-0 text-right font-mono text-[10px] ${
                  isActive ? 'text-accent' : 'text-subtle'
                }`}
              >
                {(i + 1).toString().padStart(2, '0')}
              </span>
              {t.favicon ? (
                <img src={t.favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
              ) : (
                <span className="grid h-4 w-4 shrink-0 place-items-center text-subtle">
                  <IconGlobe size={13} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                {t.isPrivate && (
                  <span className="shrink-0 text-subtle">
                    <IconLock size={10} />
                  </span>
                )}
                <span className="truncate">
                  {t.isLoading && !t.title ? 'Loading…' : t.title || 'New Tab'}
                </span>
              </span>
              {t.isSplit && (
                <span title="Open in split view" className="shrink-0 text-accent">
                  <IconSplit size={11} />
                </span>
              )}
              {t.isSuspended && (
                <span
                  title="Suspended to save memory"
                  className="shrink-0 font-mono text-[9px] text-subtle group-hover:hidden"
                >
                  z
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.sable.closeTab(t.id);
                }}
                className="hidden shrink-0 rounded-md p-0.5 text-subtle hover:bg-line hover:text-fg group-hover:block"
                aria-label="Close tab"
              >
                <IconX size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* new tab */}
      <div className="mx-3 border-t border-line" />
      <button
        onClick={() => window.sable.createTab({})}
        className="app-no-drag mx-2 mt-1.5 flex items-center gap-2.5 rounded-lg py-2 pl-2.5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-fg"
      >
        <span className="grid w-4 shrink-0 place-items-center text-accent">
          <IconPlus size={13} />
        </span>
        New tab
        <span className="ml-auto pr-2 font-mono text-[10px] text-subtle">⌘T</span>
      </button>

      {/* profile */}
      <div className="app-no-drag mx-2 mt-1.5 mb-2">
        <button
          onClick={() => setOverlay('settings')}
          title="Profile & settings (⌘,)"
          className="group flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-panel-hover"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 font-mono text-[11px] font-medium text-accent">
            {initials(profileName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-fg">{profileName}</span>
            <span className="block font-mono text-[9px] tracking-[0.14em] text-subtle">
              LOCAL PROFILE
            </span>
          </span>
          <span className="shrink-0 text-subtle transition-colors group-hover:text-fg">
            <IconGear size={14} />
          </span>
        </button>
      </div>
    </aside>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  className = '',
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-panel-hover hover:text-fg disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}
