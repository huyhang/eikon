import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageQuery } from '@eikon/shared';
import type { Repositories } from '../src/db/repositories';
import { createTestRepos, seedImage, THRESHOLDS } from './support/fixtures';

describe('ImageRepository.list', () => {
  let repos: Repositories;
  const ids: Record<string, number> = {};

  beforeEach(() => {
    repos = createTestRepos();
    ids.sky = seedImage(repos, { addedAt: 1, tags: ['sky', 'city'], rating: 'general' });
    ids.night = seedImage(repos, { addedAt: 2, tags: ['sky', 'night', 'city'], rating: 'sensitive' });
    ids.faint = seedImage(repos, {
      addedAt: 3,
      tags: [{ name: 'sky', confidence: 0.2 }],
      rating: 'explicit',
    });
    ids.untagged = seedImage(repos, { addedAt: 4, group: { kind: 'collection', name: 'Mood' } });
    repos.favorites.add(ids.night, 0);
  });

  const names = (query: ImageQuery) =>
    repos.images.list(query, THRESHOLDS).tiles.map((t) => Object.keys(ids).find((k) => ids[k] === t.id));

  it.each<[string, ImageQuery, string[]]>([
    ['everything, newest first', {}, ['untagged', 'faint', 'night', 'sky']],
    ['oldest first', { sort: 'oldest' }, ['sky', 'night', 'faint', 'untagged']],
    ['one tag ignores low-confidence matches', { tags: ['sky'] }, ['night', 'sky']],
    ['all tags must match', { tags: ['sky', 'night'] }, ['night']],
    ['exclusion', { tags: ['city'], exclude: ['night'] }, ['sky']],
    ['favorites', { favorites: true }, ['night']],
    ['safe mode hides higher and unrated', { maxRating: 'sensitive' }, ['night', 'sky']],
    ['strict safe mode', { maxRating: 'general' }, ['sky']],
    ['unknown tag', { tags: ['nope'] }, []],
  ])('%s', (_, query, expected) => {
    expect(names(query)).toEqual(expected);
  });

  it('filters by group', () => {
    const group = repos.groups.list({ kind: 'collection' })[0]!;
    expect(names({ group: group.id })).toEqual(['untagged']);
  });

  it('reports the full total when limited', () => {
    const result = repos.images.list({ limit: 2 }, THRESHOLDS);
    expect(result.tiles).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it('random order is stable for a seed and covers every image', () => {
    const a = names({ sort: 'random', seed: 3 });
    expect(names({ sort: 'random', seed: 3 })).toEqual(a);
    expect(a.toSorted()).toEqual(['faint', 'night', 'sky', 'untagged']);
  });

  it('respects lowered thresholds', () => {
    const tiles = repos.images.list({ tags: ['sky'] }, { ...THRESHOLDS, generalThreshold: 0.1 }).tiles;
    expect(tiles).toHaveLength(3);
  });
});

describe('ImageRepository housekeeping', () => {
  it('deletes images without files and returns them', () => {
    const repos = createTestRepos();
    seedImage(repos, { hash: 'keep' });
    repos.images.insert({
      hash: 'orphan',
      width: 1,
      height: 1,
      format: 'png',
      animated: false,
      sizeBytes: 1,
      placeholder: '',
      addedAt: 0,
    });
    expect(repos.images.deleteOrphans()).toEqual([{ id: expect.any(Number), hash: 'orphan' }]);
    expect(repos.images.findIdByHash('keep')).toBeDefined();
  });

  it('keeps the earliest addedAt', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { addedAt: 50 });
    repos.images.touchAddedAt(id, 80);
    repos.images.touchAddedAt(id, 20);
    expect(repos.images.get(id)?.added_at).toBe(20);
  });
});

function setupDuplicates() {
  const repos = createTestRepos();
  const ids = {
    big: seedImage(repos, {
      width: 2000,
      height: 2000,
      addedAt: 3,
      group: { kind: 'illustrator', name: 'Ana' },
    }),
    small: seedImage(repos, {
      width: 500,
      height: 500,
      addedAt: 2,
      group: { kind: 'collection', name: 'Picks' },
    }),
    other: seedImage(repos, { addedAt: 1, group: { kind: 'collection', name: 'Picks' } }),
  };
  repos.images.setDuplicates(new Map([[ids.small, ids.big]]));
  return { repos, ids };
}

describe('ImageRepository duplicates', () => {
  it.each([
    {
      label: 'everything, hiding on: the smaller copy goes',
      hide: true,
      group: undefined,
      expected: ['big', 'other'],
    },
    { label: 'everything, hiding off', hide: false, group: undefined, expected: ['big', 'small', 'other'] },
    {
      label: 'a collection holding only the small copy keeps it',
      hide: true,
      group: 'Picks',
      expected: ['small', 'other'],
    },
  ])('$label', ({ hide, group, expected }) => {
    const { repos, ids } = setupDuplicates();
    const groupId = group ? repos.groups.list({}).find((g) => g.name === group)!.id : undefined;
    const tiles = repos.images.list(groupId ? { group: groupId } : {}, {
      ...THRESHOLDS,
      hideDuplicates: hide,
    }).tiles;
    expect(tiles.map((t) => Object.entries(ids).find(([, v]) => v === t.id)![0])).toEqual(expected);
  });

  it('returns tiles by id in the requested order, hiding copies whose best copy is present', () => {
    const { repos, ids } = setupDuplicates();
    const order = [ids.other, ids.small, ids.big, 9999];
    expect(repos.images.tilesByIds(order, { ...THRESHOLDS, hideDuplicates: true }).map((t) => t.id)).toEqual([
      ids.other,
      ids.big,
    ]);
    expect(repos.images.tilesByIds([], THRESHOLDS)).toEqual([]);
  });

  it('lists clusters and replaces links', () => {
    const { repos, ids } = setupDuplicates();
    expect(repos.images.duplicateClusters().map((c) => [c.best.id, c.copies.map((x) => x.id)])).toEqual([
      [ids.big, [ids.small]],
    ]);
    expect(repos.images.setDuplicates(new Map([[ids.other, ids.big]]))).toBe(2);
    expect(repos.images.setDuplicates(new Map([[ids.other, ids.big]]))).toBe(0);
  });

  it('finds ids matching a query for restricting rankings', () => {
    const { repos, ids } = setupDuplicates();
    const picks = repos.groups.list({}).find((g) => g.name === 'Picks')!.id;
    expect([...repos.images.idsMatching({ group: picks }, THRESHOLDS)].toSorted()).toEqual(
      [ids.small, ids.other].toSorted(),
    );
  });

  it('tracks images that still need a perceptual hash', () => {
    const { repos, ids } = setupDuplicates();
    expect(repos.images.missingPhash(10).map((r) => r.id)).toEqual([ids.big, ids.small, ids.other]);
    repos.images.setPhash(ids.big, '00000000000000ff');
    expect(repos.images.missingPhash(10).map((r) => r.id)).toEqual([ids.small, ids.other]);
    expect(repos.images.duplicateCandidates()).toEqual([
      { id: ids.big, phash: '00000000000000ff', width: 2000, height: 2000, sizeBytes: 1000 },
    ]);
  });
});
