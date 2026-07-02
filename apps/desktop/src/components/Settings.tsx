import { useEffect, useState } from 'react';
import { SEARCH_ENGINES, type SearchEngineId, type ThemeMode } from '@shared';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/store/theme';
import { useAdblock } from '@/store/adblock';
import { useUi } from '@/store/ui';

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const SHORTCUTS: [string, string][] = [
  ['⌘K', 'Command palette'],
  ['⌘L', 'Focus address bar'],
  ['⌘T / ⌘W', 'New / close tab'],
  ['⌘⇧N', 'New private tab'],
  ['⌘Y', 'Library'],
  ['⌘⇧S', 'Suspend background tabs'],
  ['⌘1–9', 'Jump to tab'],
  ['⌘⇧] / ⌘⇧[', 'Next / previous tab'],
  ['⌘\\', 'Split view'],
  ['⌘⇧F', 'Focus mode'],
];

/**
 * Settings overlay (⌘,). Same overlay mechanism as the dashboard/library.
 * Everything here writes through to the SQLite settings table via main.
 */
export function Settings() {
  const setOverlay = useUi((s) => s.setOverlay);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const themeMode = useTheme((s) => s.mode);
  const setTheme = useTheme((s) => s.set);
  const stats = useAdblock((s) => s.stats);

  const [name, setName] = useState(settings.profileName);
  useEffect(() => setName(settings.profileName), [settings.profileName]);
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== settings.profileName) update({ profileName: trimmed });
    else setName(settings.profileName);
  };

  const removeFromWhitelist = async (host: string) => {
    const next = await window.sable.setSiteAllowed(host, false);
    if (next) useAdblock.getState().setStats(next);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-2xl px-10 py-10">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg text-accent">✳</span>
            <div>
              <div className="font-mono text-[11px] tracking-[0.24em] text-subtle">SETTINGS</div>
              <h1 className="text-xl text-fg">Preferences</h1>
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

        {/* 01 profile */}
        <Section index="01" title="PROFILE">
          <div className="flex items-center gap-4 rounded-lg border border-line bg-panel px-5 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 font-mono text-sm font-medium text-accent">
              {settings.profileName
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('') || 'G'}
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                spellCheck={false}
                className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-fg outline-none transition hover:border-line focus:border-accent"
              />
              <div className="px-1 text-xs text-subtle">
                Local profile — stored only on this device
              </div>
            </div>
            <button
              disabled
              title="Google sign-in arrives with sync"
              className="shrink-0 cursor-not-allowed rounded-md border border-line px-3 py-1.5 text-xs text-subtle"
            >
              Sign in · soon
            </button>
          </div>
        </Section>

        {/* 02 appearance */}
        <Section index="02" title="APPEARANCE">
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`rounded-md border px-4 py-1.5 text-sm transition ${
                  themeMode === t.id
                    ? 'border-accent text-accent'
                    : 'border-line text-muted hover:bg-panel-hover hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        {/* 03 search */}
        <Section index="03" title="SEARCH ENGINE">
          <div className="flex flex-col gap-1">
            {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => {
              const selected = settings.searchEngine === id;
              return (
                <button
                  key={id}
                  onClick={() => update({ searchEngine: id })}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    selected ? 'bg-active text-fg' : 'text-muted hover:bg-panel-hover'
                  }`}
                >
                  <span
                    className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                      selected ? 'border-accent' : 'border-line'
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </span>
                  {SEARCH_ENGINES[id].name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-subtle">
            Used by the address bar and the new-tab page.
          </p>
        </Section>

        {/* 04 privacy */}
        <Section index="04" title="PRIVACY">
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-5 py-4">
            <div>
              <div className="text-sm text-fg">Block ads &amp; trackers</div>
              <div className="text-xs text-muted">EasyList + EasyPrivacy on every tab</div>
            </div>
            <button
              onClick={() => update({ adblockEnabled: !settings.adblockEnabled })}
              role="switch"
              aria-checked={settings.adblockEnabled}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                settings.adblockEnabled ? 'bg-accent' : 'bg-panel-hover'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-canvas transition-all ${
                  settings.adblockEnabled ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {stats.whitelist.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 font-mono text-[10px] tracking-[0.18em] text-subtle">
                ALLOWED SITES
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {stats.whitelist.map((host) => (
                  <li key={host} className="group flex items-center justify-between py-2">
                    <span className="truncate text-sm text-fg">{host}</span>
                    <button
                      onClick={() => removeFromWhitelist(host)}
                      className="shrink-0 rounded px-1.5 text-xs text-subtle hover:text-fg"
                    >
                      Re-block
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => window.sable.clearHistory()}
            className="mt-4 rounded-md border border-line px-4 py-1.5 text-sm text-muted hover:bg-panel-hover hover:text-fg"
          >
            Clear browsing history
          </button>
        </Section>

        {/* 05 about */}
        <Section index="05" title="ABOUT">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-fg">Sable</span>
            <span className="font-mono text-xs text-subtle">v0.0.1</span>
            <span className="text-xs text-subtle">— fast · minimal · private</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted">{what}</span>
                <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
        <span className="font-mono text-[10px] text-accent">{index}</span>
        <span className="font-mono text-[10px] tracking-[0.22em] text-subtle">{title}</span>
      </div>
      {children}
    </div>
  );
}
