import type { SableBridge } from '@shared';

declare global {
  interface Window {
    sable: SableBridge;
    sableEnv: { platform: NodeJS.Platform };
  }
}

export {};
