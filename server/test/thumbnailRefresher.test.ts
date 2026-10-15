import { describe, expect, it } from 'vitest';
import { THUMB_VERSION } from '@eikon/shared';
import { ThumbnailRefresher } from '../src/media/thumbnailRefresher';
import { silentLogger } from '../src/util/logger';
import { createTestRepos, seedImage } from './support/fixtures';
import { FakeProcessor, MemoryLibrary, MemoryThumbnails } from './support/fakes';
import { ManualSleep } from './support/manualSleep';

function setup() {
  const repos = createTestRepos();
  const library = new MemoryLibrary();
  const thumbnails = new MemoryThumbnails();
  let scanning = false;
  const refresher = new ThumbnailRefresher({
    images: repos.images,
    files: repos.files,
    library,
    processor: new FakeProcessor(),
    thumbnails,
    scanning: () => scanning,
    sleep: new ManualSleep().sleep,
    logger: silentLogger,
    concurrency: 2,
  });
  /** An image with version-1 thumbnails whose original holds `content` (none when undefined). */
  const seedOld = (hash: string, content?: string) => {
    const id = seedImage(repos, { hash, thumbVersion: 1 });
    if (content !== undefined) library.put(`illustrator/Default/${hash}-0.jpg`, content);
    return id;
  };
  return { repos, library, thumbnails, refresher, seedOld, setScanning: (on: boolean) => (scanning = on) };
}

describe('ThumbnailRefresher', () => {
  it('rebuilds older thumbnails from the originals and leaves current ones alone', async () => {
    const { repos, library, thumbnails, refresher, seedOld } = setup();
    const a = seedOld('a', 'cat');
    const b = seedOld('b', 'dog');
    seedImage(repos, { hash: 'c' });

    expect(await refresher.runBatch()).toBe(0);
    expect(library.reads).toEqual(['illustrator/Default/a-0.jpg', 'illustrator/Default/b-0.jpg']);
    expect(String(await thumbnails.read('a', 'md'))).toBe('md:cat');
    expect(String(await thumbnails.read('b', 'lg'))).toBe('lg:dog');
    expect(repos.images.get(a)?.thumb_version).toBe(THUMB_VERSION);
    expect(repos.images.get(b)?.thumb_version).toBe(THUMB_VERSION);
    expect(repos.images.staleThumbnails(THUMB_VERSION, 10)).toEqual([]);

    expect(await refresher.runBatch()).toBeGreaterThan(0);
    expect(library.reads).toHaveLength(2);
  });

  it('skips images that fail without holding up the rest', async () => {
    const { repos, library, thumbnails, refresher, seedOld } = setup();
    const bad = seedOld('bad', 'bad bytes');
    const missing = seedOld('missing');
    const good = seedOld('good', 'fine');

    expect(await refresher.runBatch()).toBe(0);
    expect(String(await thumbnails.read('good', 'sm'))).toBe('sm:fine');
    expect(repos.images.staleThumbnails(THUMB_VERSION, 10).map(({ id }) => id)).toEqual([bad, missing]);
    expect(repos.images.get(good)?.thumb_version).toBe(THUMB_VERSION);

    library.reads = [];
    expect(await refresher.runBatch()).toBeGreaterThan(0);
    expect(library.reads).toEqual([]);
  });

  it('waits while a scan is processing images', async () => {
    const { library, refresher, seedOld, setScanning } = setup();
    seedOld('a', 'cat');
    setScanning(true);
    expect(await refresher.runBatch()).toBeGreaterThan(0);
    expect(library.reads).toEqual([]);
    setScanning(false);
    expect(await refresher.runBatch()).toBe(0);
    expect(library.reads).toHaveLength(1);
  });
});
