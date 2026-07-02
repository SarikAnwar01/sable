import { useEffect, useState } from 'react';
import type { DailyBlock } from '@shared';
import { useAdblock, formatCount, formatBytes } from '@/store/adblock';
import { useBrowser } from '@/store/browser';
import { useUi } from '@/store/ui';

/** Host of an http(s) page, else null (skip internal pages like the new tab). */
function pageHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

/**
 * Ad / tracker blocking dashboard. Rendered in the chrome UI and shown by hiding
 * the active web view (the native view would otherwise occlude this DOM). Stats
 * are session-scoped for now; the historical heatmap arrives with storage (M3).
 */
export function AdblockDashboard() {
  const stats = useAdblock((s) => s.stats);
  const setOverlay = useUi((s) => s.setOverlay);
  const tabs = useBrowser((s) => s.tabs);
  const activeId = useBrowser((s) => s.activeId);
  const [heatmap, setHeatmap] = useState<DailyBlock[]>([]);

  useEffect(() => {
    window.sable.getHeatmap().then(setHeatmap);
  }, [stats.blocked === 0]);

  const host = pageHost(tabs.find((t) => t.id === activeId)?.url);
  const siteAllowed = host ? stats.whitelist.includes(host) : false;

  const toggle = async () => {
    const next = await window.sable.toggleAdblock();
    if (next) useAdblock.getState().setStats(next);
  };

  const toggleSite = async () => {
    if (!host) return;
    const next = await window.sable.setSiteAllowed(host, !siteAllowed);
    if (next) useAdblock.getState().setStats(next);
  };

  const max = stats.topDomains[0]?.count ?? 1;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-2xl px-10 py-10">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg text-accent">✳</span>
            <div>
              <div className="font-mono text-[11px] tracking-[0.24em] text-subtle">SHIELD</div>
              <h1 className="text-xl text-fg">Ad &amp; tracker blocking</h1>
            </div>
          </div>
          <button
            onClick={() => setOverlay('none')}
            className="grid h-8 w-8 place-items-center rounded-md text-lg text-subtle hover:bg-panel-hover hover:text-fg"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* on/off */}
        <div className="mt-8 flex items-center justify-between rounded-lg border border-line bg-panel px-5 py-4">
          <div>
            <div className="text-sm text-fg">
              Blocking is {stats.enabled ? 'on' : 'off'}
            </div>
            <div className="text-xs text-muted">
              EasyList + EasyPrivacy, applied to every tab
            </div>
          </div>
          <button
            onClick={toggle}
            role="switch"
            aria-checked={stats.enabled}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              stats.enabled ? 'bg-accent' : 'bg-panel-hover'
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-canvas transition-all ${
                stats.enabled ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* this site */}
        {host && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-panel px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-sm text-fg">{host}</div>
              <div className="text-xs text-muted">
                {siteAllowed ? 'Ads allowed on this site' : 'Blocking on this site'}
              </div>
            </div>
            <button
              onClick={toggleSite}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-xs transition ${
                siteAllowed
                  ? 'border-accent text-accent hover:bg-accent/10'
                  : 'border-line text-muted hover:bg-panel-hover hover:text-fg'
              }`}
            >
              {siteAllowed ? 'Re-enable blocking' : 'Allow on this site'}
            </button>
          </div>
        )}

        {/* metrics */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Metric label="Requests blocked" value={formatCount(stats.blocked)} index="01" />
          <Metric label="Data saved (est.)" value={formatBytes(stats.dataSaved)} index="02" />
        </div>

        {/* heatmap */}
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
            <span className="font-mono text-[10px] tracking-[0.22em] text-subtle">
              BLOCKED OVER TIME
            </span>
            <span className="font-mono text-[10px] text-subtle">~6 MONTHS</span>
          </div>
          {heatmap.length === 0 ? (
            <p className="py-4 text-sm text-subtle">Daily totals build up as you browse.</p>
          ) : (
            <Heatmap data={heatmap} />
          )}
        </div>

        {/* top domains */}
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
            <span className="font-mono text-[10px] tracking-[0.22em] text-subtle">
              TOP BLOCKED
            </span>
            <span className="font-mono text-[10px] text-subtle">THIS SESSION</span>
          </div>
          {stats.topDomains.length === 0 ? (
            <p className="py-6 text-center text-sm text-subtle">
              Nothing blocked yet — browse a bit and watch this fill up.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stats.topDomains.map((d, i) => (
                <li key={d.domain} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] text-subtle">
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="w-48 shrink-0 truncate text-sm text-fg">{d.domain}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(4, (d.count / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">
                    {formatCount(d.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Heatmap({ data }: { data: DailyBlock[] }) {
  const byDay = new Map(data.map((d) => [d.day, d.blocked]));
  const max = Math.max(1, ...data.map((d) => d.blocked));

  const days: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: byDay.get(key) ?? 0 });
  }

  const weeks: { day: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const shade = (c: number) =>
    c === 0
      ? 'var(--c-panel)'
      : `color-mix(in srgb, var(--c-accent) ${Math.max(18, Math.round((c / max) * 100))}%, var(--c-panel))`;

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((d) => (
            <span
              key={d.day}
              title={`${d.day}: ${formatCount(d.count)} blocked`}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: shade(d.count) }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, index }: { label: string; value: string; index: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="font-mono text-[10px] text-subtle">{index}</span>
      </div>
      <div className="mt-2 font-mono text-3xl text-fg">{value}</div>
    </div>
  );
}
