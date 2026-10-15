import { describe, expect, it } from 'vitest';
import {
  decodeTile,
  decodeVector,
  encodeVector,
  normalize,
  encodeTile,
  imageQueryToSearchParams,
  normalizeTagName,
  parseImageQuery,
  parseTagInput,
  ratingFromLevel,
  ratingLevel,
  strongestRating,
  displayTagName,
  thumbDimensions,
  thumbSrcSet,
  thumbUrl,
  type ImageQuery,
  type ImageTile,
} from '../src';

describe('tile encoding', () => {
  it.each<ImageTile>([
    { id: 1, width: 10, height: 20, placeholder: 'abc', rating: 'general', thumbVersion: 2 },
    { id: 2, width: 30, height: 40, placeholder: '', rating: 'explicit', thumbVersion: 1 },
    { id: 3, width: 5, height: 5, placeholder: 'x', rating: null, thumbVersion: 2 },
  ])('round-trips %j', (tile) => {
    expect(decodeTile(encodeTile(tile))).toEqual(tile);
  });

  it('reads lists saved before thumbnail versions as version 1', () => {
    expect(decodeTile([4, 10, 10, 'p', -1]).thumbVersion).toBe(1);
  });
});

describe('thumbnails', () => {
  it('scales into each box without enlarging', () => {
    expect(thumbDimensions(2000, 3000, 'sm')).toEqual({ width: 320, height: 480 });
    expect(thumbDimensions(2000, 3000, 'md')).toEqual({ width: 480, height: 720 });
    expect(thumbDimensions(2000, 3000, 'lg')).toEqual({ width: 1365, height: 2048 });
    expect(thumbDimensions(6000, 1000, 'sm')).toEqual({ width: 1440, height: 240 });
    expect(thumbDimensions(300, 200, 'lg')).toEqual({ width: 300, height: 200 });
  });

  it('puts the version in URLs from version 2', () => {
    expect(thumbUrl({ id: 7 }, 'sm')).toBe('/media/thumb/7/sm');
    expect(thumbUrl({ id: 7, thumbVersion: 1 }, 'lg')).toBe('/media/thumb/7/lg');
    expect(thumbUrl({ id: 7, thumbVersion: 2 }, 'md')).toBe('/media/thumb/7/md?v=2');
  });

  it('offers the sizes the version has, by width', () => {
    expect(thumbSrcSet({ id: 7, width: 2000, height: 3000, thumbVersion: 2 })).toBe(
      '/media/thumb/7/sm?v=2 320w, /media/thumb/7/md?v=2 480w, /media/thumb/7/lg?v=2 1365w',
    );
    expect(thumbSrcSet({ id: 7, width: 2000, height: 3000, thumbVersion: 1 })).toBe(
      '/media/thumb/7/sm 320w, /media/thumb/7/lg 1365w',
    );
  });

  it('leaves out sizes no wider than a smaller one', () => {
    expect(thumbSrcSet({ id: 7, width: 600, height: 400, thumbVersion: 2 })).toBe(
      '/media/thumb/7/sm?v=2 600w',
    );
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
    [
      { tag: 'Blue Hair', not: ' Rain ' },
      { tags: ['blue_hair'], exclude: ['rain'] },
    ],
  ])('ignores malformed or normalizes %j', (raw, expected) => {
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

describe('vectors', () => {
  it.each([
    { name: 'unit basis', values: [1, 0, 0, 0] },
    { name: 'mixed signs', values: [0.5, -0.25, 0.125, -1] },
    { name: 'empty', values: [] },
  ])('round-trips $name through base64 float16', ({ values }) => {
    expect(Array.from(decodeVector(encodeVector(values)))).toEqual(values);
  });

  it('stores two little-endian bytes per value', () => {
    // 1.0 in float16 is 0x3C00 → bytes [0x00, 0x3C]
    expect(atob(encodeVector([1]))).toBe(String.fromCharCode(0x00, 0x3c));
  });

  it('rounds to float16 precision', () => {
    const [value] = decodeVector(encodeVector([0.1]));
    expect(value).toBeCloseTo(0.1, 3);
    expect(value).not.toBe(0.1);
  });

  it.each([
    { values: [3, 4], expected: [0.6, 0.8] },
    { values: [0, 0], expected: [0, 0] },
  ])('normalize($values) → $expected', ({ values, expected }) => {
    expect(Array.from(normalize(values))).toEqual(expected.map((v) => Math.fround(v)));
  });

  it('rejects an odd number of bytes', () => {
    expect(() => decodeVector(btoa('abc'))).toThrow(/odd/);
  });
});
