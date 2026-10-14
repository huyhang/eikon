import { base64ToBytes, normalize, vectorFromFloat16Bytes, type Embedding } from '@eikon/shared';
import type { EmbeddingRepository } from '../db/embeddingRepository';
import { VectorIndex, type ScoredId } from './vectorIndex';

export interface TextEmbedder {
  embedText(text: string): Promise<Embedding>;
}

/** No embedding model is known yet (gpubox hasn't reported one and nothing is stored). */
export class NoEmbeddingModelError extends Error {}

/**
 * "More like this" and describe-in-words search over image embeddings. Vectors are persisted by the
 * repository and mirrored in an in-memory index for the current model, built on first use.
 */
export class SimilarityService {
  private current: string | null;
  private index: VectorIndex | null = null;

  constructor(
    private readonly repo: EmbeddingRepository,
    private readonly embedder: TextEmbedder,
  ) {
    this.current = repo.mostUsedModel();
  }

  get model(): string | null {
    return this.current;
  }

  /** Called when gpubox reports its embedding model; switching models rebuilds the index lazily. */
  setModel(model: string | null): void {
    if (!model || model === this.current) return;
    this.current = model;
    this.index = null;
  }

  save(imageId: number, embedding: Embedding): void {
    const bytes = base64ToBytes(embedding.vector);
    const vector = normalize(vectorFromFloat16Bytes(bytes));
    this.repo.save(imageId, embedding.model, bytes);
    this.setModel(embedding.model);
    if (this.index && embedding.model === this.current) this.index.set(imageId, vector);
  }

  forget(imageIds: number[]): void {
    imageIds.forEach((id) => this.index?.delete(id));
  }

  /** Images most like `imageId` (excluding it), or null when that image has no embedding yet. */
  similarTo(imageId: number, limit: number, accept: (id: number) => boolean = () => true): ScoredId[] | null {
    const index = this.loadedIndex();
    const vector = index?.get(imageId);
    if (!index || !vector) return null;
    return index.nearest(vector, limit, (id) => id !== imageId && accept(id));
  }

  /** Images best matching a text description; needs gpubox to embed the text. */
  async describe(
    text: string,
    limit: number,
    accept: (id: number) => boolean = () => true,
  ): Promise<ScoredId[]> {
    if (!this.current) throw new NoEmbeddingModelError('no embedding model');
    const embedding = await this.embedder.embedText(text);
    this.setModel(embedding.model);
    const index = this.loadedIndex();
    return index
      ? index.nearest(normalize(vectorFromFloat16Bytes(base64ToBytes(embedding.vector))), limit, accept)
      : [];
  }

  private loadedIndex(): VectorIndex | null {
    if (this.index || !this.current) return this.index;
    const stored = this.repo.all(this.current);
    if (stored.length === 0) return null;
    const first = vectorFromFloat16Bytes(stored[0]!.vector);
    const index = new VectorIndex(first.length);
    for (const { imageId, vector } of stored) index.set(imageId, normalize(vectorFromFloat16Bytes(vector)));
    this.index = index;
    return index;
  }
}
