import { Readable } from 'node:stream';
import { THUMB_SIZES, type ThumbSize } from '@eikon/shared';
import type { LibraryEntry, LibrarySource } from '../../src/library/librarySource';
import { classifyPath } from '../../src/library/pathClassifier';
import type { ImageProcessor, ProcessedImage } from '../../src/media/imageProcessor';
import type { ThumbnailStore } from '../../src/media/thumbnailStore';
import type { Clock } from '../../src/util/clock';

/** A library held in memory: path → { content, mtime }. */
export class MemoryLibrary implements LibrarySource {
  files = new Map<string, { content: string; mtimeMs: number }>();
  unavailable = false;
  reads: string[] = [];

  put(relPath: string, content: string, mtimeMs = 1): this {
    this.files.set(relPath, { content, mtimeMs });
    return this;
  }

  async list(): Promise<LibraryEntry[]> {
    if (this.unavailable) throw new Error('library unavailable');
    return [...this.files].flatMap(([relPath, f]) => {
      const classified = classifyPath(relPath);
      return classified ? [{ ...classified, relPath, sizeBytes: f.content.length, mtimeMs: f.mtimeMs }] : [];
    });
  }

  async read(relPath: string): Promise<Buffer> {
    this.reads.push(relPath);
    const file = this.files.get(relPath);
    if (!file) throw new Error(`missing ${relPath}`);
    return Buffer.from(file.content);
  }

  async open(relPath: string): Promise<Readable> {
    return Readable.from([await this.read(relPath)]);
  }
}

/** Treats content starting with "bad" as undecodable; otherwise reports a 4:3 image. */
export class FakeProcessor implements ImageProcessor {
  calls = 0;

  async process(bytes: Buffer): Promise<ProcessedImage> {
    this.calls += 1;
    return {
      width: 400,
      height: 300,
      format: 'png',
      animated: false,
      placeholder: 'AAAA',
      phash: fakePhash(bytes),
      thumbnails: await this.thumbnails(bytes),
    };
  }

  async thumbnails(bytes: Buffer): Promise<Record<ThumbSize, Buffer>> {
    if (bytes.toString().startsWith('bad')) throw new Error('corrupt');
    return fakeThumbnails(String(bytes));
  }

  async perceptualHash(bytes: Buffer): Promise<string> {
    return fakePhash(bytes);
  }
}

/** Thumbnails whose content is "<size>:<label>", e.g. "md:cat". */
export function fakeThumbnails(label: string): Record<ThumbSize, Buffer> {
  return Object.fromEntries(THUMB_SIZES.map((size) => [size, Buffer.from(`${size}:${label}`)])) as Record<
    ThumbSize,
    Buffer
  >;
}

/** Content like "dup:3" hashes to the same value as "dup:3:smaller", making near-duplicates easy to stage. */
export function fakePhash(bytes: Buffer): string {
  const key = bytes
    .toString()
    .replace(/^(sm|md|lg):/, '')
    .split(':')
    .slice(0, 2)
    .join(':');
  let h = 0n;
  for (const ch of key) h = (h * 131n + BigInt(ch.charCodeAt(0))) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}

export class MemoryThumbnails implements ThumbnailStore {
  stored = new Map<string, Buffer>();

  async write(hash: string, thumbnails: Record<ThumbSize, Buffer>): Promise<void> {
    for (const size of THUMB_SIZES) this.stored.set(`${hash}:${size}`, thumbnails[size]);
  }

  async read(hash: string, size: ThumbSize): Promise<Buffer> {
    const thumb = this.stored.get(`${hash}:${size}`);
    if (!thumb) throw new Error('no thumbnail');
    return thumb;
  }

  async delete(hash: string): Promise<void> {
    for (const size of THUMB_SIZES) this.stored.delete(`${hash}:${size}`);
  }
}

export class FakeClock implements Clock {
  constructor(public time = 1_000) {}
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

/** Content itself serves as the hash, keeping assertions readable. */
export const identityHasher = (bytes: Buffer) => `h-${bytes.toString()}`;
