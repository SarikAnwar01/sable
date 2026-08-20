import { useMemo, useState } from 'react';
import type { GuestPass, SharePayload, ShareChannel, WifiNetwork } from '../types';
import { useVault } from '../state/store';
import { buildShareLink, type ShareMode } from '../lib/shareLink';
import { buildWifiUri } from '../lib/wifiQr';
import { nfcSupported, writeWifiTag, type NfcWriteResult } from '../lib/wsc';
import { formatWindow, passStatus } from '../lib/rotation';
import { Button, CopyButton, Field, Pill, inputClass } from './Bits';
import QrCode from './QrCode';
import JoinSteps from './JoinSteps';
import PrintSheet, { LAYOUT_LABEL, type CardLayout } from './print/Card';

type Tab = 'codes' | 'link' | 'tag' | 'card' | 'door';

export default function PassView({ pass, onBack }: { pass: GuestPass; onBack: () => void }) {
  const { data, fingerprints, revokePass, deletePass, log } = useVault();
  const [tab, setTab] = useState<Tab>('codes');
  const [printLayout, setPrintLayout] = useState<CardLayout>('bedside');

  const networks = useMemo(
    () =>
      pass.networkIds
        .map((id) => data.networks.find((n) => n.id === id))
        .filter((n): n is WifiNetwork => !!n),
    [pass, data.networks],
  );
  const status = passStatus(pass, fingerprints);

  const record = (channel: ShareChannel, note: string) =>
    void log({
      passId: pass.id,
      passLabel: pass.label,
      networkNames: networks.map((n) => n.ssid),
      channel,
      note,
    });

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <Button variant="ghost" onClick={onBack} className="mb-1 -ml-3">
              ← All passes
            </Button>
            <h1 className="text-xl font-semibold">{pass.label}</h1>
            <p className="text-sm text-slate-500">
              {formatWindow(pass)} · {networks.length} network{networks.length === 1 ? '' : 's'}
            </p>
          </div>
          <Pill tone={status === 'active' ? 'green' : status === 'stale' ? 'amber' : 'red'}>
            {status}
          </Pill>
        </header>

        {status === 'stale' && (
          <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
            A password in this pass has changed since it was issued. Anything you already gave this
            guest has stopped working — re-send from here.
          </p>
        )}

        <nav className="flex gap-1 rounded-lg border border-edge bg-panel p-1">
          {(['codes', 'link', 'tag', 'card', 'door'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-3 py-2 text-sm capitalize transition ${
                tab === t ? 'bg-latch text-ink font-semibold' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === 'codes' && (
          <div className="space-y-4">
            {networks.map((net) => (
              <div key={net.id} className="rounded-xl border border-edge bg-panel p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <QrCode value={buildWifiUri(net)} size={200} className="shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <p className="mono text-slate-100">
                        {net.emoji} {net.ssid}
                      </p>
                      {net.coverage && <p className="text-xs text-slate-500">{net.coverage}</p>}
                    </div>
                    <JoinSteps ssid={net.ssid} hidden={net.hidden} />
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="mono rounded bg-ink px-2 py-1 text-sm">{net.password}</code>
                      <CopyButton text={net.password} label="Copy password" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button onClick={() => record('qr', 'Showed the QR in person')}>
              Log that I showed this
            </Button>
          </div>
        )}

        {tab === 'link' && <LinkTab pass={pass} onShared={(note) => record('link', note)} />}

        {tab === 'tag' && <TagTab pass={pass} onWritten={(note) => record('nfc', note)} />}

        {tab === 'door' && <DoorTab pass={pass} onLaunched={(note) => record('kiosk', note)} />}

        {tab === 'card' && (
          <div className="space-y-3">
            <Field label="Layout">
              <select
                className={inputClass}
                value={printLayout}
                onChange={(e) => setPrintLayout(e.target.value as CardLayout)}
              >
                {(Object.keys(LAYOUT_LABEL) as CardLayout[]).map((l) => (
                  <option key={l} value={l}>
                    {LAYOUT_LABEL[l]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-slate-400">
              Printing opens your browser's print dialog — choose “Save as PDF” there if you want a
              file rather than paper.
            </p>
            <Button
              variant="primary"
              onClick={() => {
                record('print', `Printed the ${LAYOUT_LABEL[printLayout]}`);
                window.print();
              }}
            >
              Print
            </Button>
            <div className="overflow-x-auto rounded-xl border border-edge bg-white p-4">
              <div className="min-w-[380px]">
              <PrintSheet pass={pass} networks={networks} layout={printLayout} />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t border-edge pt-4">
          {!pass.revokedAt && (
            <Button onClick={() => void revokePass(pass.id)}>Mark revoked</Button>
          )}
          <Button
            variant="danger"
            onClick={async () => {
              await deletePass(pass.id);
              onBack();
            }}
          >
            Delete pass
          </Button>
        </div>
      </div>

      {/* Printed output: only the sheet, never the app chrome. */}
      <div className="print-only">
        <PrintSheet pass={pass} networks={networks} layout={printLayout} />
      </div>
    </div>
  );
}

/**
 * The networks in a pass that may be packed into a URL. `qr-only` networks are
 * filtered out *here*, where the payload is built, so no caller can bypass it —
 * that is the difference between a policy and a suggestion.
 */
function linkablePayload(pass: GuestPass, all: WifiNetwork[]): { payload: SharePayload; count: number } {
  const linkable = pass.networkIds
    .map((id) => all.find((n) => n.id === id))
    .filter((n): n is WifiNetwork => !!n && n.sharePolicy === 'shareable');
  return {
    count: linkable.length,
    payload: {
      v: 1,
      label: pass.label,
      expiresAt: pass.expiresAt,
      houseInfo: pass.houseInfo,
      networks: linkable.map((n) => ({
        ssid: n.ssid,
        password: n.password,
        security: n.security,
        hidden: n.hidden,
        emoji: n.emoji,
        coverage: n.coverage,
      })),
    },
  };
}

function DoorTab({ pass, onLaunched }: { pass: GuestPass; onLaunched: (note: string) => void }) {
  const { data } = useVault();
  const [url, setUrl] = useState<string | null>(null);
  const { payload, count } = linkablePayload(pass, data.networks);
  const excluded = pass.networkIds.length - count;
  const baseUrl = data.settings.baseUrl.trim().replace(/\/+$/, '');

  const build = async () => {
    const built = await buildShareLink(payload, '', 'key');
    setUrl(`${baseUrl}/?kiosk=1${built.fragment}`);
    onLaunched('Generated a kiosk screen link');
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
        Park an old phone or tablet by the door. The kiosk link carries this pass inside it, so the
        screen keeps working after a reboot with no passphrase and no internet — and that device
        never holds the rest of your vault.
      </p>

      {excluded > 0 && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
          {excluded} in-person-only network{excluded === 1 ? '' : 's'} left out: a kiosk link is
          still a link, and those never travel in one. Preview the door screen on this device to
          show {excluded === 1 ? 'it' : 'them'}.
        </p>
      )}

      {count === 0 ? (
        <p className="text-sm text-slate-400">Nothing in this pass may go into a kiosk link.</p>
      ) : !baseUrl ? (
        <p className="text-sm text-amber-300">
          Set your site address in Settings first — the tablet needs a real URL to open.
        </p>
      ) : (
        <>
          <Button variant="primary" onClick={() => void build()}>
            {url ? 'Generate a new kiosk link' : 'Generate kiosk link'}
          </Button>
          {url && (
            <div className="space-y-3 rounded-xl border border-edge bg-panel p-4">
              <p className="mono break-all text-xs text-slate-300">{url}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={url} label="Copy kiosk link" />
                <Button onClick={() => window.open(url, '_blank')}>Open it here</Button>
              </div>
              <p className="text-xs text-slate-500">
                Open this on the tablet, then add it to the home screen and leave it running.
              </p>
            </div>
          )}
        </>
      )}

      <Button
        onClick={() => {
          onLaunched('Opened the door screen on this device');
          location.href = `?kiosk=1&pass=${pass.id}`;
        }}
      >
        Preview on this device
      </Button>
    </div>
  );
}

function LinkTab({ pass, onShared }: { pass: GuestPass; onShared: (note: string) => void }) {
  const { data } = useVault();
  const [mode, setMode] = useState<ShareMode>('key');
  const [pin, setPin] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { payload, count: linkableCount } = linkablePayload(pass, data.networks);
  const excluded = pass.networkIds.length - linkableCount;
  const baseUrl = data.settings.baseUrl.trim();

  const generate = async () => {
    setError(null);
    if (mode === 'pin' && pin.length < 4) {
      setError('Use at least 4 digits — 6 is better.');
      return;
    }
    const built = await buildShareLink(payload, baseUrl, mode, pin);
    setLink(built.url);
    onShared(mode === 'pin' ? 'Generated a PIN-protected link' : 'Generated a share link');
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
        The password is encrypted into the part of the URL after the <span className="mono">#</span>,
        which browsers never send to a server. Nobody hosting this page — including whoever runs the
        server — can see what you shared.
      </p>

      {excluded > 0 && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
          {excluded} network{excluded === 1 ? ' is' : 's are'} marked in-person only and{' '}
          {excluded === 1 ? 'is' : 'are'} left out of this link. Hand{' '}
          {excluded === 1 ? 'it' : 'them'} over by QR, card or tag instead.
        </p>
      )}

      {linkableCount === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing in this pass may be sent as a link.
        </p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs uppercase tracking-wide text-slate-500">
              Who can open it
            </legend>
            <label
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === 'key' ? 'border-latch bg-latch/5' : 'border-edge'}`}
            >
              <input type="radio" checked={mode === 'key'} onChange={() => setMode('key')} className="mt-1" />
              <span>
                <span className="block text-sm">Anyone with the link</span>
                <span className="block text-xs text-slate-500">
                  Simplest. Forwardable — treat it like the password itself.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === 'pin' ? 'border-latch bg-latch/5' : 'border-edge'}`}
            >
              <input type="radio" checked={mode === 'pin'} onChange={() => setMode('pin')} className="mt-1" />
              <span>
                <span className="block text-sm">Link plus a PIN</span>
                <span className="block text-xs text-slate-500">
                  Tell the guest the PIN another way. A 6-digit PIN is meaningfully harder to guess
                  than 4 if someone captures the link.
                </span>
              </span>
            </label>
          </fieldset>

          {mode === 'pin' && (
            <Field label="PIN">
              <input
                className={`${inputClass} mono`}
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          )}

          {!baseUrl && (
            <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
              No site address is set yet, so Latch can only give you the fragment. Add your deployed
              address in Settings to get a link a guest can open.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button variant="primary" onClick={() => void generate()}>
            {link ? 'Generate a new link' : 'Generate link'}
          </Button>

          {link && (
            <div className="space-y-3 rounded-xl border border-edge bg-panel p-4">
              <p className="mono break-all text-xs text-slate-300">{link}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={link} label="Copy link" />
                {typeof navigator.share === 'function' && (
                  <Button
                    onClick={() =>
                      void navigator
                        .share({ title: `Wi-Fi — ${pass.label}`, url: link })
                        .catch(() => undefined)
                    }
                  >
                    Share…
                  </Button>
                )}
              </div>
              {baseUrl && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <QrCode value={link} size={180} ecl="L" className="rounded-lg" />
                  <p className="text-xs text-slate-500">Or let them scan the link itself.</p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Generating a new link does not disable the old one. Only changing the password does.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TagTab({ pass, onWritten }: { pass: GuestPass; onWritten: (note: string) => void }) {
  const { data } = useVault();
  const [result, setResult] = useState<NfcWriteResult | null>(null);
  const [writing, setWriting] = useState(false);
  const networks = pass.networkIds
    .map((id) => data.networks.find((n) => n.id === id))
    .filter((n): n is WifiNetwork => !!n);

  const write = async (index: number) => {
    const net = networks[index];
    if (!net) return;
    setWriting(true);
    setResult(null);
    const res = await writeWifiTag(
      { ssid: net.ssid, password: net.password, security: net.security },
      '',
    );
    setResult(res);
    setWriting(false);
    if (res.ok) onWritten(`Wrote an NFC tag for ${net.ssid}`);
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
        Writes a standard Wi-Fi credential tag: a guest taps their phone on the sticker and joins,
        no scanning, no typing. This needs <strong className="text-slate-200">Chrome on Android</strong>{' '}
        — Web NFC does not exist on iOS or desktop.
      </p>

      {!nfcSupported() && (
        <p className="text-sm text-amber-300">
          This device cannot write tags. Open Latch in Chrome on an Android phone to use it.
        </p>
      )}

      {networks.map((net, i) => (
        <div key={net.id} className="flex items-center gap-3 rounded-xl border border-edge bg-panel p-4">
          <span className="text-xl">{net.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="mono truncate text-sm text-slate-100">{net.ssid}</p>
            {net.security === 'WPA3' && (
              <p className="text-xs text-amber-300/80">
                Tags describe WPA3 as WPA2 — the format has no WPA3 code. Fine on a mixed-mode
                router, may not connect on a WPA3-only one.
              </p>
            )}
          </div>
          <Button onClick={() => void write(i)} disabled={!nfcSupported() || writing}>
            {writing ? 'Tap a tag…' : 'Write tag'}
          </Button>
        </div>
      ))}

      {result &&
        (result.ok ? (
          <p className="text-sm text-emerald-300">
            {result.kind === 'wifi'
              ? 'Tag written. Tap a phone on it to join.'
              : 'The handset refused a Wi-Fi tag, so a link was written instead.'}
          </p>
        ) : (
          <p className="text-sm text-red-400">{result.reason}</p>
        ))}
    </div>
  );
}
