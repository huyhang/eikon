import { describe, expect, it } from 'vitest';
import type { ImageQuery } from '@eikon/shared';
import { imageConditions, imageOrder, ratingCondition, visibleTag } from '../src/search/imageFilter';

const thresholds = { generalThreshold: 0.35, characterThreshold: 0.85 };

describe('visibleTag', () => {
  it('binds character threshold before general threshold', () => {
    expect(visibleTag(thresholds).params).toEqual([0.85, 0.35]);
  });
});

describe('ratingCondition', () => {
  it.each([
    [undefined, []],
    ['general', [0]],
    ['sensitive', [1]],
    ['explicit', [3]],
  ] as const)('maxRating=%s binds %j', (maxRating, params) => {
    expect(ratingCondition(maxRating).flatMap((f) => f.params)).toEqual(params);
  });
});

describe('imageConditions', () => {
  it.each<[string, ImageQuery, number, RegExp[]]>([
    ['empty query', {}, 0, []],
    ['group', { group: 4 }, 1, [/f\.group_id = \?/]],
    ['favorites', { favorites: true }, 1, [/favorites/]],
    ['two tags', { tags: ['a', 'b'] }, 2, [/EXISTS/, /EXISTS/]],
    ['exclusion', { exclude: ['c'] }, 1, [/^NOT EXISTS/]],
    ['everything', { group: 1, favorites: true, tags: ['a'], exclude: ['b'], maxRating: 'general' }, 5, []],
  ])('%s', (_, query, count, patterns) => {
    const conditions = imageConditions(query, thresholds);
    expect(conditions).toHaveLength(count);
    patterns.forEach((pattern, i) => expect(conditions[i]?.text).toMatch(pattern));
  });

  it('binds tag names with their thresholds in order', () => {
    const [include, exclude] = imageConditions({ tags: ['sky'], exclude: ['night'] }, thresholds);
    expect(include?.params).toEqual(['sky', 0.85, 0.35]);
    expect(exclude?.params).toEqual(['night', 0.85, 0.35]);
  });
});

describe('imageOrder', () => {
  it.each([
    ['newest', /added_at DESC/, []],
    ['oldest', /added_at ASC/, []],
    ['random', /2654435761/, [7]],
  ] as const)('%s', (sort, pattern, params) => {
    const order = imageOrder(sort, 7);
    expect(order.text).toMatch(pattern);
    expect(order.params).toEqual(params);
  });
});
