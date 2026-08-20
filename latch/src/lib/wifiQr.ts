/**
 * The `WIFI:` URI that phone cameras understand (ZXing's de-facto standard,
 * natively supported by iOS 11+ Camera and Android 10+).
 *
 * The escaping rules are the whole reason this file is unit tested: an SSID
 * containing a semicolon or a password containing a backslash silently
 * produces a QR that joins the wrong network — or no network — and you only
 * find out standing in a doorway with a guest.
 */
import type { SecurityType } from '../types';

/** `\`, `;`, `,`, `:` and `"` are the reserved characters and must be escaped. */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * A value that is entirely hex digits is ambiguous: readers may take it for a
 * raw hex key rather than an ASCII passphrase. The convention is to quote it.
 * Lengths 10/26 (WEP) and 64 (WPA PSK) are exactly the ambiguous ones.
 */
export function needsHexQuoting(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value) && [10, 26, 64].includes(value.length);
}

function encodeValue(value: string): string {
  const escaped = escapeWifiValue(value);
  return needsHexQuoting(value) ? `"${escaped}"` : escaped;
}

/**
 * WPA3 is emitted as `WPA`: the payload format predates SAE, and both iOS and
 * Android treat `WPA` as "WPA/WPA2/WPA3 personal" when joining. There is no
 * portable way to say "WPA3 only" in this format.
 */
export function qrAuthType(security: SecurityType): string {
  switch (security) {
    case 'open':
      return 'nopass';
    case 'WEP':
      return 'WEP';
    default:
      return 'WPA';
  }
}

export interface WifiQrInput {
  ssid: string;
  password: string;
  security: SecurityType;
  hidden: boolean;
}

export function buildWifiUri({ ssid, password, security, hidden }: WifiQrInput): string {
  const parts = [`T:${qrAuthType(security)}`, `S:${encodeValue(ssid)}`];
  if (security !== 'open') parts.push(`P:${encodeValue(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}
