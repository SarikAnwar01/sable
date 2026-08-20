import { useEffect, useState } from 'react';
import type { SharePayload } from '../types';
import { openShareLink, parseFragment } from '../lib/shareLink';
import { buildWifiUri } from '../lib/wifiQr';
import { Button } from './Bits';
import QrCode from './QrCode';

export type KioskNetwork = SharePayload['networks'][number];

/**
 * Door mode: an old phone or tablet propped by the entrance showing one pass.
 *
 * Constraints that shaped this: it runs unattended for weeks, on a panel that
 * burns in, and it must survive a reboot without someone typing a passphrase —
 * so a kiosk screen is driven by a self-contained URL (see KioskRoute) rather
 * than by the vault. The tablet by the door never holds your other networks.
 */
export default function Kiosk({
  networks,
  rules,
  onExit,
}: {
  networks: KioskNetwork[];
  rules: string;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (networks.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % networks.length), 12_000);
    return () => clearInterval(id);
  }, [networks.length]);

  // A few pixels of drift every minute stops a static QR burning into an OLED
  // panel over a long stay.
  useEffect(() => {
    const id = setInterval(() => setShift((s) => (s + 1) % 16), 60_000);
    return () => clearInterval(id);
  }, []);

  // Keep the screen awake; harmless if the browser refuses.
  useEffect(() => {
    let sentinel: { release(): Promise<void> } | null = null;
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
      }
    ).wakeLock;
    wakeLock
      ?.request('screen')
      .then((s) => {
        sentinel = s;
      })
      .catch(() => undefined);
    return () => {
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  const net = networks[index];
  if (!net) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-400">Nothing to display on this screen.</p>
        <Button onClick={onExit}>Back to Latch</Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col items-center justify-center gap-6 p-6 text-center"
      style={{ transform: `translate(${(shift % 4) - 2}px, ${Math.floor(shift / 4) - 2}px)` }}
    >
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Wi-Fi</p>
        <h1 className="mono mt-2 text-3xl font-semibold sm:text-5xl">{net.ssid}</h1>
        {net.coverage && <p className="mt-1 text-slate-500">{net.coverage}</p>}
      </div>

      <QrCode value={buildWifiUri(net)} size={320} ecl="Q" className="rounded-2xl" />

      <p className="max-w-md text-slate-300">
        Point your phone camera at the code, then tap the banner that appears.
      </p>
      {net.security !== 'open' && (
        <p className="mono text-lg text-slate-400">or type: {net.password}</p>
      )}

      {rules && <p className="max-w-lg text-sm text-slate-500">{rules}</p>}

      {networks.length > 1 && (
        <div className="flex gap-2">
          {networks.map((n, i) => (
            <button
              key={n.ssid}
              onClick={() => setIndex(i)}
              aria-label={`Show ${n.ssid}`}
              className={`h-2 w-8 rounded-full ${i === index ? 'bg-latch' : 'bg-edge'}`}
            />
          ))}
        </div>
      )}

      <button
        onClick={onExit}
        className="fixed bottom-3 right-3 rounded-lg px-3 py-2 text-xs text-slate-700 hover:text-slate-400"
      >
        exit kiosk
      </button>
    </div>
  );
}

/**
 * Decrypts a kiosk URL. Identical machinery to a guest share link — the payload
 * is in the fragment, so it never reaches a server and the tablet needs no
 * vault, no passphrase and no network connection to keep working.
 */
export function KioskRoute({ fragment, onExit }: { fragment: string; onExit: () => void }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const parsed = parseFragment(fragment);
    if (!parsed || parsed.mode !== 'key') {
      setError(true);
      return;
    }
    openShareLink(parsed)
      .then(setPayload)
      .catch(() => setError(true));
  }, [fragment]);

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-400">This kiosk link is damaged. Generate a new one.</p>
        <Button onClick={onExit}>Back to Latch</Button>
      </div>
    );
  }
  if (!payload) {
    return <div className="flex min-h-full items-center justify-center text-slate-600">…</div>;
  }
  return <Kiosk networks={payload.networks} rules={payload.houseInfo.rules} onExit={onExit} />;
}
