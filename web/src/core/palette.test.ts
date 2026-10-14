import { describe, expect, it } from 'vitest';
import { matchScore, moveHighlight, rankPalette, type PaletteItem } from './palette';

const item = (label: string, keywords?: string[]): PaletteItem => ({
  id: label,
  label,
  hint: '',
  to: '/',
  keywords,
});

describe('matchScore', () => {
  it.each([
    { label: 'Aiko Sorano', query: 'ai', expected: 3 },
    { label: 'Aiko Sorano', query: 'sor', expected: 2 },
    { label: 'Aiko Sorano', query: 'ora', expected: 1 },
    { label: 'Aiko Sorano', query: 'zz', expected: 0 },
    { label: 'blue_sky', query: 'blue sky', expected: 3 },
    { label: 'Settings', query: '', expected: 1 },
  ])('$label / $query → $expected', ({ label, query, expected }) => {
    expect(matchScore(item(label), query)).toBe(expected);
  });

  it('matches keywords such as aliases', () => {
    expect(matchScore(item('blue_hair', ['azure_hair']), 'azu')).toBe(3);
  });
});

describe('rankPalette', () => {
  const items = [item('Settings'), item('Review Tags'), item('Sable & Fern'), item('Reading Nook')];
  it.each([
    { query: 're', expected: ['Review Tags', 'Reading Nook'] },
    { query: 's', expected: ['Settings', 'Sable & Fern', 'Review Tags'] },
    { query: '', expected: ['Settings', 'Review Tags'] },
  ])('"$query" → $expected', ({ query, expected }) => {
    expect(rankPalette(items, query, query ? 3 : 2).map((i) => i.label)).toEqual(expected);
  });
});

describe('moveHighlight', () => {
  it.each([
    { current: 0, key: 'ArrowDown' as const, count: 3, expected: 1 },
    { current: 2, key: 'ArrowDown' as const, count: 3, expected: 0 },
    { current: 0, key: 'ArrowUp' as const, count: 3, expected: 2 },
    { current: 0, key: 'ArrowUp' as const, count: 0, expected: 0 },
  ])('$current $key in $count → $expected', ({ current, key, count, expected }) => {
    expect(moveHighlight(current, key, count)).toBe(expected);
  });
});
