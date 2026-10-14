import { describe, expect, it } from 'vitest';
import { createTestRepos, seedImage } from './support/fixtures';

describe('TagQueueRepository', () => {
  it('serves pending images newest first and honours next_tag_at', () => {
    const repos = createTestRepos();
    const old = seedImage(repos, { addedAt: 1 });
    const fresh = seedImage(repos, { addedAt: 2 });
    seedImage(repos, { addedAt: 3, rating: 'general' });
    expect(repos.tagQueue.nextBatch(0, 10)).toEqual([fresh, old]);
    repos.tagQueue.markFailed(fresh, 'boom', () => 100, 5);
    expect(repos.tagQueue.nextBatch(50, 10)).toEqual([old]);
    expect(repos.tagQueue.nextBatch(100, 10)).toEqual([fresh, old]);
  });

  it.each([
    [1, 'failed'],
    [2, 'pending'],
  ] as const)('markFailed with maxAttempts=%i leaves status %s after one failure', (maxAttempts, status) => {
    const repos = createTestRepos();
    const id = seedImage(repos);
    expect(repos.tagQueue.markFailed(id, 'boom', () => 0, maxAttempts)).toBe(status);
  });

  it('passes the attempt number to the retry schedule', () => {
    const repos = createTestRepos();
    const id = seedImage(repos);
    const seen: number[] = [];
    repos.tagQueue.markFailed(id, 'a', (n) => (seen.push(n), 0), 5);
    repos.tagQueue.markFailed(id, 'b', (n) => (seen.push(n), 0), 5);
    expect(seen).toEqual([1, 2]);
  });

  it('stores the strongest rating and resets failure state', () => {
    const repos = createTestRepos();
    const id = seedImage(repos);
    repos.tagQueue.markFailed(id, 'boom', () => 0, 5);
    repos.tagQueue.markTagged(
      id,
      { model: 'wd', rating: { general: 0.1, sensitive: 0.7, questionable: 0.2, explicit: 0 }, tags: [] },
      9,
    );
    expect(repos.images.get(id)).toMatchObject({ rating: 1, tag_status: 'done' });
  });

  it('counts, lists, retries failures and re-tags everything', () => {
    const repos = createTestRepos();
    const failed = seedImage(repos);
    seedImage(repos);
    seedImage(repos, { rating: 'general' });
    repos.tagQueue.markFailed(failed, 'bad image', () => 0, 1);
    expect(repos.tagQueue.counts()).toEqual({ pending: 1, done: 1, failed: 1, total: 3 });
    expect(repos.tagQueue.listFailed(10)).toMatchObject([
      { error: 'bad image', attempts: 1, tile: { id: failed } },
    ]);
    expect(repos.tagQueue.retryFailed()).toBe(1);
    expect(repos.tagQueue.retagAll()).toBe(3);
    expect(repos.tagQueue.counts().pending).toBe(3);
  });
});
