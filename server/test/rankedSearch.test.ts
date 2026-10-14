import { describe, expect, it, vi } from 'vitest';
import { encodeVector, normalize, type ImageQuery } from '@eikon/shared';
import { filtersOf, RankedSearchError, rankedImages } from '../src/search/rankedSearch';
import { SimilarityService } from '../src/similarity/similarityService';
import { TaggerUnavailableError } from '../src/tagging/taggerClient';
import { createTestRepos, seedImage, THRESHOLDS } from './support/fixtures';

function setup(embedText = vi.fn(async () => ({ model: 'clip', vector: encodeVector(normalize([1, 0])) }))) {
  const repos = createTestRepos();
  const ids = {
    sea: seedImage(repos, { tags: ['sea'], group: { kind: 'illustrator', name: 'Ana' } }),
    wave: seedImage(repos, { tags: ['wave'], group: { kind: 'illustrator', name: 'Ben' } }),
    city: seedImage(repos, { tags: ['city'], group: { kind: 'illustrator', name: 'Ana' } }),
    plain: seedImage(repos, { tags: ['plain'] }),
  };
  const similarity = new SimilarityService(repos.embeddings, { embedText });
  const save = (id: number, ...v: number[]) =>
    similarity.save(id, { model: 'clip', vector: encodeVector(normalize(v)) });
  save(ids.sea, 1, 0);
  save(ids.wave, 0.9, 0.3);
  save(ids.city, 0, 1);
  const run = (query: ImageQuery) =>
    rankedImages(query, { ...THRESHOLDS, hideDuplicates: true }, { images: repos.images, similarity });
  return { repos, ids, run };
}

describe('filtersOf', () => {
  it('keeps restricting criteria and drops ordering and ranking', () => {
    expect(
      filtersOf({ group: 2, tags: ['a'], sort: 'oldest', seed: 3, like: 4, text: 'x', limit: 9 }),
    ).toEqual({
      group: 2,
      tags: ['a'],
    });
  });
});

describe('rankedImages', () => {
  it.each([
    {
      label: 'like: everything else, most similar first',
      query: (ids: Record<string, number>) => ({ like: ids.sea }),
      expected: ['wave', 'city'],
    },
    {
      label: 'like within a group',
      query: (ids: Record<string, number>) => ({ like: ids.sea, group: 1 }),
      expected: ['city'],
    },
    {
      label: 'like with a tag filter',
      query: (ids: Record<string, number>) => ({ like: ids.sea, tags: ['wave'] }),
      expected: ['wave'],
    },
    {
      label: 'text, best match first',
      query: () => ({ text: 'the sea' }),
      expected: ['sea', 'wave', 'city'],
    },
    { label: 'text with a limit', query: () => ({ text: 'the sea', limit: 1 }), expected: ['sea'] },
  ])('$label', async ({ query, expected }) => {
    const { ids, run } = setup();
    const names = (id: number) => Object.entries(ids).find(([, v]) => v === id)![0];
    expect((await run(query(ids))).map((t) => names(t.id))).toEqual(expected);
  });

  it.each([
    {
      label: 'an image without an embedding',
      query: (ids: Record<string, number>) => ({ like: ids.plain }),
      status: 409,
    },
    { label: 'a deleted image', query: () => ({ like: 9999 }), status: 404 },
  ])('explains $label with $status', async ({ query, status }) => {
    const { ids, run } = setup();
    await expect(run(query(ids))).rejects.toMatchObject({ status });
  });

  it('answers 503 when gpubox cannot embed the description', async () => {
    const { run } = setup(
      vi.fn(async () => {
        throw new TaggerUnavailableError('down');
      }),
    );
    const error = await run({ text: 'sea' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RankedSearchError);
    expect((error as RankedSearchError).status).toBe(503);
  });
});
