import type { Embedding } from '@eikon/shared';
import { mapWithConcurrency } from '../util/concurrency';
import type { Logger } from '../util/logger';
import { TaggerUnavailableError } from './taggerClient';

export interface EmbeddingBackfillDeps {
  /** Tagged images still lacking an embedding from `model`. */
  missing(model: string, limit: number): number[];
  embed(imageId: number): Promise<Embedding | null>;
  save(imageId: number, embedding: Embedding): void;
  logger: Logger;
}

export type BackfillResult = 'worked' | 'idle' | 'offline';

/**
 * When there is nothing left to tag, gives already-tagged images an embedding (e.g. after the
 * embedding model is added or changed). Images that fail are skipped until the next restart, so one
 * bad image can't stall the queue.
 */
export class EmbeddingBackfill {
  private readonly skipped = new Set<number>();

  constructor(private readonly deps: EmbeddingBackfillDeps) {}

  get skippedCount(): number {
    return this.skipped.size;
  }

  async runBatch(model: string, batchSize: number, concurrency: number): Promise<BackfillResult> {
    const batch = this.deps
      .missing(model, batchSize + this.skipped.size)
      .filter((id) => !this.skipped.has(id))
      .slice(0, batchSize);
    if (batch.length === 0) return 'idle';
    const results = await mapWithConcurrency(batch, concurrency, (id) => this.embedOne(id));
    return results.includes('offline') ? 'offline' : 'worked';
  }

  private async embedOne(imageId: number): Promise<'done' | 'offline'> {
    try {
      const embedding = await this.deps.embed(imageId);
      if (embedding) this.deps.save(imageId, embedding);
      return 'done';
    } catch (error) {
      if (error instanceof TaggerUnavailableError) return 'offline';
      this.skipped.add(imageId);
      this.deps.logger.warn(
        { imageId, err: error instanceof Error ? error.message : error },
        'embedding failed',
      );
      return 'done';
    }
  }
}
