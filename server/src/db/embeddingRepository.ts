import type { Database } from './database';

export interface StoredEmbedding {
  imageId: number;
  /** Little-endian float16 values. */
  vector: Uint8Array;
}

/** Persists one embedding per image (for the model that produced it). */
export class EmbeddingRepository {
  constructor(private readonly db: Database) {}

  save(imageId: number, model: string, vector: Uint8Array): void {
    this.db.run(
      `INSERT INTO image_embeddings (image_id, model, vector) VALUES (?, ?, ?)
       ON CONFLICT (image_id) DO UPDATE SET model = excluded.model, vector = excluded.vector`,
      imageId,
      model,
      vector,
    );
  }

  all(model: string): StoredEmbedding[] {
    return this.db
      .all<{ image_id: number; vector: Uint8Array }>(
        'SELECT image_id, vector FROM image_embeddings WHERE model = ?',
        model,
      )
      .map((r) => ({ imageId: r.image_id, vector: r.vector }));
  }

  /** The model most images were embedded with, so similarity keeps working while gpubox is off. */
  mostUsedModel(): string | null {
    return (
      this.db.get<{ model: string }>(
        'SELECT model FROM image_embeddings GROUP BY model ORDER BY count(*) DESC, model LIMIT 1',
      )?.model ?? null
    );
  }

  /** Tagged images that still need an embedding from `model`, newest first. */
  missing(model: string, limit: number): number[] {
    return this.db
      .all<{ id: number }>(
        `SELECT i.id FROM images i WHERE i.tag_status = 'done' AND NOT EXISTS (
           SELECT 1 FROM image_embeddings e WHERE e.image_id = i.id AND e.model = ?)
         ORDER BY i.added_at DESC, i.id DESC LIMIT ?`,
        model,
        limit,
      )
      .map((r) => r.id);
  }

  countMissing(model: string): number {
    return (
      this.db.get<{ n: number }>(
        `SELECT count(*) AS n FROM images i WHERE i.tag_status = 'done' AND NOT EXISTS (
           SELECT 1 FROM image_embeddings e WHERE e.image_id = i.id AND e.model = ?)`,
        model,
      )?.n ?? 0
    );
  }
}
