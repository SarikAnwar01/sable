/**
 * Wi-Fi Simple Config (WSC) credential record — the payload a commercial
 * "tap to join" NFC sticker carries. Android's NFC stack recognises the MIME
 * type `application/vnd.wfa.wsc` and offers to join the network directly.
 *
 * The format is nested big-endian TLVs: a Credential (0x100E) wrapping the
 * SSID, auth type, encryption type and network key. Get a length byte wrong and
 * the handset silently ignores the tag, which is why this is unit tested
 * against the byte layout rather than trusted to a device round-trip.
 */
import type { SecurityType } from '../types';

export const WSC_MIME = 'application/vnd.wfa.wsc';

const TLV = {
  CREDENTIAL: 0x100e,
  NETWORK_INDEX: 0x1026,
  SSID: 0x1045,
  AUTH_TYPE: 0x1003,
  ENCRYPTION_TYPE: 0x100f,
  NETWORK_KEY: 0x1027,
  MAC_ADDRESS: 0x1020,
} as const;

const AUTH = { OPEN: 0x0001, SHARED: 0x0004, WPA2_PSK: 0x0020 } as const;
const CIPHER = { NONE: 0x0001, WEP: 0x0002, AES: 0x0008 } as const;

/**
 * WSC predates WPA3/SAE and has no code point for it, so a WPA3 network is
 * described as WPA2-PSK + AES. That is what every commercial tag does; on a
 * WPA3-only AP with transition mode disabled the tag may not connect, and the
 * UI says so rather than pretending.
 */
function authAndCipher(security: SecurityType): [number, number] {
  switch (security) {
    case 'open':
      return [AUTH.OPEN, CIPHER.NONE];
    case 'WEP':
      return [AUTH.SHARED, CIPHER.WEP];
    default:
      return [AUTH.WPA2_PSK, CIPHER.AES];
  }
}

function tlv(type: number, value: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + value.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, type, false);
  view.setUint16(2, value.length, false);
  out.set(value, 4);
  return out;
}

function uint16(n: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, n, false);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface WscInput {
  ssid: string;
  password: string;
  security: SecurityType;
}

export function buildWscRecord({ ssid, password, security }: WscInput): Uint8Array {
  const encoder = new TextEncoder();
  const [auth, cipher] = authAndCipher(security);
  const key = security === 'open' ? new Uint8Array(0) : encoder.encode(password);
  const credential = concat([
    tlv(TLV.NETWORK_INDEX, new Uint8Array([1])),
    tlv(TLV.SSID, encoder.encode(ssid)),
    tlv(TLV.AUTH_TYPE, uint16(auth)),
    tlv(TLV.ENCRYPTION_TYPE, uint16(cipher)),
    tlv(TLV.NETWORK_KEY, key),
    // Broadcast-ish placeholder: the AP's real BSSID is not needed to join.
    tlv(TLV.MAC_ADDRESS, new Uint8Array(6)),
  ]);
  return tlv(TLV.CREDENTIAL, credential);
}

export function nfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export type NfcWriteResult =
  | { ok: true; kind: 'wifi' }
  | { ok: true; kind: 'url' }
  | { ok: false; reason: string };

/**
 * Writes a real Wi-Fi credential tag when the platform allows it, and falls
 * back to a URL record pointing at the share link when it doesn't — always
 * reporting which of the two happened, so the UI never claims a tap-to-join
 * tag it didn't actually write.
 */
export async function writeWifiTag(input: WscInput, fallbackUrl: string): Promise<NfcWriteResult> {
  if (!nfcSupported()) {
    return { ok: false, reason: 'Web NFC is only available in Chrome on Android.' };
  }
  const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
  const writer = new Reader();
  try {
    await writer.write({
      records: [{ recordType: 'mime', mediaType: WSC_MIME, data: buildWscRecord(input) }],
    });
    return { ok: true, kind: 'wifi' };
  } catch (err) {
    if (!fallbackUrl) {
      return { ok: false, reason: describe(err) };
    }
    try {
      await writer.write({ records: [{ recordType: 'url', data: fallbackUrl }] });
      return { ok: true, kind: 'url' };
    } catch (fallbackErr) {
      return { ok: false, reason: describe(fallbackErr) };
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Permission denied — allow NFC for this site and try again.';
  }
  return err instanceof Error ? err.message : 'The tag could not be written.';
}

interface NdefWriter {
  write(message: {
    records: Array<{ recordType: string; mediaType?: string; data: Uint8Array | string }>;
  }): Promise<void>;
}
