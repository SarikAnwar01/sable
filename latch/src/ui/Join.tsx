import { useEffect, useState } from 'react';
import type { SharePayload } from '../types';
import { openShareLink, parseFragment, type ParsedLink } from '../lib/shareLink';
import { buildWifiUri } from '../lib/wifiQr';
import { manualSteps, detectPlatform } from '../lib/platform';
import { Button, CopyButton, Field, inputClass } from './Bits';
import QrCode from './QrCode';

/**
 * What a guest sees. Runs with no vault, no unlock, and no network request:
 * everything it needs came in the URL fragment, which never left their device.
 */
export default function Join({ fragment }: { fragment: string }) {
  const [parsed, setParsed] = useState<ParsedLink | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = parseFragment(fragment);
    if (!p) {
      setError('This link is incomplete or damaged. Ask for a fresh one.');
      return;
    }
    setParsed(p);
    if (p.mode === 'key') {
      openShareLink(p)
        .then(setPayload)
        .catch(() => setError('This link could not be opened. Ask for a fresh one.'));
    }
  }, [fragment]);

  const submitPin = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      setPayload(await openShareLink(parsed, pin));
    } catch {
      setError('That PIN did not open the link.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !payload) {
    return <Centered>{<p className="text-sm text-red-400">{error}</p>}</Centered>;
  }

  if (!payload) {
    if (parsed?.mode === 'pin') {
      return (
        <Centered>
          <form
            className="w-full space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPin();
            }}
          >
            <h1 className="text-xl font-semibold">Enter the PIN</h1>
            <p className="text-sm text-slate-400">
              Whoever sent this link will have given you a short PIN separately.
            </p>
            <Field label="PIN">
              <input
                className={`${inputClass} mono text-center text-2xl tracking-[0.4em]`}
                inputMode="numeric"
                autoFocus
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Checking…' : 'Open'}
            </Button>
          </form>
        </Centered>
      );
    }
    return <Centered>{<p className="text-sm text-slate-500">Opening…</p>}</Centered>;
  }

  const expired = payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now();
  const platform = detectPlatform();

  return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Wi-Fi for</p>
        <h1 className="text-2xl font-semibold">{payload.label}</h1>
      </header>

      {expired && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
          This pass was meant to end on{' '}
          {new Date(payload.expiresAt!).toLocaleDateString()} — check with your host.
        </p>
      )}

      {payload.networks.map((net) => (
        <section key={net.ssid} className="space-y-3 rounded-xl border border-edge bg-panel p-4">
          <div>
            <p className="mono text-lg text-slate-100">
              {net.emoji} {net.ssid}
            </p>
            {net.coverage && <p className="text-xs text-slate-500">{net.coverage}</p>}
          </div>

          {net.security !== 'open' && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono flex-1 rounded bg-ink px-3 py-2 text-base break-all">
                {net.password}
              </code>
              <CopyButton text={net.password} />
            </div>
          )}

          <ol className="space-y-1 text-sm text-slate-300">
            {manualSteps(platform, net.ssid).map((step, i) => (
              <li key={step} className="flex gap-2">
                <span className="mono text-latch">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {net.hidden && (
            <p className="text-xs text-amber-300/80">
              This network is hidden — you will need to add it by hand rather than pick it from the
              list.
            </p>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-400">
              Joining on another device? Scan this
            </summary>
            <div className="mt-3 flex justify-center">
              <QrCode value={buildWifiUri(net)} size={200} className="rounded-lg" />
            </div>
          </details>
        </section>
      ))}

      {(payload.houseInfo.rules || payload.houseInfo.printer || payload.houseInfo.tv || payload.houseInfo.extra) && (
        <section className="space-y-2 rounded-xl border border-edge bg-panel p-4 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">While you are here</h2>
          {payload.houseInfo.rules && <p className="text-slate-300">{payload.houseInfo.rules}</p>}
          {payload.houseInfo.printer && (
            <p className="text-slate-400">Printer: <span className="mono">{payload.houseInfo.printer}</span></p>
          )}
          {payload.houseInfo.tv && (
            <p className="text-slate-400">TV / cast: <span className="mono">{payload.houseInfo.tv}</span></p>
          )}
          {payload.houseInfo.extra && <p className="text-slate-400">{payload.houseInfo.extra}</p>}
        </section>
      )}

      <p className="text-center text-xs text-slate-600">
        This page decrypted the details on your device. Nothing was sent to a server.
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  );
}
