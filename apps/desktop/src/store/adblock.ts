import { create } from 'zustand';
import type { AdblockStats } from '@shared';

const EMPTY: AdblockStats = {
  enabled: true,
  blocked: 0,
  dataSaved: 0,
  topDomains: [],
  whitelist: [],
};

interface AdblockStore {
  stats: AdblockStats;
  setStats: (stats: AdblockStats) => void;
}

export const useAdblock = create<AdblockStore>((set) => ({
  stats: EMPTY,
  setStats: (stats) => set({ stats }),
}));

/** 1234 -> "1.2k". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** bytes -> "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${bytes} B`;
}
