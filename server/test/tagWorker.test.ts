import { describe, expect, it } from 'vitest';
import { encodeVector, type Embedding, type TaggerHealth, type TaggerResult } from '@eikon/shared';
import { backoffDelay } from '../src/tagging/backoff';
import { TaggerRejectedError, TaggerUnavailableError, type TaggerClient } from '../src/tagging/taggerClient';
import { TagWorker, type TagWorkerOptions } from '../src/tagging/tagWorker';
import { SimilarityService } from '../src/similarity/similarityService';
import { silentLogger } from '../src/util/logger';
import { createTestRepos, seedImage } from './support/fixtures';
import { FakeClock, MemoryThumbnails } from './support/fakes';

const OPTIONS: TagWorkerOptions = {
  concurrency: 2,
  batchSize: 10,
  maxAttempts: 3,
  retryBaseMs: 1000,
  retryMaxMs: 8000,
  offlineBaseMs: 5000,
  offlineMaxMs: 60_000,
  idleMs: 10_000,
};

const vectorFor = (label: string): Embedding => ({
  model: 'clip',
  vector: encodeVector([label.length, label.charCodeAt(label.length - 1) % 7, 1]),
});

class FakeTagger implements TaggerClient {
  online = true;
  embeddings = false;
  rejectHashes = new Set<string>();
  unavailableAfter = Infinity;
  tagged: string[] = [];
  embedded: string[] = [];

  async health(): Promise<TaggerHealth> {
    if (!this.online) throw new TaggerUnavailableError('down');
    return { status: 'ok', model: 'fake-wd', device: 'cpu', embedModel: this.embeddings ? 'clip' : null };
  }

  async embedImage(image: Buffer): Promise<Embedding> {
    const label = image.toString();
    if (!this.online) throw new TaggerUnavailableError('down');
    if (this.rejectHashes.has(label)) throw new TaggerRejectedError('cannot decode');
    this.embedded.push(label);
    return vectorFor(label);
  }

  async embedText(): Promise<Embedding> {
    return vectorFor('text');
  }

  async tag(image: Buffer): Promise<TaggerResult> {
    const label = image.toString();
    if (this.tagged.length >= this.unavailableAfter) throw new TaggerUnavailableError('went away');
    if (this.rejectHashes.has(label)) throw new TaggerRejectedError('cannot decode');
    this.tagged.push(label);
    return {
      model: 'fake-wd',
      rating: { general: 0.9, sensitive: 0.1, questionable: 0, explicit: 0 },
      tags: [{ name: 'sky', category: 'general', confidence: 0.9 }],
      embedding: this.embeddings ? vectorFor(label) : null,
    };
  }
}

async function setup(count = 2) {
  const repos = createTestRepos();
  const thumbnails = new MemoryThumbnails();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = seedImage(repos, { hash: `img${i}`, addedAt: i });
    await thumbnails.write(`img${i}`, { sm: Buffer.from(`sm${i}`), lg: Buffer.from(`lg${i}`) });
    ids.push(id);
  }
  const tagger = new FakeTagger();
  const clock = new FakeClock();
  const similarity = new SimilarityService(repos.embeddings, tagger);
  const worker = new TagWorker({
    queue: repos.tagQueue,
    embeddings: {
      setModel: (model) => similarity.setModel(model),
      save: (id, embedding) => similarity.save(id, embedding),
      missing: (model, limit) => repos.embeddings.missing(model, limit),
      countMissing: (model) => repos.embeddings.countMissing(model),
    },
    tagger,
    hashOf: (id) => repos.images.hashOf(id),
    thumbnails,
    clock,
    sleep: async () => {},
    logger: silentLogger,
    options: OPTIONS,
  });
  return { repos, tagger, worker, clock, ids, similarity };
}

