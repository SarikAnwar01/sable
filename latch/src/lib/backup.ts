/**
 * Encrypted backup files.
 *
 * The vault lives only in this browser's IndexedDB, so "clear site data", a
 * reinstall or a lost phone would otherwise take every password in the house
 * with it. A backup is a single self-describing text file, encrypted with a
 * passphrase you choose at export time.
 */
import type { VaultData } from '../types';
import { decryptJson, deriveKey, encryptJson, fromBase64Url, randomBytes, toBase64Url } from './crypto';

const FORMAT = 'latch-backup';
const ITERATIONS = 600_000;

interface BackupFile {
  format: typeof FORMAT;
  v: 1;
  createdAt: string;
  iterations: number;
  salt: string;
  blob: string;
}

export async function exportBackup(data: VaultData, passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const file: BackupFile = {
    format: FORMAT,
    v: 1,
    createdAt: new Date().toISOString(),
    iterations: ITERATIONS,
    salt: toBase64Url(salt),
    blob: toBase64Url(await encryptJson(key, data)),
  };
  return JSON.stringify(file, null, 2);
}

export async function importBackup(text: string, passphrase: string): Promise<VaultData> {
  let file: BackupFile;
  try {
    file = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('That file is not a Latch backup.');
  }
  if (file.format !== FORMAT || !file.salt || !file.blob) {
    throw new Error('That file is not a Latch backup.');
  }
  const key = await deriveKey(passphrase, fromBase64Url(file.salt), file.iterations ?? ITERATIONS);
  try {
    return await decryptJson<VaultData>(key, fromBase64Url(file.blob));
  } catch {
    throw new Error('That passphrase does not open this backup.');
  }
}

export function backupFilename(now = new Date()): string {
  return `latch-backup-${now.toISOString().slice(0, 10)}.json`;
}
