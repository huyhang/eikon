import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEARCH,
  chipsOf,
  describeSearch,
  emptyResultMessage,
  isSearchState,
  searchFromParams,
  searchKey,
  searchReducer,
  searchToImageQuery,
  searchToParams,
  type SearchAction,
  type SearchState,
} from './searchState';

const state = (partial: Partial<SearchState>): SearchState => ({ ...EMPTY_SEARCH, ...partial });

describe('searchReducer', () => {
  it.each<{ name: string; from: SearchState; action: SearchAction; to: SearchState }>([
    {
      name: 'adds an include chip, normalised',
      from: state({}),
      action: { type: 'add', tag: ' Blue Sky ' },
      to: state({ include: ['blue_sky'] }),
    },
    {
      name: 'adds an exclude chip via leading minus',
      from: state({}),
      action: { type: 'add', tag: '-night' },
      to: state({ exclude: ['night'] }),
    },
    {
      name: 'dedupes an existing chip',
      from: state({ include: ['city'] }),
      action: { type: 'add', tag: 'city' },
      to: state({ include: ['city'] }),
    },
    {
      name: 'moves a chip from include to exclude when re-added as exclude',
      from: state({ include: ['city'] }),
      action: { type: 'add', tag: 'city', mode: 'exclude' },
      to: state({ exclude: ['city'] }),
    },
    {
      name: 'ignores blank input',
      from: state({ include: ['a'] }),
      action: { type: 'add', tag: '   ' },
      to: state({ include: ['a'] }),
    },
    {
      name: 'removes a chip from either list',
      from: state({ include: ['a'], exclude: ['b'] }),
      action: { type: 'remove', tag: 'b' },
      to: state({ include: ['a'] }),
    },
    {
      name: 'toggles include → exclude',
      from: state({ include: ['a', 'b'] }),
      action: { type: 'toggle', tag: 'a' },
      to: state({ include: ['b'], exclude: ['a'] }),
    },
    {
      name: 'toggles exclude → include',
      from: state({ exclude: ['a'] }),
      action: { type: 'toggle', tag: 'a' },
      to: state({ include: ['a'] }),
    },
    {
      name: 'toggle of unknown tag is a no-op',
      from: state({ include: ['a'] }),
      action: { type: 'toggle', tag: 'zzz' },
      to: state({ include: ['a'] }),
    },
    {
      name: 'removeLast drops the last chip (excludes come last)',
      from: state({ include: ['a'], exclude: ['b'] }),
      action: { type: 'removeLast' },
      to: state({ include: ['a'] }),
    },
    {
      name: 'setGroup undefined removes group',
      from: state({ group: 3 }),
      action: { type: 'setGroup', group: undefined },
      to: state({}),
    },
    {
      name: 'shuffle keeps its seed',
      from: state({}),
      action: { type: 'setSort', sort: 'random', seed: 42 },
      to: state({ sort: 'random', seed: 42 }),
    },
    {
      name: 'leaving shuffle drops the seed',
      from: state({ sort: 'random', seed: 42 }),
      action: { type: 'setSort', sort: 'oldest' },
      to: state({ sort: 'oldest' }),
    },
    {
      name: 'describing replaces similarity',
      from: state({ like: 4, include: ['a'] }),
      action: { type: 'setText', text: ' red sky ' },
      to: state({ text: 'red sky', include: ['a'] }),
    },
    {
      name: 'similarity replaces describing',
      from: state({ text: 'red sky' }),
      action: { type: 'setLike', like: 9 },
      to: state({ like: 9 }),
    },
    {
      name: 'empty text clears ranking',
      from: state({ text: 'red sky' }),
      action: { type: 'setText', text: '  ' },
      to: state({}),
    },
    {
      name: 'clear keeps sort',
      from: state({ include: ['a'], group: 1, sort: 'random' }),
      action: { type: 'clear' },
      to: state({ sort: 'random' }),
    },
  ])('$name', ({ from, action, to }) => {
    expect(searchReducer(from, action)).toEqual(to);
  });
});