describe('TagWorker.runOnce', () => {
  it('tags pending images from their large thumbnail and reports status', async () => {
    const { repos, tagger, worker } = await setup();
    expect(await worker.runOnce()).toBe('worked');
    expect(tagger.tagged.toSorted()).toEqual(['lg0', 'lg1']);
    expect(worker.status()).toMatchObject({
      pending: 0,
      done: 2,
      taggerOnline: true,
      taggerModel: 'fake-wd',
    });
    expect(await worker.runOnce()).toBe('idle');
    expect(repos.tagQueue.counts().done).toBe(2);
  });

  it('goes offline without touching the queue when health fails', async () => {
    const { repos, tagger, worker } = await setup();
    tagger.online = false;
    expect(await worker.runOnce()).toBe('offline');
    expect(repos.tagQueue.counts().pending).toBe(2);
    expect(worker.status().taggerOnline).toBe(false);
  });

  it('does not count an attempt when the tagger disappears mid-batch', async () => {
    const { repos, tagger, worker, ids } = await setup();
    tagger.unavailableAfter = 0;
    expect(await worker.runOnce()).toBe('offline');
    ids.forEach((id) => expect(repos.images.get(id)?.tag_status).toBe('pending'));
    expect(repos.tagQueue.nextBatch(0, 10)).toHaveLength(2);
  });

  it('retries a rejected image with backoff, then gives up', async () => {
    const { repos, tagger, worker, clock, ids } = await setup(1);
    tagger.rejectHashes.add('lg0');
    await worker.runOnce();
    expect(repos.tagQueue.nextBatch(clock.now(), 10)).toEqual([]);
    clock.advance(1000);
    await worker.runOnce();
    clock.advance(2000);
    await worker.runOnce();
    expect(repos.images.get(ids[0]!)?.tag_status).toBe('failed');
    expect(repos.tagQueue.listFailed(5)[0]).toMatchObject({ attempts: 3, error: 'cannot decode' });
  });
});

describe('TagWorker embeddings', () => {
  it('stores the embedding that comes back with the tags', async () => {
    const { repos, tagger, worker, ids, similarity } = await setup();
    tagger.embeddings = true;
    expect(await worker.runOnce()).toBe('worked');
    expect(repos.embeddings.countMissing('clip')).toBe(0);
    expect(similarity.similarTo(ids[0]!, 5)?.map((r) => r.id)).toEqual([ids[1]]);
    expect(worker.status()).toMatchObject({ embedModel: 'clip', embeddingsPending: 0 });
  });

  it('backfills embeddings for already-tagged images once the queue is empty', async () => {
    const { repos, tagger, worker } = await setup();
    await worker.runOnce(); // tags without embeddings
    tagger.embeddings = true;
    expect(await worker.runOnce()).toBe('worked');
    expect(tagger.embedded.toSorted()).toEqual(['lg0', 'lg1']);
    expect(repos.embeddings.countMissing('clip')).toBe(0);
    expect(await worker.runOnce()).toBe('idle');
  });

  it.each([
    {
      label: 'a rejected image is skipped, not retried forever',
      fail: 'reject',
      first: 'worked',
      pending: 0,
      afterwards: 'idle',
    },
    {
      label: 'gpubox going away counts as offline',
      fail: 'offline',
      first: 'offline',
      pending: 2,
      afterwards: 'offline',
    },
  ])('$label', async ({ fail, first, pending, afterwards }) => {
    const { tagger, worker } = await setup();
    await worker.runOnce(); // tags both images; no embeddings yet
    tagger.embeddings = true;
    if (fail === 'reject') tagger.rejectHashes.add('lg0');
    else
      tagger.embedImage = async () => {
        throw new TaggerUnavailableError('gone');
      };
    expect(await worker.runOnce()).toBe(first);
    expect(worker.status().embeddingsPending).toBe(pending);
    expect(await worker.runOnce()).toBe(afterwards);
  });
});

describe('TagWorker.delayAfter', () => {
  it.each([
    ['worked', 0, 0],
    ['idle', 0, 10_000],
    ['offline', 1, 5000],
    ['offline', 3, 20_000],
    ['offline', 10, 60_000],
  ] as const)('%s after %i offline checks → %i ms', async (result, offlineChecks, expected) => {
    const { tagger, worker } = await setup(0);
    tagger.online = false;
    for (let i = 0; i < offlineChecks; i++) await worker.runOnce();
    expect(worker.delayAfter(result)).toBe(expected);
  });
});

describe('backoffDelay', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [4, 8000],
    [20, 30_000],
  ])('attempt %i → %i', (attempt, expected) => {
    expect(backoffDelay(attempt, 1000, 30_000)).toBe(expected);
  });
});
