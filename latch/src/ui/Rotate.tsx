import { useMemo, useState } from 'react';
import type { GuestPass, WifiNetwork } from '../types';
import { useVault } from '../state/store';
import { generatePassword } from '../lib/password';
import { isLive, networksNeedingRotation, passStatus } from '../lib/rotation';
import { Button, CopyButton, Field, Pill, inputClass } from './Bits';

/**
 * Rotate & re-issue — the screen the whole product is built around.
 *
 * Expiry dates cannot claw back a shared password; changing it can. This makes
 * that cheap: pick the new password, see exactly which guests it cuts off, and
 * get a ready-made message for the ones you still want connected.
 */
export default function Rotate({ onDone }: { onDone: () => void }) {
  const { data, fingerprints, rotatePassword } = useVault();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [rotated, setRotated] = useState<WifiNetwork | null>(null);

  const due = useMemo(
    () => networksNeedingRotation(data.networks, data.passes, fingerprints),
    [data, fingerprints],
  );
  const network = data.networks.find((n) => n.id === selectedId) ?? null;

  // Who was still relying on this password, and who was already cut off.
  const affected = useMemo(() => {
    if (!network) return { keep: [], drop: [] };
    const keep: GuestPass[] = [];
    const drop: GuestPass[] = [];
    for (const pass of data.passes) {
      if (!pass.networkIds.includes(network.id)) continue;
      if (pass.issuedFingerprints[network.id] !== fingerprints[network.id]) continue;
      (isLive(passStatus(pass, fingerprints)) ? keep : drop).push(pass);
    }
    return { keep, drop };
  }, [network, data.passes, fingerprints]);

  const apply = async () => {
    if (!network || !password.trim()) return;
    await rotatePassword(network.id, password.trim());
    setRotated({ ...network, password: password.trim() });
  };

  if (rotated) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Password changed</h1>
        <div className="rounded-xl border border-edge bg-panel p-4">
          <p className="text-sm text-slate-400">
            Set this as the new password for <span className="mono text-slate-100">{rotated.ssid}</span>{' '}
            on your router. Until you do, nobody can connect with it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="mono rounded bg-ink px-3 py-2 text-lg">{rotated.password}</code>
            <CopyButton text={rotated.password} />
          </div>
        </div>

        {affected.keep.length > 0 && (
          <div className="space-y-2 rounded-xl border border-edge bg-panel p-4">
            <h2 className="text-sm font-medium">Re-send to {affected.keep.length} guest(s)</h2>
            <p className="text-xs text-slate-500">
              Their old code has stopped working. Open each pass to send a fresh one.
            </p>
            <ul className="space-y-2 pt-1">
              {affected.keep.map((pass) => (
                <li key={pass.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{pass.label}</span>
                  <CopyButton
                    label="Copy message"
                    text={`Hi — our Wi-Fi password changed. New details for "${rotated.ssid}": ${rotated.password}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {affected.drop.length > 0 && (
          <p className="text-sm text-slate-400">
            {affected.drop.length} expired or revoked pass(es) are now genuinely cut off.
          </p>
        )}

        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Rotate &amp; re-issue</h1>
        <p className="text-sm text-slate-500">
          Changing the password is the only thing that actually removes access.
        </p>
      </header>

      <div className="space-y-2">
        {data.networks
          .filter((n) => n.sharePolicy !== 'private' || due.some((d) => d.id === n.id))
          .map((net) => (
            <label
              key={net.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${
                selectedId === net.id ? 'border-latch bg-latch/5' : 'border-edge bg-panel'
              }`}
            >
              <input
                type="radio"
                checked={selectedId === net.id}
                onChange={() => {
                  setSelectedId(net.id);
                  setPassword(generatePassword());
                }}
              />
              <span className="text-xl">{net.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="mono block truncate text-sm text-slate-100">{net.ssid}</span>
                <span className="block text-xs text-slate-500">
                  set {new Date(net.passwordSetAt).toLocaleDateString()}
                </span>
              </span>
              {due.some((d) => d.id === net.id) && <Pill tone="amber">Due</Pill>}
            </label>
          ))}
      </div>

      {network && (
        <div className="space-y-4 rounded-xl border border-edge bg-panel p-4">
          <Field label="New password" hint="Generated without characters people misread aloud.">
            <div className="flex gap-2">
              <input
                className={`${inputClass} mono`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button onClick={() => setPassword(generatePassword())}>New</Button>
            </div>
          </Field>

          <div className="text-sm">
            <p className="text-slate-400">
              This will cut off <strong className="text-slate-200">{affected.keep.length}</strong>{' '}
              active pass(es) and{' '}
              <strong className="text-slate-200">{affected.drop.length}</strong> expired one(s).
            </p>
            {affected.keep.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                You will get a re-send list for the active ones on the next screen.
              </p>
            )}
          </div>

          <Button variant="primary" onClick={() => void apply()} disabled={!password.trim()}>
            Change the password
          </Button>
        </div>
      )}
    </div>
  );
}
