import { THUMB_VERSION } from '@eikon/shared';
import type { FileRepository } from '../db/fileRepository';
import type { ImageRepository } from '../db/imageRepository';
import type { LibrarySource } from '../library/librarySource';
import { BackgroundLoop } from '../util/backgroundLoop';
import type { Sleep } from '../util/clock';
import { mapWithConcurrency } from '../util/concurrency';
import type { Logger } from '../util/logger';
import type { ImageProcessor } from './imageProcessor';
import type { ThumbnailStore } from './thumbnailStore';

export interface ThumbnailRefresherDeps {
  images: Pick<ImageRepository, 'staleThumbnails' | 'countStaleThumbnails' | 'setThumbVersion'>;
  files: Pick<FileRepository, 'firstPathOf'>;
  library: Pick<LibrarySource, 'read'>;
  processor: Pick<ImageProcessor, 'thumbnails'>;
  thumbnails: Pick<ThumbnailStore, 'write'>;
  /** True while a scan is processing images; rebuilding waits so the two don't compete for the CPU. */
  scanning: () => boolean;
  sleep: Sleep;
  logger: Logger;
  concurrency: number;
}

const BATCH_SIZE = 50;
const SCAN_WAIT_MS = 30_000;
/** New images get current thumbnails when scanned, so once caught up there is rarely anything to do. */
const IDLE_MS = 60 * 60_000;

/**
 * Rebuilds thumbnails made by an older THUMB_VERSION from the originals, in the background. Until an
 * image's are rebuilt it keeps its old ones. Images that fail are skipped until the next restart, so one
 * bad file can't stall the rest.
 */
export class ThumbnailRefresher {
  private readonly loop: BackgroundLoop;
  private readonly skipped = new Set<number>();
  private rebuilt: number | null = null;

  constructor(private readonly deps: ThumbnailRefresherDeps) {
    this.loop = new BackgroundLoop(() => this.runBatch(), deps.sleep);
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  /** Exposed for tests; returns the delay until the next batch. */
  async runBatch(): Promise<number> {
    if (this.deps.scanning()) return SCAN_WAIT_MS;
    const batch = this.deps.images
      .staleThumbnails(THUMB_VERSION, BATCH_SIZE + this.skipped.size)
      .filter(({ id }) => !this.skipped.has(id))
      .slice(0, BATCH_SIZE);
    if (batch.length === 0) {
      if (this.rebuilt !== null) this.deps.logger.info({ rebuilt: this.rebuilt }, 'thumbnails rebuilt');
      this.rebuilt = null;
      return IDLE_MS;
    }
    if (this.rebuilt === null) {
      const stale = this.deps.images.countStaleThumbnails(THUMB_VERSION) - this.skipped.size;
      this.deps.logger.info({ stale, version: THUMB_VERSION }, 'rebuilding older thumbnails');
      this.rebuilt = 0;
    }
    await mapWithConcurrency(batch, this.deps.concurrency, (image) => this.rebuild(image));
    return 0;
  }

  private async rebuild({ id, hash }: { id: number; hash: string }): Promise<void> {
    try {
      const path = this.deps.files.firstPathOf(id);
      if (!path) throw new Error('no file for this image');
      const thumbnails = await this.deps.processor.thumbnails(await this.deps.library.read(path));
      await this.deps.thumbnails.write(hash, thumbnails);
      this.deps.images.setThumbVersion(id, THUMB_VERSION);
      this.rebuilt = (this.rebuilt ?? 0) + 1;
    } catch (error) {
      this.skipped.add(id);
      this.deps.logger.warn(
        { imageId: id, err: error instanceof Error ? error.message : error },
        'cannot rebuild thumbnails',
      );
    }
  }
}
