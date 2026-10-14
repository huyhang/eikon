import { describe, expect, it } from 'vitest';
import type { GroupSummary } from '@eikon/shared';
import { filterGroups } from './GroupsIndexPage';

const group = (id: number, name: string): GroupSummary => ({
  id,
  name,
  kind: 'illustrator',
  imageCount: 1,
  covers: [],
  latestAt: 0,
});
const groups = [group(1, 'Ilya Kuvshinov'), group(2, 'Mika Pikazo'), group(3, 'WLOP')];

describe('filterGroups', () => {
  it.each([
    { filter: '', expected: [1, 2, 3] },
    { filter: '  ', expected: [1, 2, 3] },
    { filter: 'ilya', expected: [1] },
    { filter: 'PIKA', expected: [2] },
    { filter: 'o', expected: [1, 2, 3] },
    { filter: 'zzz', expected: [] },
  ])('"$filter" → $expected', ({ filter, expected }) => {
    expect(filterGroups(groups, filter).map((g) => g.id)).toEqual(expected);
  });
});
