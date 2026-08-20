import { useState } from 'react';
import type { GuestPass, WifiNetwork } from '../types';
import { emptyHouseInfo } from '../types';
import { currentFingerprints, newId, useVault } from '../state/store';
import { formatWindow, passStatus, type PassStatus } from '../lib/rotation';
import { Button, Field, Modal, Pill, inputClass } from './Bits';

const STATUS_TONE: Record<PassStatus, string> = {
  active: 'green',
  scheduled: 'slate',
  stale: 'amber',
  expired: 'red',
  revoked: 'red',
};

const STATUS_LABEL: Record<PassStatus, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  stale: 'Password changed',
  expired: 'Expired',
  revoked: 'Revoked',
};

export default function Passes({ onOpen }: { onOpen: (pass: GuestPass) => void }) {
  const { data, fingerprints } = useVault();
  const [building, setBuilding] = useState(false);
  const shareable = data.networks.filter((n) => n.sharePolicy !== 'private');

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Guest passes</h1>
          <p className="text-sm text-slate-500">One pass, four ways to hand it over.</p>
        </div>
        <Button variant="primary" onClick={() => setBuilding(true)} disabled={shareable.length === 0}>
          New pass
        </Button>
      </header>

      {shareable.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-slate-500">
          Every network is marked private, so there is nothing a pass could contain. Set one to
          “in person” or “shareable” first.
        </div>
      )}

      <ul className="space-y-3">
        {data.passes.map((pass) => {
          const status = passStatus(pass, fingerprints);
          const names = pass.networkIds
            .map((id) => data.networks.find((n) => n.id === id)?.ssid)
            .filter(Boolean);
          return (
            <li key={pass.id}>
              <button
                onClick={() => onOpen(pass)}
                className="w-full rounded-xl border border-edge bg-panel p-4 text-left transition hover:border-slate-600"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-100">{pass.label}</span>
                  <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {names.join(', ') || 'no networks'} · {formatWindow(pass)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {building && <PassBuilder networks={shareable} onClose={() => setBuilding(false)} onOpen={onOpen} />}
    </div>
  );
}

function PassBuilder({
  networks,
  onClose,
  onOpen,
}: {
  networks: WifiNetwork[];
  onClose: () => void;
  onOpen: (pass: GuestPass) => void;
}) {
  const { savePass, data } = useVault();
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [house, setHouse] = useState(emptyHouseInfo());

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    // Fingerprints are captured at issue time so a later rotation shows up as
    // "this guest's copy no longer works" rather than silently breaking.
    const fps = await currentFingerprints(data.networks);
    const pass: GuestPass = {
      id: newId(),
      label: label.trim() || 'Guest',
      networkIds: selected,
      houseInfo: house,
      createdAt: new Date().toISOString(),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      revokedAt: null,
      issuedFingerprints: Object.fromEntries(
        selected.map((id) => [id, fps[id] ?? '']),
      ),
    };
    await savePass(pass);
    onClose();
    onOpen(pass);
  };

  return (
    <Modal title="New guest pass" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Who is it for" hint="Shown on the card and in your log.">
          <input
            className={inputClass}
            autoFocus
            value={label}
            placeholder="Priya — spare room"
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wide text-slate-500">Networks</legend>
          <div className="space-y-2">
            {networks.map((net) => (
              <label
                key={net.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                  selected.includes(net.id) ? 'border-latch bg-latch/5' : 'border-edge'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(net.id)}
                  onChange={() => toggle(net.id)}
                />
                <span className="text-xl">{net.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="mono block truncate text-sm text-slate-100">{net.ssid}</span>
                  <span className="block text-xs text-slate-500">
                    {net.sharePolicy === 'qr-only'
                      ? 'In person only — will not be included in a share link'
                      : 'Can be shared by link'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input
              type="date"
              className={inputClass}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Until">
            <input
              type="date"
              className={inputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>
        <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
          An end date does not cut anyone off — a Wi-Fi password cannot be un-shared. It marks the
          pass expired and reminds you to rotate the password, which is what actually works.
        </p>

        <Field label="House rules" hint="Printed on the card and shown with the link.">
          <textarea
            className={inputClass}
            rows={2}
            value={house.rules}
            placeholder="Please keep streaming off the 2.4 GHz network in the evening."
            onChange={(e) => setHouse({ ...house, rules: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Printer">
            <input
              className={inputClass}
              value={house.printer}
              onChange={(e) => setHouse({ ...house, printer: e.target.value })}
            />
          </Field>
          <Field label="TV / cast name">
            <input
              className={inputClass}
              value={house.tv}
              onChange={(e) => setHouse({ ...house, tv: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={() => void create()} disabled={selected.length === 0}>
            Create pass
          </Button>
        </div>
      </div>
    </Modal>
  );
}
