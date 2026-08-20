/**
 * Expiry and rotation logic.
 *
 * Latch's central honesty: an expiry date on a shared WPA password revokes
 * nothing. What it does is tell you *when to rotate*, and which guests were
 * issued against the old password so you know who to re-send to.
 */
import type { GuestPass, WifiNetwork } from '../types';

export type PassStatus = 'scheduled' | 'active' | 'expired' | 'revoked' | 'stale';

export const DAY_MS = 86_400_000;

/**
 * `stale` means the pass is still within its window but at least one of its
 * networks has had its password changed since the pass was issued — so the QR
 * in the guest's pocket no longer works.
 */
export function passStatus(
  pass: GuestPass,
  fingerprints: Record<string, string>,
  now: number = Date.now(),
): PassStatus {
  if (pass.revokedAt) return 'revoked';
  if (pass.expiresAt && new Date(pass.expiresAt).getTime() <= now) return 'expired';
  if (pass.startsAt && new Date(pass.startsAt).getTime() > now) return 'scheduled';
  const drifted = pass.networkIds.some((id) => {
    const issued = pass.issuedFingerprints[id];
    const current = fingerprints[id];
    return issued !== undefined && current !== undefined && issued !== current;
  });
  return drifted ? 'stale' : 'active';
}

export function isLive(status: PassStatus): boolean {
  return status === 'active' || status === 'scheduled' || status === 'stale';
}

/** Days until this network's rotation nudge fires. Negative = overdue. */
export function daysUntilRotation(network: WifiNetwork, now: number = Date.now()): number | null {
  if (network.rotateEveryDays === null) return null;
  const due = new Date(network.passwordSetAt).getTime() + network.rotateEveryDays * DAY_MS;
  return Math.ceil((due - now) / DAY_MS);
}

export function rotationOverdue(network: WifiNetwork, now: number = Date.now()): boolean {
  const days = daysUntilRotation(network, now);
  return days !== null && days <= 0;
}

/**
 * Networks worth rotating right now: either the schedule says so, or a pass
 * that used them has run out and the password is still the one that guest has.
 */
export function networksNeedingRotation(
  networks: WifiNetwork[],
  passes: GuestPass[],
  fingerprints: Record<string, string>,
  now: number = Date.now(),
): WifiNetwork[] {
  const fromDeadPasses = new Set<string>();
  for (const pass of passes) {
    const status = passStatus(pass, fingerprints, now);
    if (status !== 'expired' && status !== 'revoked') continue;
    for (const id of pass.networkIds) {
      // Only if the guest's copy still works — otherwise it is already handled.
      if (pass.issuedFingerprints[id] === fingerprints[id]) fromDeadPasses.add(id);
    }
  }
  return networks.filter((n) => rotationOverdue(n, now) || fromDeadPasses.has(n.id));
}

export function formatWindow(pass: GuestPass): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (pass.startsAt && pass.expiresAt) return `${fmt(pass.startsAt)} – ${fmt(pass.expiresAt)}`;
  if (pass.expiresAt) return `until ${fmt(pass.expiresAt)}`;
  if (pass.startsAt) return `from ${fmt(pass.startsAt)}`;
  return 'no end date';
}
