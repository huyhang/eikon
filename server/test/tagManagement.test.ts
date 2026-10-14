import { describe, expect, it } from 'vitest';
import { impliedRowsFor } from '../src/db/impliedTags';
import { TagAdminError } from '../src/db/tagAdminRepository';
import { buildGraph, impliedBy, wouldCreateCycle } from '../src/db/tagGraph';
import { createTestRepos, seedImage, THRESHOLDS } from './support/fixtures';

const graph = buildGraph([
  { tagId: 1, impliedTagId: 2 }, // miku → aqua_hair
  { tagId: 2, impliedTagId: 3 }, // aqua_hair → colored_hair
  { tagId: 4, impliedTagId: 3 },
]);

describe('tag graph', () => {
  it.each([
    { start: 1, expected: [2, 3] },
    { start: 2, expected: [3] },
    { start: 3, expected: [] },
  ])('impliedBy($start) → $expected', ({ start, expected }) => {
    expect([...impliedBy(start, graph)].toSorted()).toEqual(expected);
  });

  it.each([
    { from: 3, to: 1, cycle: true },
    { from: 1, to: 1, cycle: true },
    { from: 1, to: 4, cycle: false },
  ])('wouldCreateCycle($from → $to) → $cycle', ({ from, to, cycle }) => {
    expect(wouldCreateCycle(from, to, graph)).toBe(cycle);
  });

  it('survives an existing loop', () => {
    expect([
      ...impliedBy(
        1,
        buildGraph([
          { tagId: 1, impliedTagId: 2 },
          { tagId: 2, impliedTagId: 1 },
        ]),
      ),
    ]).toEqual([2]);
  });
});

describe('impliedRowsFor', () => {
  it.each([
    {
      label: 'auto tag implies transitively, with its confidence',
      rows: [{ tag_id: 1, source: 'auto' as const, confidence: 0.9 }],
      expected: { 2: 0.9, 3: 0.9 },
    },
    {
      label: 'a hand-added source makes implied tags always visible (null)',
      rows: [
        { tag_id: 1, source: 'auto' as const, confidence: 0.9 },
        { tag_id: 4, source: 'manual' as const, confidence: null },
      ],
      expected: { 2: 0.9, 3: null },
    },
    {
      label: 'a removed tag is never implied back',
      rows: [
        { tag_id: 1, source: 'auto' as const, confidence: 0.9 },
        { tag_id: 3, source: 'removed' as const, confidence: null },
      ],
      expected: { 2: 0.9 },
    },
    {
      label: 'tags already present are not duplicated',
      rows: [
        { tag_id: 1, source: 'auto' as const, confidence: 0.6 },
        { tag_id: 2, source: 'auto' as const, confidence: 0.95 },
      ],
      expected: { 3: 0.95 },
    },
  ])('$label', ({ rows, expected }) => {
    expect(Object.fromEntries(impliedRowsFor(rows, graph))).toEqual(expected);
  });
});

function tagNames(repos: ReturnType<typeof createTestRepos>, id: number) {
  return repos.tags.forImage(id, THRESHOLDS).map((t) => `${t.name}:${t.source}`);
}

describe('implications on images', () => {
  it('materialises implied tags and keeps them in step with edits', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, {
      tags: [{ name: 'hatsune_miku', category: 'character', confidence: 0.95 }],
    });
    repos.tagAdmin.addImplication('hatsune_miku', 'aqua_hair');
    repos.tagAdmin.addImplication('aqua_hair', 'colored_hair');
    expect(tagNames(repos, id)).toEqual(['hatsune_miku:auto', 'aqua_hair:implied', 'colored_hair:implied']);

    repos.tags.remove(id, 'colored_hair');
    expect(tagNames(repos, id)).toEqual(['hatsune_miku:auto', 'aqua_hair:implied']);

    repos.tagAdmin.removeImplication('hatsune_miku', 'aqua_hair');
    expect(tagNames(repos, id)).toEqual(['hatsune_miku:auto']);
  });

  it('lets search find images by an implied tag, hiding ones implied by faint tags', () => {
    const repos = createTestRepos();
    const strong = seedImage(repos, { tags: [{ name: 'cat', confidence: 0.9 }] });
    seedImage(repos, { tags: [{ name: 'cat', confidence: 0.2 }] });
    repos.tagAdmin.addImplication('cat', 'animal');
    expect(repos.images.list({ tags: ['animal'] }, THRESHOLDS).tiles.map((t) => t.id)).toEqual([strong]);
  });

  it('an auto tag replaces a row that was only implied', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { tags: ['cat'] });
    repos.tagAdmin.addImplication('cat', 'animal');
    repos.tagQueue.markTagged(
      id,
      {
        model: 'm',
        rating: { general: 1, sensitive: 0, questionable: 0, explicit: 0 },
        tags: [
          { name: 'cat', category: 'general', confidence: 0.9 },
          { name: 'animal', category: 'general', confidence: 0.7 },
        ],
      },
      0,
    );
    expect(tagNames(repos, id)).toEqual(['cat:auto', 'animal:auto']);
  });

  it('refuses an implication loop', () => {
    const repos = createTestRepos();
    seedImage(repos, { tags: ['a', 'b'] });
    repos.tagAdmin.addImplication('a', 'b');
    expect(() => repos.tagAdmin.addImplication('b', 'a')).toThrow(TagAdminError);
  });
});

