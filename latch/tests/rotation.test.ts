import { describe, expect, it } from 'vitest';
import type { GuestPass, WifiNetwork } from '../src/types';
import { emptyHouseInfo } from '../src/types';
import {
  DAY_MS,
  daysUntilRotation,
  networksNeedingRotation,
  passStatus,
} from '../src/lib/rotation';

const NOW = Date.parse('2026-06-01T12:00:00Z');

function network(over: Partial<WifiNetwork> = {}): WifiNetwork {
  return {
    id: 'net-1',
    ssid: 'Guest',
    password: 'pw',
    security: 'WPA2',
    hidden: false,
    band: 'mixed',
    coverage: '',
    emoji: '📶',
    notes: '',
    sharePolicy: 'shareable',
    rotateEveryDays: null,
    passwordSetAt: new Date(NOW).toISOString(),
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function pass(over: Partial<GuestPass> = {}): GuestPass {
  return {
    id: 'pass-1',
    label: 'Guest',
    networkIds: ['net-1'],
    houseInfo: emptyHouseInfo(),
    createdAt: new Date(NOW).toISOString(),
    startsAt: null,
    expiresAt: null,
    revokedAt: null,
    issuedFingerprints: { 'net-1': 'aaaa' },
    ...over,
  };
}

describe('passStatus', () => {
  it('is active while inside its window and the password is unchanged', () => {
    expect(passStatus(pass(), { 'net-1': 'aaaa' }, NOW)).toBe('active');
  });

  it('is scheduled before it starts', () => {
    const p = pass({ startsAt: new Date(NOW + DAY_MS).toISOString() });
    expect(passStatus(p, { 'net-1': 'aaaa' }, NOW)).toBe('scheduled');
  });

  it('is expired once the end date has passed', () => {
    const p = pass({ expiresAt: new Date(NOW - 1).toISOString() });
    expect(passStatus(p, { 'net-1': 'aaaa' }, NOW)).toBe('expired');
  });

  it('is revoked regardless of dates', () => {
    const p = pass({ revokedAt: new Date(NOW).toISOString() });
    expect(passStatus(p, { 'net-1': 'aaaa' }, NOW)).toBe('revoked');
  });

  it('is stale when the password has been rotated since issue', () => {
    expect(passStatus(pass(), { 'net-1': 'bbbb' }, NOW)).toBe('stale');
  });
});

describe('daysUntilRotation', () => {
  it('is null when no schedule is set', () => {
    expect(daysUntilRotation(network(), NOW)).toBeNull();
  });

  it('counts down from when the password was set', () => {
    const net = network({
      rotateEveryDays: 30,
      passwordSetAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    });
    expect(daysUntilRotation(net, NOW)).toBe(20);
  });

  it('goes negative once overdue', () => {
    const net = network({
      rotateEveryDays: 30,
      passwordSetAt: new Date(NOW - 40 * DAY_MS).toISOString(),
    });
    expect(daysUntilRotation(net, NOW)).toBe(-10);
  });
});

describe('networksNeedingRotation', () => {
  it('flags a network whose expired pass still holds the current password', () => {
    const net = network();
    const expired = pass({ expiresAt: new Date(NOW - DAY_MS).toISOString() });
    const due = networksNeedingRotation([net], [expired], { 'net-1': 'aaaa' }, NOW);
    expect(due.map((n) => n.id)).toEqual(['net-1']);
  });

  it('leaves it alone once the password has already moved on', () => {
    const net = network();
    const expired = pass({ expiresAt: new Date(NOW - DAY_MS).toISOString() });
    // Current fingerprint differs from the one issued: already rotated.
    const due = networksNeedingRotation([net], [expired], { 'net-1': 'zzzz' }, NOW);
    expect(due).toEqual([]);
  });

  it('flags a network purely on its own schedule', () => {
    const net = network({
      rotateEveryDays: 7,
      passwordSetAt: new Date(NOW - 30 * DAY_MS).toISOString(),
    });
    expect(networksNeedingRotation([net], [], {}, NOW)).toHaveLength(1);
  });

  it('says nothing when an active pass is still valid', () => {
    expect(networksNeedingRotation([network()], [pass()], { 'net-1': 'aaaa' }, NOW)).toEqual([]);
  });
});
