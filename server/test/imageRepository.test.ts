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
    expect([...a].sort()).toEqual(['faint', 'night', 'sky', 'untagged']);
  });

  it('respects lowered thresholds', () => {
    const tiles = repos.images.list({ tags: ['sky'] }, { ...THRESHOLDS, generalThreshold: 0.1 }).tiles;
    expect(tiles).toHaveLength(3);
  });
});

describe('ImageRepository housekeeping', () => {
  it('deletes images without files and returns their hashes', () => {
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
    expect(repos.images.deleteOrphans()).toEqual(['orphan']);
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
