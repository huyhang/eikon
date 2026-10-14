import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { THUMB_SIZES, type ThumbSize } from '@eikon/shared';

/** Content-addressed thumbnail storage keyed by image hash. */
export interface ThumbnailStore {
  write(hash: string, thumbnails: Record<ThumbSize, Buffer>): Promise<void>;
  read(hash: string, size: ThumbSize): Promise<Buffer>;
  delete(hash: string): Promise<void>;
}

/** Two-level fan-out ("ab/abcdef…-sm.webp") keeps directories small on large libraries. */
export function thumbnailPath(root: string, hash: string, size: ThumbSize): string {
  return path.join(root, hash.slice(0, 2), `${hash}-${size}.webp`);
}

export class FsThumbnailStore implements ThumbnailStore {
  constructor(private readonly root: string) {}

  async write(hash: string, thumbnails: Record<ThumbSize, Buffer>): Promise<void> {
    await mkdir(path.join(this.root, hash.slice(0, 2)), { recursive: true });
    await Promise.all(
      THUMB_SIZES.map((size) => writeFile(thumbnailPath(this.root, hash, size), thumbnails[size])),
    );
  }

  read(hash: string, size: ThumbSize): Promise<Buffer> {
    return readFile(thumbnailPath(this.root, hash, size));
  }

  async delete(hash: string): Promise<void> {
    await Promise.all(THUMB_SIZES.map((size) => rm(thumbnailPath(this.root, hash, size), { force: true })));
  }
}
