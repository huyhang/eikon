import { describe, expect, it } from 'vitest';
import type { GroupSort } from '@eikon/shared';
import { createTestRepos, seedImage } from './support/fixtures';

function seedGroups() {
  const repos = createTestRepos();
  const ana = { kind: 'illustrator' as const, name: 'ana' };
  const Bo = { kind: 'illustrator' as const, name: 'Bo' };
  const mood = { kind: 'collection' as const, name: 'Mood' };
  seedImage(repos, { group: ana, addedAt: 10, rating: 'general' });
  seedImage(repos, { group: ana, addedAt: 11, rating: 'explicit', extraGroups: [mood] });
  for (let i = 0; i < 5; i++) seedImage(repos, { group: Bo, addedAt: i, rating: 'general' });
  return repos;
}

describe('GroupRepository.list', () => {
  it.each<[GroupSort, string[]]>([
    ['name', ['ana', 'Bo']],
    ['count', ['Bo', 'ana']],
    ['recent', ['ana', 'Bo']],
  ])('sort=%s', (sort, expected) => {
    expect(
      seedGroups()
        .groups.list({ kind: 'illustrator', sort })
        .map((g) => g.name),
    ).toEqual(expected);
  });

  it('counts distinct images and keeps at most four covers, newest first', () => {
    const bo = seedGroups().groups.list({ kind: 'illustrator', sort: 'count' })[0]!;
    expect(bo.imageCount).toBe(5);
    expect(bo.covers).toHaveLength(4);
    expect(bo.latestAt).toBe(4);
  });

  it('safe mode drops groups whose images are all hidden', () => {
    const repos = seedGroups();
    expect(repos.groups.list({ kind: 'collection', maxRating: 'sensitive' })).toEqual([]);
    const ana = repos.groups
      .list({ kind: 'illustrator', maxRating: 'general' })
      .find((g) => g.name === 'ana')!;
    expect(ana.imageCount).toBe(1);
    expect(ana.covers).toHaveLength(1);
  });

  it.each([
    [undefined, 2, 1],
    ['sensitive' as const, 2, 0],
  ])('count with maxRating=%s', (maxRating, illustrators, collections) => {
    const repos = seedGroups();
    expect(repos.groups.count('illustrator', maxRating)).toBe(illustrators);
    expect(repos.groups.count('collection', maxRating)).toBe(collections);
  });

  it('upsert is idempotent and deleteEmpty removes groups without files', () => {
    const repos = createTestRepos();
    const id = repos.groups.upsert('collection', 'Empty');
    expect(repos.groups.upsert('collection', 'Empty')).toBe(id);
    expect(repos.groups.deleteEmpty()).toBe(1);
  });
});
