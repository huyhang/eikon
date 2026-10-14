import { describe, expect, it, vi } from 'vitest';
import { encodeVector, normalize, type Embedding } from '@eikon/shared';
import { NoEmbeddingModelError, SimilarityService } from '../src/similarity/similarityService';
import { createTestRepos, seedImage } from './support/fixtures';

const embedding = (model: string, ...values: number[]): Embedding => ({
  model,
  vector: encodeVector(normalize(values)),
});

function setup() {
  const repos = createTestRepos();
  const ids = {
    sea: seedImage(repos, { tags: ['sea'] }),
    wave: seedImage(repos, { tags: ['wave'] }),
    city: seedImage(repos, { tags: ['city'] }),
  };
  const embedText = vi.fn(async (_text: string) => embedding('clip', 1, 0.1, 0));
  const service = new SimilarityService(repos.embeddings, { embedText });
  service.save(ids.sea, embedding('clip', 1, 0, 0));
  service.save(ids.wave, embedding('clip', 0.9, 0.2, 0));
  service.save(ids.city, embedding('clip', 0, 0, 1));
  return { repos, ids, service, embedText };
}

describe('SimilarityService', () => {
  it('ranks images like a given one, excluding itself', () => {
    const { ids, service } = setup();
    expect(service.similarTo(ids.sea, 5)?.map((r) => r.id)).toEqual([ids.wave, ids.city]);
  });

  it('ranks images by a text description embedded on gpubox', async () => {
    const { ids, service, embedText } = setup();
    const ranked = await service.describe('the sea', 2);
    expect(embedText).toHaveBeenCalledWith('the sea');
    expect(ranked.map((r) => r.id)).toEqual([ids.sea, ids.wave]);
  });

  it.each([
    {
      label: 'accept filter',
      accept: (id: number, ids: Record<string, number>) => id !== ids.wave,
      expected: ['city'],
    },
    { label: 'no filter', accept: () => true, expected: ['wave', 'city'] },
  ])('similarTo honours the $label', ({ accept, expected }) => {
    const { ids, service } = setup();
    const names = (id: number) => Object.entries(ids).find(([, v]) => v === id)![0];
    expect(service.similarTo(ids.sea, 5, (id) => accept(id, ids))?.map((r) => names(r.id))).toEqual(expected);
  });

  it('returns null for an image without an embedding', () => {
    const { repos, service } = setup();
    expect(service.similarTo(seedImage(repos), 5)).toBeNull();
  });

  it('keeps working from stored vectors in a fresh process (gpubox offline)', () => {
    const { repos, ids } = setup();
    const restarted = new SimilarityService(repos.embeddings, { embedText: vi.fn() });
    expect(restarted.model).toBe('clip');
    expect(restarted.similarTo(ids.sea, 1)?.[0]?.id).toBe(ids.wave);
  });

  it('forgets deleted images', () => {
    const { ids, service } = setup();
    service.similarTo(ids.sea, 1); // builds the index
    service.forget([ids.wave]);
    expect(service.similarTo(ids.sea, 5)?.map((r) => r.id)).toEqual([ids.city]);
  });

  it('switches to a new model and ignores vectors from the old one', () => {
    const { ids, service } = setup();
    service.setModel('clip-large');
    expect(service.similarTo(ids.sea, 5)).toBeNull();
    service.save(ids.sea, embedding('clip-large', 0, 1, 0));
    service.save(ids.city, embedding('clip-large', 0, 0.9, 0.1));
    expect(service.similarTo(ids.sea, 5)?.map((r) => r.id)).toEqual([ids.city]);
  });

  it('cannot describe without any embedding model', async () => {
    const repos = createTestRepos();
    const service = new SimilarityService(repos.embeddings, { embedText: vi.fn() });
    await expect(service.describe('anything', 5)).rejects.toBeInstanceOf(NoEmbeddingModelError);
  });
});

describe('EmbeddingRepository', () => {
  it('lists tagged images missing an embedding for a model, newest first', () => {
    const { repos, ids, service } = setup();
    const fresh = seedImage(repos, { tags: ['new'], addedAt: 999 });
    seedImage(repos); // not tagged yet: not eligible
    service.save(ids.city, embedding('other', 1, 0, 0));
    expect(repos.embeddings.missing('clip', 10)).toEqual([fresh, ids.city]);
    expect(repos.embeddings.countMissing('clip')).toBe(2);
    expect(repos.embeddings.mostUsedModel()).toBe('clip');
  });
});
