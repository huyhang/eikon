import type { ScanStatus } from '@eikon/shared';
import type { Repositories } from '../db/repositories';
import type { ImageProcessor } from '../media/imageProcessor';
import type { ThumbnailStore } from '../media/thumbnailStore';
import type { Clock } from '../util/clock';
import { mapWithConcurrency } from '../util/concurrency';
import type { Logger } from '../util/logger';
import type { Hasher } from './hasher';
import type { LibraryEntry, LibrarySource } from './librarySource';
import { fileSignature, planScan } from './scanPlan';

export interface ScannerDeps {
  library: LibrarySource;
  processor: ImageProcessor;
  thumbnails: ThumbnailStore;
  hasher: Hasher;
  repos: Pick<Repositories, 'images' | 'files' | 'groups' | 'tags'>;
  clock: Clock;
  logger: Logger;
  concurrency: number;
  /** Called after a scan that discovered at least one new image. */
  onImagesAdded?: () => void;
}

export interface ScanSummary {
  added: number;
  unchanged: number;
  failed: number;
  removedFiles: number;
  removedImages: number;
}

type IngestOutcome = 'added' | 'linked' | 'failed';

/** Reconciles the library folder with the database: new files in, vanished files out. */
export class Scanner {
  private current: Promise<ScanSummary> | null = null;
  private lastScanId = 0;
  /** Files that failed to decode, by signature, so they are not re-read every scan. */
  private readonly broken = new Map<string, string>();
  private state: ScanStatus = { phase: 'idle', processed: 0, total: 0, lastScanAt: null, lastError: null };

  constructor(private readonly deps: ScannerDeps) {}

  status(): ScanStatus {
    return { ...this.state };
  }

  /** Starts a scan, or joins the one already running. */
  scan(): Promise<ScanSummary> {
    this.current ??= this.run().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async run(): Promise<ScanSummary> {
    const scanId = this.nextScanId();
    try {
      this.update({ phase: 'walking', processed: 0, total: 0 });
      const entries = await this.deps.library.list();
      const plan = planScan(entries, this.deps.repos.files.all());
      this.deps.repos.files.markSeen(plan.unchanged, scanId);
      const todo = plan.changed.filter((e) => this.broken.get(e.relPath) !== fileSignature(e));
      this.update({ phase: 'processing', total: todo.length });
      const outcomes = await mapWithConcurrency(todo, this.deps.concurrency, (entry) =>
        this.ingestCounted(entry, scanId),
      );
      this.update({ phase: 'cleaning' });
      const summary = {
        ...(await this.cleanUp(scanId)),
        ...tally(outcomes),
        unchanged: plan.unchanged.length,
      };
      this.update({ phase: 'idle', lastScanAt: this.deps.clock.now(), lastError: null });
      this.deps.logger.info(summary, 'scan finished');
      if (summary.added > 0) this.deps.onImagesAdded?.();
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update({ phase: 'idle', lastError: message });
      this.deps.logger.error({ err: error }, 'scan failed');
      throw error;
    }
  }

  private async ingestCounted(entry: LibraryEntry, scanId: number): Promise<IngestOutcome> {
    const outcome = await this.ingest(entry, scanId);
    this.update({ processed: this.state.processed + 1 });
    return outcome;
  }

  private async ingest(entry: LibraryEntry, scanId: number): Promise<IngestOutcome> {
    try {
      const bytes = await this.deps.library.read(entry.relPath);
      const hash = this.deps.hasher(bytes);
      const existing = this.deps.repos.images.findIdByHash(hash);
      const { id: imageId, created } =
        existing !== undefined
          ? { id: existing, created: false }
          : await this.createImage(hash, bytes, entry);
      if (!created) this.deps.repos.images.touchAddedAt(imageId, entry.mtimeMs);
      this.deps.repos.files.upsert({
        path: entry.relPath,
        imageId,
        groupId: this.deps.repos.groups.upsert(entry.kind, entry.groupName),
        sizeBytes: entry.sizeBytes,
        mtimeMs: entry.mtimeMs,
        scanId,
      });
      this.broken.delete(entry.relPath);
      return created ? 'added' : 'linked';
    } catch (error) {
      this.broken.set(entry.relPath, fileSignature(entry));
      this.deps.logger.warn({ path: entry.relPath, err: error }, 'skipping unreadable file');
      return 'failed';
    }
  }

  private async createImage(
    hash: string,
    bytes: Buffer,
    entry: LibraryEntry,
  ): Promise<{ id: number; created: boolean }> {
    const processed = await this.deps.processor.process(bytes);
    await this.deps.thumbnails.write(hash, processed.thumbnails);
    // Another lane may have ingested an identical file while we were processing.
    const raced = this.deps.repos.images.findIdByHash(hash);
    if (raced !== undefined) return { id: raced, created: false };
    return {
      created: true,
      id: this.deps.repos.images.insert({
        hash,
        width: processed.width,
        height: processed.height,
        format: processed.format,
        animated: processed.animated,
        sizeBytes: bytes.length,
        placeholder: processed.placeholder,
        addedAt: entry.mtimeMs,
      }),
    };
  }

  private async cleanUp(scanId: number): Promise<Pick<ScanSummary, 'removedFiles' | 'removedImages'>> {
    const { files, images, groups, tags } = this.deps.repos;
    const removedFiles = files.deleteNotSeen(scanId);
    const orphanHashes = images.deleteOrphans();
    await Promise.all(orphanHashes.map((hash) => this.deps.thumbnails.delete(hash)));
    groups.deleteEmpty();
    tags.deleteUnused();
    return { removedFiles, removedImages: orphanHashes.length };
  }

  private nextScanId(): number {
    this.lastScanId = Math.max(this.deps.clock.now(), this.lastScanId + 1);
    return this.lastScanId;
  }

  private update(patch: Partial<ScanStatus>): void {
    this.state = { ...this.state, ...patch };
  }
}

function tally(outcomes: IngestOutcome[]): Pick<ScanSummary, 'added' | 'failed'> {
  return {
    added: outcomes.filter((o) => o === 'added').length,
    failed: outcomes.filter((o) => o === 'failed').length,
  };
}
