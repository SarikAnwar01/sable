import { useVault } from '../state/store';
import { Pill } from './Bits';

const CHANNEL_LABEL: Record<string, string> = {
  qr: 'Shown in person',
  link: 'Sent a link',
  print: 'Printed a card',
  nfc: 'Wrote a tag',
  kiosk: 'Kiosk',
};

/**
 * The share log. Local, append-only-ish (capped at 500), and the thing that
 * answers "who did we give the Wi-Fi to, and when?" six months later.
 */
export default function LogView() {
  const { data } = useVault();

  if (data.log.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-slate-500">
        Nothing shared yet. Every code you show, link you send, card you print and tag you write
        gets recorded here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Share log</h1>
        <p className="text-sm text-slate-500">Kept on this device only.</p>
      </header>
      <ul className="space-y-2">
        {data.log.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-edge bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-100">{entry.passLabel}</span>
              <Pill>{CHANNEL_LABEL[entry.channel] ?? entry.channel}</Pill>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(entry.at).toLocaleString()}
              {entry.networkNames.length > 0 && ` · ${entry.networkNames.join(', ')}`}
            </p>
            {entry.note && <p className="mt-1 text-xs text-slate-400">{entry.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
