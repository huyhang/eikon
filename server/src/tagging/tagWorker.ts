import type { Embedding, TaggingStatus } from '@eikon/shared';
import type { QueueCounts } from '../db/tagQueueRepository';
import type { ThumbnailStore } from '../media/thumbnailStore';
import { BackgroundLoop } from '../util/backgroundLoop';
import type { Clock, Sleep } from '../util/clock';
import { mapWithConcurrency } from '../util/concurrency';
import type { Logger } from '../util/logger';
import { backoffDelay } from './backoff';
import { EmbeddingBackfill } from './embeddingBackfill';
import { TaggerUnavailableError, type TaggerClient } from './taggerClient';

/** The queue operations the worker needs (implemented by TagQueueRepository). */
export interface TagQueue {
  nextBatch(now: number, limit: number): number[];
  markTagged(imageId: number, result: Awaited<ReturnType<TaggerClient['tag']>>, now: number): void;
  markFailed(
    imageId: number,
    error: string,
    retryAt: (attempt: number) => number,
    maxAttempts: number,
  ): unknown;
  counts(): QueueCounts;
}

export interface TagWorkerOptions {
  concurrency: number;
  batchSize: number;
  maxAttempts: number;
  /** Delay before retrying a failed image (doubles per attempt, capped at retryMaxMs). */
  retryBaseMs: number;
  retryMaxMs: number;
  /** Delay between health checks while the tagger is down (doubles, capped at offlineMaxMs). */
  offlineBaseMs: number;
  offlineMaxMs: number;
  /** How long to wait for new work when the queue is empty. */
  idleMs: number;
}

/** Where embeddings go and which images still need one (implemented by the similarity layer). */
export interface EmbeddingSink {
  /** The model whose stored vectors similar-image search uses, even while gpubox is off. */
  currentModel(): string | null;
  setModel(model: string | null): void;
  save(imageId: number, embedding: Embedding): void;
  missing(model: string, limit: number): number[];
  countMissing(model: string): number;
}

export interface TagWorkerDeps {
  queue: TagQueue;
  embeddings: EmbeddingSink;
  tagger: TaggerClient;
  /** Hash lookup so the worker can send the 2048px thumbnail instead of the original. */
  hashOf: (imageId: number) => string | undefined;
  thumbnails: ThumbnailStore;
  clock: Clock;
  sleep: Sleep;
  logger: Logger;
  options: TagWorkerOptions;
}

export type RunResult = 'worked' | 'idle' | 'offline';

/** Drains the tagging queue against the GPU tagger, surviving the tagger going away. */
export class TagWorker {
  private online = false;
  private model: string | null = null;
  private embedModel: string | null = null;
  private offlineStreak = 0;
  private readonly loop: BackgroundLoop;
  private readonly backfill: EmbeddingBackfill;

  constructor(private readonly deps: TagWorkerDeps) {
    this.loop = new BackgroundLoop(() => this.iterate(), deps.sleep);
    this.backfill = new EmbeddingBackfill({
      missing: (model, limit) => deps.embeddings.missing(model, limit),
      embed: async (id) => {
        const image = await this.largeThumbnail(id);
        return image ? deps.tagger.embedImage(image, 'image/webp') : null;
      },
      save: (id, embedding) => deps.embeddings.save(id, embedding),
      logger: deps.logger,
    });
  }

  status(): TaggingStatus {
    const embedModel = this.embedModel ?? this.deps.embeddings.currentModel();
    const pending = embedModel
      ? Math.max(0, this.deps.embeddings.countMissing(embedModel) - this.backfill.skippedCount)
      : 0;
    return {
      ...this.deps.queue.counts(),
      taggerOnline: this.online,
      taggerModel: this.model,
      embedModel,
      embeddingsPending: pending,
      describeAvailable: this.online && this.embedModel !== null,
    };
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  /** New work arrived (or the user asked for a retry): stop waiting, or skip the next wait. */
  wake(): void {
    this.loop.wake();
  }

  /** One iteration of the loop; exposed for tests. */
  async runOnce(): Promise<RunResult> {
    if (!(await this.checkHealth())) return 'offline';
    const { batchSize, concurrency } = this.deps.options;
    const batch = this.deps.queue.nextBatch(this.deps.clock.now(), batchSize);
    if (batch.length === 0) return this.backfillEmbeddings();
    const results = await mapWithConcurrency(batch, concurrency, (id) => this.tagOne(id));
    return results.includes('offline') ? 'offline' : 'worked';
  }

  private async backfillEmbeddings(): Promise<RunResult> {
    if (!this.embedModel) return 'idle';
    const { batchSize, concurrency } = this.deps.options;
    const result = await this.backfill.runBatch(this.embedModel, batchSize, concurrency);
    if (result === 'offline')
      this.markOffline(new TaggerUnavailableError('tagger went away while embedding'));
    return result;
  }

  /** How long to pause after a run result. */
  delayAfter(result: RunResult): number {
    const { offlineBaseMs, offlineMaxMs, idleMs } = this.deps.options;
    if (result === 'worked') return 0;
    if (result === 'idle') return idleMs;
    return backoffDelay(this.offlineStreak, offlineBaseMs, offlineMaxMs);
  }

  private async iterate(): Promise<number> {
    const result = await this.runOnce().catch((error) => {
      this.deps.logger.error({ err: error }, 'tag worker iteration failed');
      return 'offline' as const;
    });
    return this.delayAfter(result);
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const health = await this.deps.tagger.health();
      if (!this.online)
        this.deps.logger.info({ model: health.model, device: health.device }, 'tagger online');
      this.online = true;
      this.model = health.model;
      this.embedModel = health.embedModel ?? null;
      this.deps.embeddings.setModel(this.embedModel);
      this.offlineStreak = 0;
    } catch (error) {
      this.markOffline(error);
    }
    return this.online;
  }

  private async tagOne(imageId: number): Promise<'done' | 'failed' | 'offline'> {
    const { queue, tagger, clock, options } = this.deps;
    try {
      const image = await this.largeThumbnail(imageId);
      if (!image) return 'done'; // deleted by a scan meanwhile
      const result = await tagger.tag(image, 'image/webp');
      queue.markTagged(imageId, result, clock.now());
      if (result.embedding) this.deps.embeddings.save(imageId, result.embedding);
      return 'done';
    } catch (error) {
      if (error instanceof TaggerUnavailableError) {
        this.markOffline(error);
        return 'offline';
      }
      const message = error instanceof Error ? error.message : String(error);
      const retryAt = (attempt: number) =>
        clock.now() + backoffDelay(attempt, options.retryBaseMs, options.retryMaxMs);
      queue.markFailed(imageId, message, retryAt, options.maxAttempts);
      this.deps.logger.warn({ imageId, err: message }, 'tagging failed');
      return 'failed';
    }
  }

  /** The 2048px preview sent to gpubox, or null if the image has been deleted meanwhile. */
  private async largeThumbnail(imageId: number): Promise<Buffer | null> {
    const hash = this.deps.hashOf(imageId);
    return hash ? this.deps.thumbnails.read(hash, 'lg') : null;
  }

  private markOffline(error: unknown): void {
    if (this.online || this.offlineStreak === 0) {
      this.deps.logger.warn({ err: error instanceof Error ? error.message : error }, 'tagger unavailable');
    }
    this.online = false;
    this.offlineStreak += 1;
  }
}
