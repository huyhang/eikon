import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/db/settingsRepository';
import { createTestRepos, seedImage } from './support/fixtures';

describe('sanitizeSettings', () => {
  it.each([
    [null, {}],
    ['nope', {}],
    [{ generalThreshold: 0.5 }, { generalThreshold: 0.5 }],
    [{ generalThreshold: 1.5, characterThreshold: -1 }, {}],
    [{ generalThreshold: '0.5' }, {}],
    [{ characterThreshold: 0, other: 1 }, { characterThreshold: 0 }],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeSettings(input)).toEqual(expected);
  });
});

describe('SettingsRepository', () => {
  it('starts with defaults and persists updates', () => {
    const repos = createTestRepos();
    expect(repos.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(repos.settings.update({ generalThreshold: 0.5 })).toEqual({
      ...DEFAULT_SETTINGS,
      generalThreshold: 0.5,
    });
  });
});

describe('FavoriteRepository', () => {
  it('adds idempotently and removes', () => {
    const repos = createTestRepos();
    const id = seedImage(repos);
    repos.favorites.add(id, 1);
    repos.favorites.add(id, 2);
    expect(repos.favorites.has(id)).toBe(true);
    repos.favorites.remove(id);
    expect(repos.favorites.has(id)).toBe(false);
  });
});

describe('SavedSearchRepository', () => {
  it('creates, lists and deletes', () => {
    const repos = createTestRepos();
    const saved = repos.savedSearches.create('Skies', { tags: ['sky'], exclude: [] }, 5);
    expect(repos.savedSearches.list()).toEqual([saved]);
    expect(repos.savedSearches.delete(saved.id)).toBe(true);
    expect(repos.savedSearches.delete(saved.id)).toBe(false);
  });
});
