import type { Rating } from '@eikon/shared';
import { isRating } from '@eikon/shared';
import { DEFAULT_SAFE_MODE, type SafeModePrefs } from '../core/safeMode';
import { clampDensity } from '../core/gestures';
import { searchKey, type SearchState } from '../core/searchState';
import type { KeyValueStore } from './keyValueStore';

export type ThemePref = 'dark' | 'light' | 'system';

export interface Prefs {
  theme: ThemePref;
  safeMode: SafeModePrefs;
  density: number | null;
  recentSearches: SearchState[];
}

const THEMES: readonly ThemePref[] = ['dark', 'light', 'system'];
export const MAX_RECENT_SEARCHES = 8;

function readSafeMode(raw: Partial<SafeModePrefs> | null): SafeModePrefs {
  return {
    enabled: raw?.enabled === true,
    maxRating: isRating(raw?.maxRating) ? (raw.maxRating as Rating) : DEFAULT_SAFE_MODE.maxRating,
  };
}

export function loadPrefs(store: KeyValueStore): Prefs {
  const theme = store.get<string>('theme', 'dark');
  const density = store.get<number | null>('density', null);
  return {
    theme: (THEMES as readonly string[]).includes(theme) ? (theme as ThemePref) : 'dark',
    safeMode: readSafeMode(store.get<Partial<SafeModePrefs> | null>('safeMode', null)),
    density: typeof density === 'number' ? clampDensity(density) : null,
    recentSearches: store.get<SearchState[]>('recentSearches', []).slice(0, MAX_RECENT_SEARCHES),
  };
}

export function savePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.set('theme', prefs.theme);
  store.set('safeMode', prefs.safeMode);
  store.set('density', prefs.density);
  store.set('recentSearches', prefs.recentSearches);
}

/** Most recent first, deduped by criteria, capped. */
export function pushRecentSearch(list: SearchState[], search: SearchState): SearchState[] {
  const key = searchKey(search);
  return [search, ...list.filter((s) => searchKey(s) !== key)].slice(0, MAX_RECENT_SEARCHES);
}