describe('URL encoding', () => {
  it.each<{ name: string; value: SearchState; url: string }>([
    { name: 'empty', value: state({}), url: '' },
    { name: 'tags', value: state({ include: ['a', 'b'], exclude: ['c'] }), url: 't=a&t=b&x=c' },
    { name: 'group and sort', value: state({ group: 7, sort: 'oldest' }), url: 'in=7&sort=oldest' },
    { name: 'shuffle with seed', value: state({ sort: 'random', seed: 9 }), url: 'sort=random&seed=9' },
    { name: 'describe', value: state({ text: 'red sky', include: ['cat'] }), url: 't=cat&q=red+sky' },
    { name: 'similar', value: state({ like: 12 }), url: 'like=12' },
  ])('round-trips $name', ({ value, url }) => {
    expect(searchToParams(value).toString()).toBe(url);
    expect(searchFromParams(new URLSearchParams(url))).toEqual(value);
  });

  it.each([
    { name: 'invalid sort', url: 'sort=bogus', expected: state({}) },
    { name: 'invalid group', url: 'in=abc', expected: state({}) },
    { name: 'duplicates', url: 't=a&t=a&x=a&x=b', expected: state({ include: ['a'], exclude: ['b'] }) },
    { name: 'seed without shuffle', url: 'sort=oldest&seed=3', expected: state({ sort: 'oldest' }) },
    { name: 'negative seed', url: 'sort=random&seed=-1', expected: state({ sort: 'random' }) },
    { name: 'text wins over like', url: 'q=sea&like=3', expected: state({ text: 'sea' }) },
    { name: 'blank text and bad like', url: 'q=%20&like=abc', expected: state({}) },
  ])('sanitises $name', ({ url, expected }) => {
    expect(searchFromParams(new URLSearchParams(url))).toEqual(expected);
  });
});

describe('derived values', () => {
  it('lists chips with modes', () => {
    expect(chipsOf(state({ include: ['a'], exclude: ['b'] }))).toEqual([
      { tag: 'a', mode: 'include' },
      { tag: 'b', mode: 'exclude' },
    ]);
  });

  it('sends the shuffle seed with the image query', () => {
    expect(searchToImageQuery(state({ include: ['a'], sort: 'random', seed: 5 }))).toEqual({
      sort: 'random',
      tags: ['a'],
      seed: 5,
    });
  });

  it.each([
    { value: state({ text: 'sea', sort: 'oldest' }), expected: { sort: 'oldest', text: 'sea' } },
    { value: state({ like: 3 }), expected: { sort: 'newest', like: 3 } },
  ])('passes ranking to the image query: $expected', ({ value, expected }) => {
    expect(searchToImageQuery(value)).toEqual(expected);
  });

  it('keys searches by criteria only', () => {
    expect(searchKey(state({ include: ['a'], sort: 'random', seed: 5 }))).toBe(
      searchKey(state({ include: ['a'] })),
    );
  });

  it('builds the image query', () => {
    expect(searchToImageQuery(state({ include: ['a'], exclude: ['b'], group: 2 }))).toEqual({
      sort: 'newest',
      tags: ['a'],
      exclude: ['b'],
      group: 2,
    });
  });

  it.each([
    { value: state({}), group: undefined, expected: 'Everything' },
    {
      value: state({ include: ['blue_sky'], exclude: ['night'] }),
      group: undefined,
      expected: 'blue sky · −night',
    },
    { value: state({ include: ['city'] }), group: 'Wlop', expected: 'city in Wlop' },
    { value: state({ text: 'red sky', include: ['cat'] }), group: undefined, expected: '“red sky” · cat' },
    { value: state({ like: 7 }), group: undefined, expected: 'Like #7' },
  ])('describes as "$expected"', ({ value, group, expected }) => {
    expect(describeSearch(value, group)).toBe(expected);
  });
});

describe('isSearchState', () => {
  it.each([
    { name: 'a valid search', value: state({ include: ['a'], group: 3 }), expected: true },
    { name: 'an object', value: {}, expected: false },
    { name: 'null', value: null, expected: false },
    {
      name: 'tags that are not strings',
      value: { include: [1], exclude: [], sort: 'newest' },
      expected: false,
    },
    { name: 'an unknown sort', value: { include: [], exclude: [], sort: 'sideways' }, expected: false },
    {
      name: 'a fractional group',
      value: { include: [], exclude: [], sort: 'newest', group: 1.5 },
      expected: false,
    },
  ])('$name → $expected', ({ value, expected }) => {
    expect(isSearchState(value)).toBe(expected);
  });
});

describe('emptyResultMessage', () => {
  it.each([
    { value: state({ include: ['sky'] }), scope: {}, expected: 'No images are tagged sky.' },
    {
      value: state({ include: ['sky', 'night'] }),
      scope: { groupName: 'Wlop' },
      expected: 'No images in Wlop have all of sky, night. Try removing one.',
    },
    {
      value: state({ exclude: ['blue_sky'] }),
      scope: {},
      expected: 'Every image is tagged blue sky. Try removing the exclusion.',
    },
    {
      value: state({ exclude: ['a', 'b'] }),
      scope: { noun: 'favorites' },
      expected: 'Every favorite has at least one of a, b. Try removing an exclusion.',
    },
    {
      value: state({ include: ['sky'], exclude: ['night'] }),
      scope: {},
      expected: 'No images have sky without night. Try removing a tag.',
    },
  ])('$expected', ({ value, scope, expected }) => {
    expect(emptyResultMessage(value, scope)).toBe(expected);
  });
});
