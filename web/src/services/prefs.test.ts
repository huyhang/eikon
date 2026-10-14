import { describe, expect, it } from 'vitest';
import { EMPTY_SEARCH, type SearchState } from '../core/searchState';
import { MemoryStore } from './keyValueStore';
import { loadPrefs, MAX_RECENT_SEARCHES, pushRecentSearch, savePrefs } from './prefs';

const search = (...include: string[]): SearchState => ({ ...EMPTY_SEARCH, include });

describe('loadPrefs', () => {
  it.each([
    { name: 'defaults', seed: {}, expected: { theme: 'dark', safe: false, max: 'general', density: null } },
    {
      name: 'stored values',
      seed: { theme: 'light', safeMode: { enabled: true, maxRating: 'sensitive' }, density: 4 },
      expected: { theme: 'light', safe: true, max: 'sensitive', density: 4 },
    },
    {
      name: 'garbage is sanitised',
      seed: { theme: 'neon', safeMode: { enabled: 'yes', maxRating: 'nsfw' }, density: 42 },
      expected: { theme: 'dark', safe: false, max: 'general', density: 5 },
    },
  ])('$name', ({ seed, expected }) => {
    const store = new MemoryStore();
    Object.entries(seed).forEach(([k, v]) => store.set(k, v));
    const prefs = loadPrefs(store);
    expect(prefs.theme).toBe(expected.theme);
    expect(prefs.safeMode).toEqual({ enabled: expected.safe, maxRating: expected.max });
    expect(prefs.density).toBe(expected.density);
  });

  it('round-trips through savePrefs', () => {
    const store = new MemoryStore();
    const prefs = {
      theme: 'system' as const,
      safeMode: { enabled: true, maxRating: 'questionable' as const },
      density: 2,
      recentSearches: [search('a')],
    };
    savePrefs(store, prefs);
    expect(loadPrefs(store)).toEqual(prefs);
  });
});

describe('pushRecentSearch', () => {
  it.each([
    { name: 'prepends', list: [search('a')], add: search('b'), expected: [['b'], ['a']] },
    {
      name: 'dedupes and moves to front',
      list: [search('a'), search('b')],
      add: search('b'),
      expected: [['b'], ['a']],
    },
  ])('$name', ({ list, add, expected }) => {
    expect(pushRecentSearch(list, add).map((s) => s.include)).toEqual(expected);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => search(`t${i}`));
    expect(pushRecentSearch(many, search('new'))).toHaveLength(MAX_RECENT_SEARCHES);
  });
});
