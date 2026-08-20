import { useState } from 'react';
import type { SecurityType, SharePolicy, WifiNetwork } from '../types';
import { newId, useVault } from '../state/store';
import { Button, Field, Modal, inputClass } from './Bits';

const POLICY_COPY: Record<SharePolicy, { title: string; blurb: string }> = {
  private: {
    title: 'Private — never shared',
    blurb: 'Stored for your reference only. Cannot be added to a pass, card, tag or kiosk.',
  },
  'qr-only': {
    title: 'In person only',
    blurb: 'Can be handed over by QR, printed card or NFC tag, but never sent as a link.',
  },
  shareable: {
    title: 'Shareable',
    blurb: 'Can also be sent to a guest as a link.',
  },
};

export function blankNetwork(defaultRotateDays: number | null): WifiNetwork {
  const now = new Date().toISOString();
  return {
    id: newId(),
    ssid: '',
    password: '',
    security: 'WPA2',
    hidden: false,
    band: 'mixed',
    coverage: '',
    emoji: '📶',
    notes: '',
    sharePolicy: 'private',
    rotateEveryDays: defaultRotateDays,
    passwordSetAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export default function NetworkEditor({
  initial,
  onClose,
}: {
  initial: WifiNetwork;
  onClose: () => void;
}) {
  const { saveNetwork, deleteNetwork, data } = useVault();
  const isNew = !data.networks.some((n) => n.id === initial.id);
  const [net, setNet] = useState<WifiNetwork>(initial);
  const set = <K extends keyof WifiNetwork>(key: K, value: WifiNetwork[K]) =>
    setNet((n) => ({ ...n, [key]: value }));

  const save = async () => {
    if (!net.ssid.trim()) return;
    // Changing the password by hand here counts as a rotation: the timestamp is
    // what tells us which guest passes have gone stale.
    const original = data.networks.find((n) => n.id === net.id);
    const rotated = original && original.password !== net.password;
    await saveNetwork({
      ...net,
      ssid: net.ssid.trim(),
      updatedAt: new Date().toISOString(),
      passwordSetAt: rotated ? new Date().toISOString() : net.passwordSetAt,
    });
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add network' : 'Edit network'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="w-20">
            <Field label="Icon">
              <input
                className={`${inputClass} text-center text-xl`}
                value={net.emoji}
                maxLength={4}
                onChange={(e) => set('emoji', e.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Network name (SSID)" hint="Exactly as it appears — it is case sensitive.">
              <input
                className={`${inputClass} mono`}
                value={net.ssid}
                autoFocus
                onChange={(e) => set('ssid', e.target.value)}
              />
            </Field>
          </div>
        </div>

        <Field label="Password">
          <input
            className={`${inputClass} mono`}
            value={net.password}
            onChange={(e) => set('password', e.target.value)}
            placeholder={net.security === 'open' ? 'Not needed on an open network' : ''}
            disabled={net.security === 'open'}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Security">
            <select
              className={inputClass}
              value={net.security}
              onChange={(e) => set('security', e.target.value as SecurityType)}
            >
              <option value="WPA3">WPA3</option>
              <option value="WPA2">WPA2 / WPA</option>
              <option value="WEP">WEP (old)</option>
              <option value="open">Open (no password)</option>
            </select>
          </Field>
          <Field label="Band">
            <select
              className={inputClass}
              value={net.band}
              onChange={(e) => set('band', e.target.value as WifiNetwork['band'])}
            >
              <option value="mixed">Mixed</option>
              <option value="2.4">2.4 GHz</option>
              <option value="5">5 GHz</option>
              <option value="6">6 GHz</option>
            </select>
          </Field>
        </div>

        <Field label="Where it reaches" hint="Shown to guests: “whole house”, “garden and garage”.">
          <input
            className={inputClass}
            value={net.coverage}
            onChange={(e) => set('coverage', e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={net.hidden}
            onChange={(e) => set('hidden', e.target.checked)}
          />
          Hidden network (does not appear in the Wi-Fi list)
        </label>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs uppercase tracking-wide text-slate-500">
            Sharing
          </legend>
          {(Object.keys(POLICY_COPY) as SharePolicy[]).map((policy) => (
            <label
              key={policy}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                net.sharePolicy === policy ? 'border-latch bg-latch/5' : 'border-edge'
              }`}
            >
              <input
                type="radio"
                className="mt-1"
                checked={net.sharePolicy === policy}
                onChange={() => set('sharePolicy', policy)}
              />
              <span>
                <span className="block text-sm text-slate-100">{POLICY_COPY[policy].title}</span>
                <span className="block text-xs text-slate-500">{POLICY_COPY[policy].blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Field
          label="Remind me to change this password"
          hint="Rotating is the only real way to cut off old guests. Latch will nudge you."
        >
          <select
            className={inputClass}
            value={net.rotateEveryDays ?? ''}
            onChange={(e) => set('rotateEveryDays', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Never</option>
            <option value="30">Every 30 days</option>
            <option value="90">Every 90 days</option>
            <option value="180">Every 6 months</option>
            <option value="365">Every year</option>
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            className={inputClass}
            rows={2}
            value={net.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>

        <div className="flex justify-between pt-2">
          {!isNew ? (
            <Button
              variant="danger"
              onClick={async () => {
                await deleteNetwork(net.id);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={() => void save()} disabled={!net.ssid.trim()}>
            Save network
          </Button>
        </div>
      </div>
    </Modal>
  );
}
