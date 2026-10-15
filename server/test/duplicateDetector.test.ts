import { describe, expect, it } from 'vitest';
import { DuplicateDetector } from '../src/library/duplicateDetector';
import { silentLogger } from '../src/util/logger';
import { createTestRepos, seedImage } from './support/fixtures';
import { FakeProcessor, fakePhash, MemoryThumbnails } from './support/fakes';

async function setup(entries: Array<{ hash: string; width: number; thumbnail?: string }>) {
  const repos = createTestRepos();
  const thumbnails = new MemoryThumbnails();
  const ids: Record<string, number> = {};
  for (const e of entries) {
    ids[e.hash] = seedImage(repos, { hash: e.hash, width: e.width, height: e.width });
    if (e.thumbnail)
      await thumbnails.write(e.hash, {
        sm: Buffer.from(e.thumbnail),
        md: Buffer.from('md'),
        lg: Buffer.from('lg'),
      });
  }
  const detector = new DuplicateDetector({
    images: repos.images,
    processor: new FakeProcessor(),
    thumbnails,
    logger: silentLogger,
  });
  return { repos, ids, detector };
}

describe('DuplicateDetector', () => {
  it('hashes images from their thumbnails, then links smaller copies to the best one', async () => {
    const { repos, ids, detector } = await setup([
      { hash: 'big', width: 2000, thumbnail: 'dup:1:big' },
      { hash: 'small', width: 500, thumbnail: 'dup:1:small' },
      { hash: 'other', width: 800, thumbnail: 'other:2' },
    ]);
    expect(await detector.refresh()).toEqual({ hashed: 3, changedLinks: 1 });
    expect(repos.images.duplicateClusters().map((c) => [c.best.id, c.copies.map((x) => x.id)])).toEqual([
      [ids.big, [ids.small]],
    ]);
    expect(await detector.refresh()).toEqual({ hashed: 0, changedLinks: 0 });
  });

  it('marks unreadable thumbnails so they are not retried, and leaves them out of clustering', async () => {
    const { repos, detector } = await setup([{ hash: 'gone', width: 100 }]);
    expect(await detector.refresh()).toEqual({ hashed: 0, changedLinks: 0 });
    expect(repos.images.missingPhash(10)).toEqual([]);
    expect(repos.images.duplicateCandidates()).toEqual([]);
  });

  it('unlinks copies that stop being duplicates', async () => {
    const { repos, ids, detector } = await setup([
      { hash: 'a', width: 900, thumbnail: 'dup:9' },
      { hash: 'b', width: 300, thumbnail: 'dup:9' },
    ]);
    await detector.refresh();
    repos.images.setPhash(ids.b!, fakePhash(Buffer.from('elsewhere:1')));
    expect(await detector.refresh()).toEqual({ hashed: 0, changedLinks: 1 });
    expect(repos.images.duplicateClusters()).toEqual([]);
  });
});
