import { describe, expect, it, vi } from 'vitest';
import { Scanner } from '../src/library/scanner';
import { silentLogger } from '../src/util/logger';
import { createTestRepos, THRESHOLDS } from './support/fixtures';
import { FakeClock, FakeProcessor, identityHasher, MemoryLibrary, MemoryThumbnails } from './support/fakes';

function setup() {
  const repos = createTestRepos();
  const library = new MemoryLibrary();
  const processor = new FakeProcessor();
  const thumbnails = new MemoryThumbnails();
  const clock = new FakeClock();
  const onImagesAdded = vi.fn();
  const scanner = new Scanner({
    library,
    processor,
    thumbnails,
    hasher: identityHasher,
    repos,
    clock,
    logger: silentLogger,
    concurrency: 2,
    onImagesAdded,
  });
  return { repos, library, processor, thumbnails, clock, scanner, onImagesAdded };
}

describe('Scanner', () => {
  it('ingests new images with groups and thumbnails, and wakes the tagger', async () => {
    const { repos, library, scanner, thumbnails, onImagesAdded } = setup();
    library.put('Illustrators/Ana/a.jpg', 'A', 50).put('Collections/Mood/b.jpg', 'B', 60);
    const summary = await scanner.scan();
    expect(summary).toMatchObject({ added: 2, failed: 0, unchanged: 0 });
    expect(repos.images.list({}, THRESHOLDS).tiles).toHaveLength(2);
    expect(
      repos.groups
        .list({})
        .map((g) => `${g.kind}:${g.name}`)
        .toSorted(),
    ).toEqual(['collection:Mood', 'illustrator:Ana']);
    expect(thumbnails.stored.has('h-A:sm')).toBe(true);
    expect(onImagesAdded).toHaveBeenCalledOnce();
    expect(scanner.status()).toMatchObject({ phase: 'idle', processed: 2, total: 2, lastScanAt: 1000 });
  });

  it('stores an image once when the same file is in an illustrator folder and a collection', async () => {
    const { repos, library, scanner, processor } = setup();
    library.put('Illustrators/Ana/a.jpg', 'SAME', 50).put('Collections/Best/a-copy.jpg', 'SAME', 20);
    await scanner.scan();
    const tiles = repos.images.list({}, THRESHOLDS).tiles;
    expect(tiles).toHaveLength(1);
    expect(processor.calls).toBeLessThanOrEqual(2);
    expect(repos.files.refsOf(tiles[0]!.id).map((r) => r.group.name)).toEqual(['Ana', 'Best']);
    expect(repos.images.get(tiles[0]!.id)?.added_at).toBe(20);
  });

  it('does not re-read unchanged files on later scans', async () => {
    const { library, scanner, onImagesAdded } = setup();
    library.put('Illustrators/Ana/a.jpg', 'A');
    await scanner.scan();
    library.reads = [];
    const summary = await scanner.scan();
    expect(library.reads).toEqual([]);
    expect(summary).toMatchObject({ added: 0, unchanged: 1 });
    expect(onImagesAdded).toHaveBeenCalledOnce();
  });

  it('removes vanished files, orphaned images, empty groups and their thumbnails', async () => {
    const { repos, library, scanner, thumbnails, clock } = setup();
    library.put('Illustrators/Ana/a.jpg', 'A').put('Illustrators/Bo/b.jpg', 'B');
    await scanner.scan();
    library.files.delete('Illustrators/Bo/b.jpg');
    clock.advance(1);
    const summary = await scanner.scan();
    expect(summary).toMatchObject({ removedFiles: 1, removedImages: 1 });
    expect(repos.groups.list({}).map((g) => g.name)).toEqual(['Ana']);
    expect(thumbnails.stored.has('h-B:sm')).toBe(false);
  });

  it('replaces the image when a file changes', async () => {
    const { repos, library, scanner } = setup();
    library.put('Illustrators/Ana/a.jpg', 'v1', 1);
    await scanner.scan();
    library.put('Illustrators/Ana/a.jpg', 'v2', 2);
    await scanner.scan();
    const tiles = repos.images.list({}, THRESHOLDS).tiles;
    expect(tiles).toHaveLength(1);
    expect(repos.images.hashOf(tiles[0]!.id)).toBe('h-v2');
  });

  it('skips undecodable files and does not retry them until they change', async () => {
    const { library, scanner, processor } = setup();
    library.put('Illustrators/Ana/a.jpg', 'bad1', 1).put('Illustrators/Ana/ok.jpg', 'fine');
    expect(await scanner.scan()).toMatchObject({ added: 1, failed: 1 });
    const calls = processor.calls;
    await scanner.scan();
    expect(processor.calls).toBe(calls);
    library.put('Illustrators/Ana/a.jpg', 'good now', 2);
    expect(await scanner.scan()).toMatchObject({ added: 1 });
  });

  it('keeps everything and reports the error when the library is unavailable', async () => {
    const { repos, library, scanner } = setup();
    library.put('Illustrators/Ana/a.jpg', 'A');
    await scanner.scan();
    library.unavailable = true;
    await expect(scanner.scan()).rejects.toThrow('library unavailable');
    expect(repos.images.list({}, THRESHOLDS).total).toBe(1);
    expect(scanner.status().lastError).toBe('library unavailable');
  });

  it('joins a scan that is already running', async () => {
    const { library, scanner } = setup();
    library.put('Illustrators/Ana/a.jpg', 'A');
    const [first, second] = [scanner.scan(), scanner.scan()];
    expect(first).toBe(second);
    await first;
  });
});
