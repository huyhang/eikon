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
      slideshow: { seconds: 20 as const, shuffle: true },
      viewerSplit: true,
      offlineFavorites: true,
    };
    savePrefs(store, prefs);
    expect(loadPrefs(store)).toEqual(prefs);
  });
});

describe('loadPrefs: newer settings', () => {
  it.each([
    {
      name: 'defaults',
      seed: {},
      slideshow: { seconds: 10, shuffle: false },
      split: false,
      offline: false,
    },
    {
      name: 'stored',
      seed: { slideshow: { seconds: 5, shuffle: true }, viewerSplit: true, offlineFavorites: true },
      slideshow: { seconds: 5, shuffle: true },
      split: true,
      offline: true,
    },
    {
      name: 'garbage',
      seed: { slideshow: { seconds: 7, shuffle: 'yes' }, viewerSplit: 'on', offlineFavorites: 1 },
      slideshow: { seconds: 10, shuffle: false },
      split: false,
      offline: false,
    },
  ])('$name', ({ seed, slideshow, split, offline }) => {
    const store = new MemoryStore();
    Object.entries(seed).forEach(([k, v]) => store.set(k, v));
    expect(loadPrefs(store)).toMatchObject({ slideshow, viewerSplit: split, offlineFavorites: offline });
  });

  it.each([
    { name: 'a non-array', stored: { nope: 1 } },
    { name: 'malformed entries', stored: [{ include: 'a' }, null, 7] },
  ])('drops $name in recent searches instead of crashing', ({ stored }) => {
    const store = new MemoryStore();
    store.set('recentSearches', stored);
    expect(loadPrefs(store).recentSearches).toEqual([]);
  });
});

describe('pushRecentSearch', () => {
  it('returns the same list when the search is already the most recent', () => {
    const list = [search('a'), search('b')];
    expect(pushRecentSearch(list, search('a'))).toBe(list);
  });

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
