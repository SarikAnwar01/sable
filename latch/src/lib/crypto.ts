/**
 * All cryptography for Latch. WebCrypto only — no dependencies.
 *
 * Two things get encrypted, with the same primitives but different key sources:
 *   1. The vault at rest, keyed from your app passphrase (PBKDF2 -> AES-GCM).
 *   2. A share payload, keyed either from a random key carried in the URL
 *      fragment, or from a short PIN you tell the guest out of band.
 */

const PBKDF2_ITERATIONS = 600_000;
/** Lower work factor for PIN mode so a guest's phone can open the link fast. */
export const PIN_ITERATIONS = 250_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A one-off random AES key, exportable so it can ride in a URL fragment. */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypts JSON. Returns iv || ciphertext, since GCM needs a fresh iv each time. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      enc.encode(JSON.stringify(value)) as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

/** Throws if the key is wrong — GCM authentication is what makes that detectable. */
export async function decryptJson<T>(key: CryptoKey, blob: Uint8Array): Promise<T> {
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(dec.decode(plain)) as T;
}

/**
 * Short, stable fingerprint of a password. Used to notice that a pass was
 * issued against a password that has since been rotated — never to store or
 * transmit the password itself.
 */
export async function fingerprint(password: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', enc.encode(password) as BufferSource),
  );
  return Array.from(digest.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
