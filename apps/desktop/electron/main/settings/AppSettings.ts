import {
  DEFAULT_SETTINGS,
  type SableSettings,
  type SearchEngineId,
  type ThemeMode,
} from '@shared';
import type { Storage } from '../storage/Storage';

const KEY = {
  theme: 'theme',
  searchEngine: 'search.engine',
  adblockEnabled: 'adblock.enabled',
  homeUrl: 'home.url',
  profileName: 'profile.name',
} as const;

/**
 * Typed settings with an in-memory cache backed by the SQLite settings table.
 * The searchEngine value is read live by the omnibox resolver and the new-tab
 * page, so changing it takes effect immediately.
 */
export class AppSettings {
  private current: SableSettings;

  constructor(private readonly storage: Storage | null) {
    const get = (k: string) => this.storage?.getSetting(k) ?? null;
    const adblock = get(KEY.adblockEnabled);
    this.current = {
      theme: (get(KEY.theme) as ThemeMode) ?? DEFAULT_SETTINGS.theme,
      searchEngine: (get(KEY.searchEngine) as SearchEngineId) ?? DEFAULT_SETTINGS.searchEngine,
      adblockEnabled: adblock === null ? DEFAULT_SETTINGS.adblockEnabled : adblock !== 'false',
      homeUrl: get(KEY.homeUrl) ?? DEFAULT_SETTINGS.homeUrl,
      profileName: get(KEY.profileName) ?? DEFAULT_SETTINGS.profileName,
    };
  }

  get all(): SableSettings {
    return this.current;
  }

  get searchEngine(): SearchEngineId {
    return this.current.searchEngine;
  }

  update(patch: Partial<SableSettings>): SableSettings {
    this.current = { ...this.current, ...patch };
    if (this.storage) {
      if (patch.theme !== undefined) this.storage.setSetting(KEY.theme, patch.theme);
      if (patch.searchEngine !== undefined)
        this.storage.setSetting(KEY.searchEngine, patch.searchEngine);
      if (patch.adblockEnabled !== undefined)
        this.storage.setSetting(KEY.adblockEnabled, String(patch.adblockEnabled));
      if (patch.homeUrl !== undefined) this.storage.setSetting(KEY.homeUrl, patch.homeUrl);
      if (patch.profileName !== undefined)
        this.storage.setSetting(KEY.profileName, patch.profileName);
    }
    return this.current;
  }
}
