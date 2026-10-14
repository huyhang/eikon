import { describe, expect, it } from 'vitest';
import { compareImageTags, escapeLike } from '../src/db/tagRepository';
import { createTestRepos, seedImage, THRESHOLDS } from './support/fixtures';

function seedTags() {
  const repos = createTestRepos();
  const a = seedImage(repos, {
    rating: 'general',
    tags: ['blue_sky', 'sky', 'city', { name: 'miku', category: 'character', confidence: 0.9 }],
  });
  const b = seedImage(repos, {
    rating: 'explicit',
    tags: ['sky', 'night', { name: 'skyline', confidence: 0.1 }],
  });
  const c = seedImage(repos, {
    rating: 'general',
    tags: ['sky', 'city', { name: 'rin', category: 'character', confidence: 0.5 }],
  });
  return { repos, a, b, c };
}

describe('TagRepository.suggest', () => {
  it.each([
    ['sky', undefined, ['sky:3', 'blue_sky:1']],
    ['sky', 'general' as const, ['sky:2', 'blue_sky:1']],
    ['ci', undefined, ['city:2']],
    ['', undefined, []],
    ['%', undefined, []],
    ['rin', undefined, []],
  ])('q=%j maxRating=%s', (q, maxRating, expected) => {
    const { repos } = seedTags();
    expect(repos.tags.suggest(q, 10, THRESHOLDS, maxRating).map((t) => `${t.name}:${t.count}`)).toEqual(
      expected,
    );
  });
});

describe('TagRepository counts', () => {
  it('top orders by frequency', () => {
    const { repos } = seedTags();
    expect(repos.tags.top(2, THRESHOLDS).map((t) => t.name)).toEqual(['sky', 'city']);
  });

  it('related excludes the query tags and counts only matching images', () => {
    const { repos } = seedTags();
    const related = repos.tags.related({ tags: ['city'] }, 10, THRESHOLDS);
    expect(related.map((t) => `${t.name}:${t.count}`)).toEqual(['sky:2', 'blue_sky:1', 'miku:1']);
  });

  it('topInGroup limits to the group', () => {
    const repos = createTestRepos();
    seedImage(repos, { group: { kind: 'collection', name: 'X' }, tags: ['a'] });
    seedImage(repos, { group: { kind: 'collection', name: 'Y' }, tags: ['b'] });
    const x = repos.groups.list({ kind: 'collection' }).find((g) => g.name === 'X')!;
    expect(repos.tags.topInGroup(x.id, 5, THRESHOLDS).map((t) => t.name)).toEqual(['a']);
  });
});

describe('TagRepository manual edits', () => {
  it('a removed tag survives re-tagging', () => {
    const { repos, a } = seedTags();
    repos.tags.remove(a, 'city');
    repos.tagQueue.markTagged(
      a,
      {
        model: 'm',
        rating: { general: 1, sensitive: 0, questionable: 0, explicit: 0 },
        tags: [{ name: 'city', category: 'general', confidence: 0.99 }],
      },
      1,
    );
    expect(repos.tags.forImage(a, THRESHOLDS).map((t) => t.name)).not.toContain('city');
  });

  it('a manual tag survives re-tagging and is shown without confidence', () => {
    const { repos, a } = seedTags();
    repos.tags.addManual(a, 'favourite_pose', 'meta');
    repos.tagQueue.markTagged(
      a,
      { model: 'm', rating: { general: 1, sensitive: 0, questionable: 0, explicit: 0 }, tags: [] },
      1,
    );
    expect(repos.tags.forImage(a, THRESHOLDS)).toEqual([
      { name: 'favourite_pose', category: 'meta', confidence: null, source: 'manual' },
    ]);
  });

  it('re-adding a removed tag makes it manual', () => {
    const { repos, a } = seedTags();
    repos.tags.remove(a, 'sky');
    repos.tags.addManual(a, 'sky', 'general');
    expect(repos.tags.forImage(a, THRESHOLDS).find((t) => t.name === 'sky')?.source).toBe('manual');
  });

  it('removing an unknown tag reports false', () => {
    const { repos, a } = seedTags();
    expect(repos.tags.remove(a, 'never_seen')).toBe(false);
  });

  it('forImage hides automatic tags below their category threshold', () => {
    const { repos, c } = seedTags();
    expect(repos.tags.forImage(c, THRESHOLDS).map((t) => t.name)).toEqual(['city', 'sky']);
  });
});

describe('helpers', () => {
  it.each([
    ['plain', 'plain'],
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
  ])('escapeLike(%j)', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('compareImageTags orders by category, then confidence, then name', () => {
    const tags = [
      { name: 'b', category: 'general' as const, confidence: 0.5, source: 'auto' as const },
      { name: 'a', category: 'general' as const, confidence: 0.9, source: 'auto' as const },
      { name: 'z', category: 'character' as const, confidence: 0.9, source: 'auto' as const },
      { name: 'm', category: 'general' as const, confidence: null, source: 'manual' as const },
    ];
    expect([...tags].sort(compareImageTags).map((t) => t.name)).toEqual(['z', 'm', 'a', 'b']);
  });
});
