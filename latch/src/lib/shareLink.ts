/**
 * Zero-knowledge share links.
 *
 * The encrypted payload rides in the URL *fragment*, which browsers never send
 * to a server. Whoever hosts the Latch page therefore serves identical bytes to
 * everyone and cannot see a password, an SSID, or even which pass was opened.
 *
 * Two modes:
 *   - `key`  the AES key is appended to the fragment. Anyone with the whole
 *            link can open it — convenient, and still server-blind.
 *   - `pin`  the key is derived from a short PIN you pass to the guest over a
 *            different channel, so an intercepted link alone is not enough.
 *            Note honestly: a 4-digit PIN is only 10,000 guesses against a
 *            captured link, so the UI pushes 6 digits.
 */
import type { SharePayload } from '../types';
import {
  PIN_ITERATIONS,
  decryptJson,
  deriveKey,
  encryptJson,
  exportKey,
  fromBase64Url,
  generateKey,
  importKey,
  randomBytes,
  toBase64Url,
} from './crypto';

export type ShareMode = 'key' | 'pin';

export const FRAGMENT_PREFIX = '#p=';

/** `p=<mode>.<salt>.<body>[.<key>]` — version-tagged so old links stay readable. */
function pack(mode: ShareMode, salt: Uint8Array, body: Uint8Array, key?: Uint8Array): string {
  const parts = [`1${mode === 'pin' ? 'p' : 'k'}`, toBase64Url(salt), toBase64Url(body)];
  if (key) parts.push(toBase64Url(key));
  return parts.join('.');
}

export interface BuiltLink {
  /** Full URL, or just the fragment when no base URL is configured yet. */
  url: string;
  fragment: string;
  mode: ShareMode;
}

export async function buildShareLink(
  payload: SharePayload,
  baseUrl: string,
  mode: ShareMode,
  pin?: string,
): Promise<BuiltLink> {
  let fragment: string;
  if (mode === 'pin') {
    if (!pin) throw new Error('PIN mode needs a PIN');
    const salt = randomBytes(16);
    const key = await deriveKey(pin, salt, PIN_ITERATIONS);
    fragment = FRAGMENT_PREFIX + pack('pin', salt, await encryptJson(key, payload));
  } else {
    const key = await generateKey();
    fragment =
      FRAGMENT_PREFIX +
      pack('key', new Uint8Array(0), await encryptJson(key, payload), await exportKey(key));
  }
  const base = baseUrl.trim().replace(/\/+$/, '');
  return { url: base ? `${base}/${fragment}` : fragment, fragment, mode };
}

export interface ParsedLink {
  mode: ShareMode;
  salt: Uint8Array;
  body: Uint8Array;
  key: Uint8Array | null;
}

/** Reads a fragment without decrypting, so the UI can ask for a PIN first. */
export function parseFragment(fragment: string): ParsedLink | null {
  const raw = fragment.startsWith(FRAGMENT_PREFIX)
    ? fragment.slice(FRAGMENT_PREFIX.length)
    : fragment.startsWith('#')
      ? null
      : fragment;
  if (raw === null) return null;
  const parts = raw.split('.');
  const [version, salt, body, key] = parts;
  if (!version || salt === undefined || !body) return null;
  if (version !== '1k' && version !== '1p') return null;
  try {
    return {
      mode: version === '1p' ? 'pin' : 'key',
      salt: fromBase64Url(salt),
      body: fromBase64Url(body),
      key: key ? fromBase64Url(key) : null,
    };
  } catch {
    return null;
  }
}

/** Throws on a wrong PIN or a mangled link — AES-GCM authentication catches both. */
export async function openShareLink(parsed: ParsedLink, pin?: string): Promise<SharePayload> {
  const key =
    parsed.mode === 'pin'
      ? await deriveKey(pin ?? '', parsed.salt, PIN_ITERATIONS)
      : await importKey(parsed.key ?? new Uint8Array(0));
  return decryptJson<SharePayload>(key, parsed.body);
}
