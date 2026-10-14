import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { classifyPath, isIgnoredSegment, type ClassifiedPath } from './pathClassifier';

export interface LibraryEntry extends ClassifiedPath {
  /** Relative to the library root, always with forward slashes. */
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
}

/** Read access to the illustration library. */
export interface LibrarySource {
  /** Every supported image; throws LibraryUnavailableError if the library looks unmounted. */
  list(): Promise<LibraryEntry[]>;
  read(relPath: string): Promise<Buffer>;
  /** Resolves once the file is open, rejecting if it cannot be read. */
  open(relPath: string): Promise<Readable>;
}

export class LibraryUnavailableError extends Error {}

export class FsLibrarySource implements LibrarySource {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async list(): Promise<LibraryEntry[]> {
    const tops = await this.topLevelFolders();
    if (tops.length === 0) {
      throw new LibraryUnavailableError(`No Illustrators/ or Collections/ folder found in ${this.root}`);
    }
    const entries: LibraryEntry[] = [];
    for (const top of tops) await this.walk(top, entries);
    return entries;
  }

  read(relPath: string): Promise<Buffer> {
    return readFile(this.resolve(relPath));
  }

  open(relPath: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(this.resolve(relPath));
      stream.once('open', () => resolve(stream));
      stream.once('error', reject);
    });
  }

  private async topLevelFolders(): Promise<string[]> {
    const names = await readdir(this.root).catch(() => [] as string[]);
    return names.filter((n) => ['illustrators', 'collections'].includes(n.toLowerCase()));
  }

  private async walk(relDir: string, into: LibraryEntry[]): Promise<void> {
    const dirents = await readdir(this.resolve(relDir), { withFileTypes: true });
    for (const dirent of dirents) {
      if (isIgnoredSegment(dirent.name)) continue;
      const relPath = `${relDir}/${dirent.name}`;
      if (dirent.isDirectory()) {
        await this.walk(relPath, into);
      } else if (dirent.isFile()) {
        const classified = classifyPath(relPath);
        if (!classified) continue;
        const info = await stat(this.resolve(relPath));
        into.push({ ...classified, relPath, sizeBytes: info.size, mtimeMs: Math.floor(info.mtimeMs) });
      }
    }
  }

  /** Resolves inside the root only, so a crafted path can never escape the library. */
  private resolve(relPath: string): string {
    const full = path.resolve(this.root, relPath);
    if (
      full !== this.root &&
      !full.startsWith(this.root.endsWith(path.sep) ? this.root : this.root + path.sep)
    ) {
      throw new Error(`Path escapes library: ${relPath}`);
    }
    return full;
  }
}
