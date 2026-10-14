import { describe, expect, it } from 'vitest';
import {
  decodeTile,
  encodeTile,
  imageQueryToSearchParams,
  normalizeTagName,
  parseImageQuery,
  parseTagInput,
  ratingFromLevel,
  ratingLevel,
  strongestRating,
  displayTagName,
  type ImageQuery,
  type ImageTile,
} from '../src';

describe('tile encoding', () => {
  it.each<ImageTile>([
    { id: 1, width: 10, height: 20, placeholder: 'abc', rating: 'general' },
    { id: 2, width: 30, height: 40, placeholder: '', rating: 'explicit' },
    { id: 3, width: 5, height: 5, placeholder: 'x', rating: null },
  ])('round-trips %j', (tile) => {
    expect(decodeTile(encodeTile(tile))).toEqual(tile);
  });
});

describe('image query params', () => {
  it.each<[string, ImageQuery]>([
    ['empty', {}],
    ['tags and exclusions', { tags: ['blue_sky', 'a,b'], exclude: ['night'] }],
    ['everything', { group: 3, favorites: true, sort: 'random', seed: 9, limit: 50, maxRating: 'sensitive' }],
  ])('round-trips %s', (_, query) => {
    const params = imageQueryToSearchParams(query);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      raw[key] = values.length > 1 ? values : values[0]!;
    }
    expect(parseImageQuery(raw)).toEqual(query);
  });

  it.each([
    [{ group: 'abc' }, {}],
    [{ group: '-1' }, {}],
    [{ sort: 'sideways' }, {}],
    [{ maxRating: 'spicy' }, {}],
    [{ favorites: 'yes' }, {}],
    [{ tag: ['', 'sky'] }, { tags: ['sky'] }],
  ])('ignores malformed %j', (raw, expected) => {
    expect(parseImageQuery(raw)).toEqual(expected);
  });
});

describe('ratings', () => {
  it.each([
    ['general', 0],
    ['sensitive', 1],
    ['questionable', 2],
    ['explicit', 3],
  ] as const)('%s ⇄ %i', (rating, level) => {
    expect(ratingLevel(rating)).toBe(level);
    expect(ratingFromLevel(level)).toBe(rating);
  });

  it.each([
    [{ general: 0.1, sensitive: 0.8, questionable: 0.05, explicit: 0.05 }, 'sensitive'],
    [{ general: 0.5, sensitive: 0.5, questionable: 0, explicit: 0 }, 'general'],
  ] as const)('strongestRating(%j) → %s', (scores, expected) => {
    expect(strongestRating(scores)).toBe(expected);
  });

  it('unknown level maps to null', () => {
    expect(ratingFromLevel(-1)).toBeNull();
  });
});

describe('tag names', () => {
  it.each([
    ['  Blue Sky ', 'blue_sky'],
    ['CHERRY   blossoms', 'cherry_blossoms'],
    ['already_fine', 'already_fine'],
  ])('normalizeTagName(%j) → %s', (input, expected) => {
    expect(normalizeTagName(input)).toBe(expected);
  });

  it.each([
    ['sky', { name: 'sky', category: 'general' }],
    ['Character: Hatsune Miku', { name: 'hatsune_miku', category: 'character' }],
    ['artist:wlop', { name: 'wlop', category: 'artist' }],
    ['stars:(sky)', { name: 'stars:(sky)', category: 'general' }],
    ['re:zero', { name: 're:zero', category: 'general' }],
    ['meta:', { name: 'meta:', category: 'general' }],
    ['   ', null],
  ])('parseTagInput(%j)', (input, expected) => {
    expect(parseTagInput(input)).toEqual(expected);
  });

  it('displayTagName swaps underscores for spaces', () => {
    expect(displayTagName('blue_sky')).toBe('blue sky');
  });
});
