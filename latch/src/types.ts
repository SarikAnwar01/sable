/**
 * Latch data model.
 *
 * Everything here lives inside the encrypted vault blob (see lib/db.ts), except
 * the share payload, which is what actually travels to a guest.
 */

export type SecurityType = 'WPA3' | 'WPA2' | 'WEP' | 'open';

/**
 * How far a network is allowed to travel.
 *
 * - `private`   — stored for your own reference only. Never selectable into a
 *                 pass, kiosk screen, card, tag or export. This is the whole
 *                 point of the vault: your main LAN and IoT VLAN live here.
 * - `qr-only`   — may be handed over in person (QR, NFC, printed card) but
 *                 never packed into a remote share link.
 * - `shareable` — may also be sent as a link.
 */
export type SharePolicy = 'private' | 'qr-only' | 'shareable';

export interface WifiNetwork {
  id: string;
  ssid: string;
  password: string;
  security: SecurityType;
  /** Hidden SSIDs need H:true in the QR payload or phones won't find them. */
  hidden: boolean;
  band: '2.4' | '5' | '6' | 'mixed';
  /** Free text: "whole house", "garden + garage", "spare room only". */
  coverage: string;
  emoji: string;
  notes: string;
  sharePolicy: SharePolicy;
  /** Nudge to rotate this password every N days. null = never nag. */
  rotateEveryDays: number | null;
  /** When the current password was set — drives the rotation nudge. */
  passwordSetAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Network-adjacent things guests always end up asking for. */
export interface HouseInfo {
  rules: string;
  printer: string;
  tv: string;
  extra: string;
}

export interface GuestPass {
  id: string;
  label: string;
  networkIds: string[];
  houseInfo: HouseInfo;
  createdAt: string;
  /** null = valid immediately. */
  startsAt: string | null;
  /**
   * Advisory only. A WPA password cannot be un-shared; this drives the
   * "time to rotate" nudge and marks the pass expired in the UI.
   */
  expiresAt: string | null;
  revokedAt: string | null;
  /**
   * networkId -> password fingerprint at issue time. Lets us tell a guest's
   * pass has gone stale after a rotation, so we know who to re-send to.
   */
  issuedFingerprints: Record<string, string>;
}

export type ShareChannel = 'qr' | 'link' | 'print' | 'nfc' | 'kiosk';

export interface LogEntry {
  id: string;
  at: string;
  passId: string;
  /** Denormalised so the log still reads correctly after a pass is deleted. */
  passLabel: string;
  networkNames: string[];
  channel: ShareChannel;
  note: string;
}

export interface Settings {
  /** Origin used to build share links, e.g. https://latch.example.com */
  baseUrl: string;
  autoLockMinutes: number;
  defaultRotateDays: number | null;
}

export interface VaultData {
  version: 1;
  networks: WifiNetwork[];
  passes: GuestPass[];
  log: LogEntry[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  autoLockMinutes: 5,
  defaultRotateDays: null,
};

export function emptyVault(): VaultData {
  return { version: 1, networks: [], passes: [], log: [], settings: { ...DEFAULT_SETTINGS } };
}

export function emptyHouseInfo(): HouseInfo {
  return { rules: '', printer: '', tv: '', extra: '' };
}

/** The decrypted contents of a share link, as the guest's browser sees it. */
export interface SharePayload {
  v: 1;
  label: string;
  expiresAt: string | null;
  houseInfo: HouseInfo;
  networks: Array<{
    ssid: string;
    password: string;
    security: SecurityType;
    hidden: boolean;
    emoji: string;
    coverage: string;
  }>;
}
