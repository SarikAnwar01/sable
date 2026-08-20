/**
 * The one place that owns vault state. Every mutation re-encrypts and writes
 * the whole blob — the data is small (dozens of records) and this way there is
 * exactly one code path that can put plaintext on disk, which is none.
 */
import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  emptyVault,
  type GuestPass,
  type LogEntry,
  type Settings,
  type VaultData,
  type WifiNetwork,
} from '../types';
import { decryptJson, deriveKey, encryptJson, fingerprint, randomBytes } from '../lib/crypto';
import { destroyVault, loadVaultRecord, saveVaultRecord } from '../lib/db';

export type VaultStatus = 'loading' | 'empty' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  data: VaultData;
  /** networkId -> fingerprint of the *current* password, for staleness checks. */
  fingerprints: Record<string, string>;
  error: string | null;
  busy: boolean;

  init(): Promise<void>;
  create(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  wipe(): Promise<void>;

  saveNetwork(network: WifiNetwork): Promise<void>;
  deleteNetwork(id: string): Promise<void>;
  rotatePassword(id: string, password: string): Promise<void>;
  savePass(pass: GuestPass): Promise<void>;
  deletePass(id: string): Promise<void>;
  revokePass(id: string): Promise<void>;
  log(entry: Omit<LogEntry, 'id' | 'at'>): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(data: VaultData): Promise<void>;
}

/** Held outside the store so React devtools and snapshots can never surface it. */
let vaultKey: CryptoKey | null = null;
let vaultSalt: Uint8Array | null = null;
let vaultIterations = 0;

export const newId = (): string => crypto.randomUUID();

async function fingerprintAll(networks: WifiNetwork[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    networks.map(async (n) => [n.id, await fingerprint(n.password)] as const),
  );
  return Object.fromEntries(entries);
}

export const useVault = create<VaultState>((set, get) => {
  async function persist(data: VaultData): Promise<void> {
    if (!vaultKey || !vaultSalt) throw new Error('Vault is locked');
    const blob = await encryptJson(vaultKey, data);
    await saveVaultRecord({
      salt: vaultSalt,
      iterations: vaultIterations,
      blob,
      updatedAt: new Date().toISOString(),
    });
    set({ data, fingerprints: await fingerprintAll(data.networks) });
  }

  /** Mutate-and-save helper: every action below funnels through here. */
  async function update(mutate: (draft: VaultData) => VaultData): Promise<void> {
    set({ busy: true });
    try {
      await persist(mutate(get().data));
    } finally {
      set({ busy: false });
    }
  }

  return {
    status: 'loading',
    data: emptyVault(),
    fingerprints: {},
    error: null,
    busy: false,

    async init() {
      const rec = await loadVaultRecord();
      set({ status: rec ? 'locked' : 'empty' });
    },

    async create(passphrase) {
      const salt = randomBytes(16);
      vaultSalt = salt;
      vaultIterations = 600_000;
      vaultKey = await deriveKey(passphrase, salt, vaultIterations);
      const data = emptyVault();
      await persist(data);
      set({ status: 'unlocked', error: null });
    },

    async unlock(passphrase) {
      const rec = await loadVaultRecord();
      if (!rec) {
        set({ status: 'empty' });
        return false;
      }
      set({ busy: true, error: null });
      try {
        const key = await deriveKey(passphrase, rec.salt, rec.iterations);
        // A wrong passphrase fails here: GCM authentication, not a stored hash.
        const data = await decryptJson<VaultData>(key, rec.blob);
        vaultKey = key;
        vaultSalt = rec.salt;
        vaultIterations = rec.iterations;
        set({
          status: 'unlocked',
          data: { ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } },
          fingerprints: await fingerprintAll(data.networks),
        });
        return true;
      } catch {
        set({ error: 'That passphrase does not open this vault.' });
        return false;
      } finally {
        set({ busy: false });
      }
    },

    lock() {
      vaultKey = null;
      vaultSalt = null;
      vaultIterations = 0;
      set({ status: 'locked', data: emptyVault(), fingerprints: {}, error: null });
    },

    async wipe() {
      await destroyVault();
      vaultKey = null;
      vaultSalt = null;
      set({ status: 'empty', data: emptyVault(), fingerprints: {} });
    },

    saveNetwork(network) {
      return update((d) => {
        const exists = d.networks.some((n) => n.id === network.id);
        return {
          ...d,
          networks: exists
            ? d.networks.map((n) => (n.id === network.id ? network : n))
            : [...d.networks, network],
        };
      });
    },

    deleteNetwork(id) {
      return update((d) => ({
        ...d,
        networks: d.networks.filter((n) => n.id !== id),
        // Passes keep their history but stop pointing at a network that is gone.
        passes: d.passes.map((p) => ({ ...p, networkIds: p.networkIds.filter((n) => n !== id) })),
      }));
    },

    rotatePassword(id, password) {
      return update((d) => ({
        ...d,
        networks: d.networks.map((n) =>
          n.id === id
            ? {
                ...n,
                password,
                passwordSetAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : n,
        ),
      }));
    },

    savePass(pass) {
      return update((d) => {
        const exists = d.passes.some((p) => p.id === pass.id);
        return {
          ...d,
          passes: exists ? d.passes.map((p) => (p.id === pass.id ? pass : p)) : [...d.passes, pass],
        };
      });
    },

    deletePass(id) {
      return update((d) => ({ ...d, passes: d.passes.filter((p) => p.id !== id) }));
    },

    revokePass(id) {
      return update((d) => ({
        ...d,
        passes: d.passes.map((p) =>
          p.id === id ? { ...p, revokedAt: new Date().toISOString() } : p,
        ),
      }));
    },

    log(entry) {
      return update((d) => ({
        ...d,
        log: [{ ...entry, id: newId(), at: new Date().toISOString() }, ...d.log].slice(0, 500),
      }));
    },

    saveSettings(settings) {
      return update((d) => ({ ...d, settings }));
    },

    replaceAll(data) {
      return update(() => data);
    },
  };
});

/** Current password fingerprints, for issuing a pass. */
export async function currentFingerprints(networks: WifiNetwork[]): Promise<Record<string, string>> {
  return fingerprintAll(networks);
}
