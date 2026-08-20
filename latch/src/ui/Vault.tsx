import { useState } from 'react';
import type { WifiNetwork } from '../types';
import { useVault } from '../state/store';
import { daysUntilRotation, networksNeedingRotation } from '../lib/rotation';
import { buildWifiUri } from '../lib/wifiQr';
import { Button, CopyButton, Pill } from './Bits';
import NetworkEditor, { blankNetwork } from './NetworkEditor';
import QrCode from './QrCode';
import JoinSteps from './JoinSteps';

const POLICY_PILL = {
  private: { tone: 'red', label: 'Private' },
  'qr-only': { tone: 'amber', label: 'In person' },
  shareable: { tone: 'green', label: 'Shareable' },
} as const;

export default function Vault({ onRotate }: { onRotate: () => void }) {
  const { data, fingerprints } = useVault();
  const [editing, setEditing] = useState<WifiNetwork | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const needRotation = networksNeedingRotation(data.networks, data.passes, fingerprints);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Your networks</h1>
          <p className="text-sm text-slate-500">
            {data.networks.length} in the vault ·{' '}
            {data.networks.filter((n) => n.sharePolicy !== 'private').length} shareable
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setEditing(blankNetwork(data.settings.defaultRotateDays))}
        >
          Add network
        </Button>
      </header>

      {needRotation.length > 0 && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-4">
          <p className="text-sm text-amber-200">
            {needRotation.length === 1
              ? `“${needRotation[0]!.ssid}” is due for a new password.`
              : `${needRotation.length} networks are due for a new password.`}
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Either the schedule came round, or a guest pass ran out while the password they were
            given still works.
          </p>
          <Button className="mt-3" onClick={onRotate}>
            Rotate &amp; re-issue
          </Button>
        </div>
      )}

      {data.networks.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-slate-500">
          Add every network in the house — even the ones you will never share. Marking your main
          LAN and IoT networks <strong className="text-slate-300">private</strong> is what stops
          them ever ending up on a guest card.
        </div>
      )}

      <ul className="space-y-3">
        {data.networks.map((net) => {
          const days = daysUntilRotation(net);
          const open = expanded === net.id;
          const pill = POLICY_PILL[net.sharePolicy];
          return (
            <li key={net.id} className="rounded-xl border border-edge bg-panel">
              <div className="flex items-center gap-3 p-4">
                <span className="text-2xl">{net.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono truncate text-slate-100">{net.ssid}</span>
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                    {net.hidden && <Pill>Hidden</Pill>}
                    {days !== null && days <= 0 && <Pill tone="amber">Rotate due</Pill>}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {net.security === 'open' ? 'Open network' : net.security}
                    {net.band !== 'mixed' && ` · ${net.band} GHz`}
                    {net.coverage && ` · ${net.coverage}`}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setExpanded(open ? null : net.id)}>
                  {open ? 'Hide' : 'Show'}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(net)}>
                  Edit
                </Button>
              </div>

              {open && (
                <div className="border-t border-edge p-4">
                  {net.sharePolicy === 'private' ? (
                    <p className="text-sm text-slate-400">
                      This network is marked private, so Latch will not generate a code for it. The
                      password is here for your own reference:
                      <span className="mono ml-2 text-slate-200">{net.password || '—'}</span>
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <QrCode
                        value={buildWifiUri(net)}
                        size={180}
                        className="shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <JoinSteps ssid={net.ssid} hidden={net.hidden} />
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="mono rounded bg-ink px-2 py-1 text-sm text-slate-200">
                            {net.password || 'no password'}
                          </code>
                          {net.password && <CopyButton text={net.password} />}
                        </div>
                      </div>
                    </div>
                  )}
                  {net.notes && <p className="mt-3 text-xs text-slate-500">{net.notes}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editing && <NetworkEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