describe('aliases', () => {
  it('maps tagger names and searches onto the aliased tag', () => {
    const repos = createTestRepos();
    const first = seedImage(repos, { tags: ['blue_hair'] });
    repos.tagAdmin.addAlias('blue_hair', 'azure_hair');
    const second = seedImage(repos, { tags: [{ name: 'azure_hair', confidence: 0.8 }] });
    expect(tagNames(repos, second)).toEqual(['blue_hair:auto']);
    expect(
      repos.images
        .list({ tags: ['azure_hair'] }, THRESHOLDS)
        .tiles.map((t) => t.id)
        .toSorted(),
    ).toEqual([first, second].toSorted());
    expect(repos.tags.suggest('azu', 5, THRESHOLDS).map((t) => t.name)).toEqual(['blue_hair']);
  });

  it.each([
    { label: 'an existing tag name', alias: 'sky', status: 409 },
    { label: 'an alias of another tag', alias: 'heaven', status: 409 },
  ])('refuses $label as an alias', ({ alias, status }) => {
    const repos = createTestRepos();
    seedImage(repos, { tags: ['sky', 'cloud'] });
    repos.tagAdmin.addAlias('sky', 'heaven');
    let error: unknown;
    try {
      repos.tagAdmin.addAlias('cloud', alias);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TagAdminError);
    expect((error as TagAdminError).status).toBe(status);
  });

  it('keeps aliased and implied tags when cleaning up unused tags', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { tags: ['cat'] });
    repos.tagAdmin.addImplication('cat', 'animal');
    repos.tags.remove(id, 'cat');
    repos.tags.remove(id, 'animal');
    repos.tags.deleteUnused();
    expect(repos.tagAdmin.info('animal', THRESHOLDS)).toMatchObject({ impliedBy: ['cat'] });
  });
});

const rounded = (c: number | null) => (c === null ? null : Math.round(c * 100) / 100);

describe('rename and merge', () => {
  it('renames a tag and leaves the old name as an alias', () => {
    const repos = createTestRepos();
    const id = seedImage(repos, { tags: ['blonde_hair'] });
    expect(repos.tagAdmin.rename('blonde_hair', 'golden_hair')).toBe('golden_hair');
    expect(tagNames(repos, id)).toEqual(['golden_hair:auto']);
    expect(repos.tagAdmin.info('golden_hair', THRESHOLDS)?.aliases).toEqual(['blonde_hair']);
  });

  it.each([
    { label: 'manual beats auto', from: 'manual', into: 'auto', expected: 'manual', confidence: null },
    { label: 'removed beats auto', from: 'auto', into: 'removed', expected: 'removed', confidence: null },
    { label: 'manual beats removed', from: 'removed', into: 'manual', expected: 'manual', confidence: null },
    {
      label: 'auto keeps the higher confidence',
      from: 'auto',
      into: 'auto',
      expected: 'auto',
      confidence: 0.9,
    },
  ])('merging resolves conflicts: $label', ({ from, into, expected, confidence }) => {
    const repos = createTestRepos();
    const id = seedImage(repos, {
      tags: [
        { name: 'cat', confidence: 0.6 },
        { name: 'kitty', confidence: 0.9 },
      ],
    });
    const apply = (name: string, source: string) => {
      if (source === 'manual') repos.tags.addManual(id, name, 'general');
      if (source === 'removed') repos.tags.remove(id, name);
    };
    apply('kitty', from);
    apply('cat', into);
    expect(repos.tagAdmin.rename('kitty', 'cat')).toBe('cat');
    const rows = repos.db.all<{ source: string; confidence: number | null }>(
      "SELECT it.source, it.confidence FROM image_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name = 'cat'",
    );
    expect(rows.map((r) => [r.source, rounded(r.confidence)])).toEqual([[expected, confidence]]);
    expect(repos.tags.idOf('kitty')).toBe(repos.tags.idOf('cat'));
  });

  it('recategorises and reports usage', () => {
    const repos = createTestRepos();
    seedImage(repos, { tags: ['wlop'] });
    repos.tagAdmin.setCategory('wlop', 'artist');
    expect(repos.tagAdmin.list({ query: 'wl', limit: 10, offset: 0 }, THRESHOLDS)).toEqual({
      total: 1,
      tags: [{ name: 'wlop', category: 'artist', count: 1, aliases: [], implies: [], impliedBy: [] }],
    });
  });

  it.each([
    {
      label: 'renaming a missing tag',
      run: (r: ReturnType<typeof createTestRepos>) => r.tagAdmin.rename('nope', 'x'),
    },
    {
      label: 'removing a missing alias',
      run: (r: ReturnType<typeof createTestRepos>) => r.tagAdmin.removeAlias('sky', 'nope'),
    },
    {
      label: 'removing a missing implication',
      run: (r: ReturnType<typeof createTestRepos>) => r.tagAdmin.removeImplication('sky', 'nope'),
    },
  ])('$label → 404', ({ run }) => {
    const repos = createTestRepos();
    seedImage(repos, { tags: ['sky'] });
    expect(() => run(repos)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
