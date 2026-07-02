import { randomUUID } from 'node:crypto';
import type { DownloadItem } from 'electron';
import type { DownloadEntry, DownloadState } from '@shared';
import type { Storage } from './Storage';

/**
 * Track one download from a session's `will-download` event: persist it and push
 * live progress to the renderer. Called once per download item.
 */
export function trackDownload(
  item: DownloadItem,
  storage: Storage,
  push: (entry: DownloadEntry) => void,
): void {
  const id = randomUUID();
  const startedAt = Date.now();
  const url = item.getURL();
  const filename = item.getFilename();

  const snapshot = (state: DownloadState): DownloadEntry => ({
    id,
    url,
    filename,
    savePath: item.getSavePath(),
    totalBytes: item.getTotalBytes(),
    receivedBytes: item.getReceivedBytes(),
    state,
    startedAt,
  });

  const persist = (state: DownloadState) => {
    const entry = snapshot(state);
    storage.upsertDownload(entry);
    push(entry);
  };

  persist('progressing');

  item.on('updated', (_e, updatedState) => {
    persist(updatedState === 'interrupted' ? 'interrupted' : 'progressing');
  });

  item.once('done', (_e, doneState) => {
    const state: DownloadState =
      doneState === 'completed'
        ? 'completed'
        : doneState === 'cancelled'
          ? 'cancelled'
          : 'interrupted';
    persist(state);
  });
}
