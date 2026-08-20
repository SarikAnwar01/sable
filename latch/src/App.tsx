import { useEffect, useMemo, useRef, useState } from 'react';
import type { GuestPass, WifiNetwork } from './types';
import { useVault } from './state/store';
import { FRAGMENT_PREFIX } from './lib/shareLink';
import Lock from './ui/Lock';
import Vault from './ui/Vault';
import Passes from './ui/Passes';
import PassView from './ui/PassView';
import Join from './ui/Join';
import Kiosk, { KioskRoute } from './ui/Kiosk';
import LogView from './ui/LogView';
import SettingsView from './ui/SettingsView';
import Rotate from './ui/Rotate';

type View = 'vault' | 'passes' | 'log' | 'settings' | 'rotate';

const NAV: Array<{ id: View; label: string; icon: string }> = [
  { id: 'vault', label: 'Networks', icon: '📶' },
  { id: 'passes', label: 'Passes', icon: '🎟️' },
  { id: 'log', label: 'Log', icon: '🕓' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

/**
 * No router library. There are exactly two URL-driven entry points — a share
 * fragment and kiosk mode — and the share payload already owns the fragment, so
 * a hash router would collide with it.
 */
export default function App() {
  const { status, init, lock, data } = useVault();
  const [view, setView] = useState<View>('vault');
  const [openPass, setOpenPass] = useState<GuestPass | null>(null);
  const [kiosk, setKiosk] = useState(() => new URLSearchParams(location.search).has('kiosk'));
  const fragment = useMemo(() => location.hash, []);
  const hasPayload = fragment.startsWith(FRAGMENT_PREFIX);
  const exitKiosk = () => {
    history.replaceState(null, '', location.pathname);
    setKiosk(false);
  };

  useEffect(() => {
    if (!hasPayload) void init();
  }, [init, hasPayload]);

  useAutoLock(status === 'unlocked' && !kiosk ? data.settings.autoLockMinutes : 0, lock);

  // Unlocking always lands on the networks list, so an auto-lock (or an erase
  // and re-create) never drops you back into whichever screen you left open.
  useEffect(() => {
    if (status === 'unlocked') {
      setView('vault');
      setOpenPass(null);
    }
  }, [status]);

  // Both of these run with no vault at all: a guest opening a share link, and a
  // tablet by the door that has just rebooted, must never see a passphrase box.
  if (hasPayload && kiosk) return <KioskRoute fragment={fragment} onExit={exitKiosk} />;
  if (hasPayload) return <Join fragment={fragment} />;

  if (status === 'loading') {
    return <div className="flex min-h-full items-center justify-center text-slate-600">…</div>;
  }
  if (status !== 'unlocked') return <Lock />;

  // Kiosk without a payload: previewing the door screen on your own device.
  if (kiosk) {
    const passId = new URLSearchParams(location.search).get('pass');
    const pass = data.passes.find((p) => p.id === passId) ?? data.passes[0];
    const networks = (pass?.networkIds ?? [])
      .map((id) => data.networks.find((n) => n.id === id))
      // Belt and braces: a private network must never reach a screen by the door.
      .filter((n): n is WifiNetwork => !!n && n.sharePolicy !== 'private');
    return (
      <Kiosk networks={networks} rules={pass?.houseInfo.rules ?? ''} onExit={exitKiosk} />
    );
  }

  // The pass in state can go stale after an edit elsewhere; re-read it by id.
  const currentPass = openPass ? data.passes.find((p) => p.id === openPass.id) ?? null : null;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <main className="flex-1 p-4 pb-24 sm:p-6">
        {currentPass ? (
          <PassView pass={currentPass} onBack={() => setOpenPass(null)} />
        ) : view === 'vault' ? (
          <Vault onRotate={() => setView('rotate')} />
        ) : view === 'passes' ? (
          <Passes onOpen={setOpenPass} />
        ) : view === 'log' ? (
          <LogView />
        ) : view === 'rotate' ? (
          <Rotate onDone={() => setView('vault')} />
        ) : (
          <SettingsView />
        )}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 border-t border-edge bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setOpenPass(null);
                setView(item.id);
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs transition ${
                view === item.id && !currentPass ? 'text-latch' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/**
 * Locks the vault after a period of inactivity, and immediately when the tab is
 * hidden past that window — a phone in a pocket should not be left unlocked.
 */
function useAutoLock(minutes: number, lock: () => void) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!minutes) return;
    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    events.forEach((e) => document.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => document.removeEventListener(e, reset));
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [minutes, lock]);
}
