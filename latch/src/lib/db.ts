/**
 * Vault persistence: one encrypted blob in IndexedDB, nothing else.
 *
 * The salt and iteration count sit outside the ciphertext because we need them
 * to derive the key before we can decrypt anything. They aren't secret.
 */

const DB_NAME = 'latch';
const DB_VERSION = 1;
const STORE = 'vault';
const KEY = 'current';

export interface VaultRecord {
  salt: Uint8Array;
  iterations: number;
  blob: Uint8Array;
  updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function loadVaultRecord(): Promise<VaultRecord | null> {
  const rec = await tx<VaultRecord | undefined>('readonly', (s) => s.get(KEY));
  return rec ?? null;
}

export async function saveVaultRecord(rec: VaultRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(rec, KEY));
}

export async function destroyVault(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}
