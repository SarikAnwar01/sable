import { useEffect, useRef } from 'react';
import { useBrowser } from '@/store/browser';
import { useAdblock } from '@/store/adblock';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/store/theme';
import { Sidebar } from '@/components/Sidebar';
import { AdblockDashboard } from '@/components/AdblockDashboard';
import { Library } from '@/components/Library';
import { CommandPalette } from '@/components/CommandPalette';
import { Settings } from '@/components/Settings';

export default function App() {
  const { setAll, upsert, remove, setActive } = useBrowser();
  const setStats = useAdblock((s) => s.setStats);
  const overlay = useUi((s) => s.overlay);
  const paletteOpen = useUi((s) => s.paletteOpen);
  const focus = useUi((s) => s.focus);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Menu-driven shortcuts that open chrome UI.
  useEffect(() => {
    const offPalette = window.sable.onOpenCommandPalette(() =>
      useUi.getState().setPaletteOpen(true),
    );
    const offLibrary = window.sable.onOpenLibrary(() => useUi.getState().setOverlay('library'));
    const offSettings = window.sable.onOpenSettings(() =>
      useUi.getState().setOverlay('settings'),
    );
    const offFocus = window.sable.onToggleFocus(() => useUi.getState().toggleFocus());
    return () => {
      offPalette();
      offLibrary();
      offSettings();
      offFocus();
    };
  }, []);

  // Hydrate settings from the DB (source of truth) and apply the saved theme.
  useEffect(() => {
    window.sable.getSettings().then((s) => {
      if (!s) return;
      useSettings.getState().set(s);
      useTheme.getState().hydrate(s.theme);
    });
  }, []);

  // Subscribe to main-process tab events + pull initial state.
  useEffect(() => {
    const offUpsert = window.sable.onTabUpserted(upsert);
    const offRemove = window.sable.onTabRemoved(remove);
    const offActive = window.sable.onActiveTabChanged(setActive);
    window.sable.getTabs().then(({ tabs, activeId }) => setAll(tabs, activeId));
    return () => {
      offUpsert();
      offRemove();
      offActive();
    };
  }, [upsert, remove, setActive, setAll]);

  // Ad-block stats stream + initial fetch.
  useEffect(() => {
    const off = window.sable.onAdblockStats(setStats);
    window.sable.getAdblockStats().then((s) => s && setStats(s));
    return off;
  }, [setStats]);

  // Hide/show the native web view when any chrome overlay (or palette) is up.
  useEffect(() => {
    window.sable.setContentOverlay(overlay !== 'none' || paletteOpen);
  }, [overlay, paletteOpen]);

  // Report the content-area rectangle to main so it can size the active
  // WebContentsView to fill the space to the right of the sidebar.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      window.sable.setViewportBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener('resize', report);
    report();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen bg-canvas text-fg">
      {/* Focus mode (⌘⇧F) removes the sidebar; the ResizeObserver below
          reports the larger rect so the web view expands to fill it. */}
      {!focus && <Sidebar />}
      <div className="relative flex-1">
        {/* Spacer: the Chromium web view is layered on top of this rect. */}
        <div ref={viewportRef} className="absolute inset-0 bg-canvas" />
        {overlay === 'adblock' && <AdblockDashboard />}
        {overlay === 'library' && <Library />}
        {overlay === 'settings' && <Settings />}
        {paletteOpen && <CommandPalette />}
      </div>
    </div>
  );
}
