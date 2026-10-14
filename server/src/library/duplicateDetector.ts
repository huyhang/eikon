import type { ImageRepository } from '../db/imageRepository';
import type { ImageProcessor } from '../media/imageProcessor';
import type { ThumbnailStore } from '../media/thumbnailStore';
import type { Logger } from '../util/logger';
import { findDuplicates } from './duplicates';

export interface DuplicateDetectorDeps {
  images: Pick<ImageRepository, 'missingPhash' | 'setPhash' | 'duplicateCandidates' | 'setDuplicates'>;
  processor: Pick<ImageProcessor, 'perceptualHash'>;
  thumbnails: Pick<ThumbnailStore, 'read'>;
  logger: Logger;
}

export interface DuplicateRefresh {
  hashed: number;
  changedLinks: number;
}

const BACKFILL_BATCH = 200;

/** Keeps the near-duplicate links up to date after scans. */
export class DuplicateDetector {
  constructor(private readonly deps: DuplicateDetectorDeps) {}

  async refresh(): Promise<DuplicateRefresh> {
    const hashed = await this.backfillHashes();
    const changedLinks = this.deps.images.setDuplicates(
      findDuplicates(this.deps.images.duplicateCandidates()),
    );
    if (hashed || changedLinks) this.deps.logger.info({ hashed, changedLinks }, 'duplicates updated');
    return { hashed, changedLinks };
  }

  /** Images from before perceptual hashing get one from their small thumbnail (no original read). */
  private async backfillHashes(): Promise<number> {
    let hashed = 0;
    for (let batch = this.deps.images.missingPhash(BACKFILL_BATCH); batch.length;) {
      for (const { id, hash } of batch) {
        const phash = await this.hashOf(hash);
        // An empty hash marks an unreadable thumbnail, so it isn't retried on every scan.
        this.deps.images.setPhash(id, phash ?? '');
        if (phash) hashed++;
      }
      batch = batch.length < BACKFILL_BATCH ? [] : this.deps.images.missingPhash(BACKFILL_BATCH);
    }
    return hashed;
  }

  private async hashOf(hash: string): Promise<string | null> {
    try {
      return await this.deps.processor.perceptualHash(await this.deps.thumbnails.read(hash, 'sm'));
    } catch (error) {
      this.deps.logger.warn({ hash, err: error }, 'cannot hash thumbnail');
      return null;
    }
  }
}
