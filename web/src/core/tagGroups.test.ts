import { describe, expect, it } from 'vitest';
import type { ImageTag } from '@eikon/shared';
import { compareTags, groupTagsByCategory } from './tagGroups';

const tag = (name: string, partial: Partial<ImageTag> = {}): ImageTag => ({
  name,
  category: 'general',
  confidence: 0.5,
  source: 'auto',
  ...partial,
});

describe('compareTags', () => {
  it.each([
    {
      name: 'manual before auto',
      a: tag('z', { source: 'manual', confidence: null }),
      b: tag('a'),
      sign: -1,
    },
    {
      name: 'higher confidence first',
      a: tag('a', { confidence: 0.9 }),
      b: tag('b', { confidence: 0.4 }),
      sign: -1,
    },
    { name: 'alphabetical tiebreak', a: tag('b'), b: tag('a'), sign: 1 },
  ])('$name', ({ a, b, sign }) => {
    expect(Math.sign(compareTags(a, b))).toBe(sign);
  });
});

describe('groupTagsByCategory', () => {
  it('orders groups and drops empty categories', () => {
    const groups = groupTagsByCategory([
      tag('sky'),
      tag('miku', { category: 'character' }),
      tag('city', { confidence: 0.9 }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['character', 'general']);
    expect(groups[1]!.tags.map((t) => t.name)).toEqual(['city', 'sky']);
  });

  it('returns nothing for no tags', () => {
    expect(groupTagsByCategory([])).toEqual([]);
  });
});
