import { describe, expect, it } from 'vitest';
import type { ImageTag } from '@eikon/shared';
import { compareTags, confidencePercent, groupTagsByCategory, isFaint, tagOrigin } from './tagGroups';

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
    {
      name: 'implied and auto ordered by confidence, consistently both ways',
      a: tag('a', { source: 'implied', confidence: 0.9 }),
      b: tag('b', { source: 'auto', confidence: 0.6 }),
      sign: -1,
    },
    {
      name: 'auto before a weaker implied tag',
      a: tag('a', { source: 'auto', confidence: 0.9 }),
      b: tag('b', { source: 'implied', confidence: 0.6 }),
      sign: -1,
    },
  ])('$name', ({ a, b, sign }) => {
    expect(Math.sign(compareTags(a, b))).toBe(sign);
    expect(Math.sign(compareTags(b, a))).toBe(-sign);
  });
});

describe('confidence display', () => {
  it.each([
    { t: tag('a', { confidence: 0.92 }), faint: false, percent: '92%', origin: '92% confidence' },
    { t: tag('a', { confidence: 0.38 }), faint: true, percent: '38%', origin: '38% confidence' },
    {
      t: tag('a', { source: 'manual', confidence: null }),
      faint: false,
      percent: null,
      origin: 'added by you',
    },
    {
      t: tag('a', { source: 'implied', confidence: 0.7 }),
      faint: false,
      percent: '70%',
      origin: 'implied by another tag (70%)',
    },
    {
      t: tag('a', { source: 'implied', confidence: null }),
      faint: false,
      percent: null,
      origin: 'implied by a tag you added',
    },
  ])('$origin', ({ t, faint, percent, origin }) => {
    expect(isFaint(t)).toBe(faint);
    expect(confidencePercent(t)).toBe(percent);
    expect(tagOrigin(t)).toBe(origin);
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
