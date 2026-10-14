import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEARCH,
  chipsOf,
  describeSearch,
  searchFromParams,
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
  ])('round-trips $name', ({ value, url }) => {
    expect(searchToParams(value).toString()).toBe(url);
    expect(searchFromParams(new URLSearchParams(url))).toEqual(value);
  });

  it.each([
    { name: 'invalid sort', url: 'sort=bogus', expected: state({}) },
    { name: 'invalid group', url: 'in=abc', expected: state({}) },
    { name: 'duplicates', url: 't=a&t=a&x=a&x=b', expected: state({ include: ['a'], exclude: ['b'] }) },
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
  ])('describes as "$expected"', ({ value, group, expected }) => {
    expect(describeSearch(value, group)).toBe(expected);
  });
});
