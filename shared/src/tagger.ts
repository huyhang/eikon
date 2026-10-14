import type { Rating } from './rating';
import type { TagCategory } from './tags';

/**
 * Wire protocol between Eikon and a tagger service (real or fake).
 *
 *   GET  /health          -> TaggerHealth
 *   POST /v1/tag          -> TaggerResult   (body: raw image bytes, Content-Type: image/*)
 *   POST /v1/embed-image  -> Embedding      (body: raw image bytes; 404 when embeddings are off)
 *   POST /v1/embed-text   -> Embedding      (body: TextEmbeddingRequest JSON; 404 when embeddings are off)
 *
 * When the tagger is configured with a token, requests must carry
 * `Authorization: Bearer <token>`.
 */
export interface TaggerHealth {
  status: 'ok';
  model: string;
  device: string;
  /** The image/text embedding model (e.g. CLIP), or null when the tagger computes no embeddings. */
  embedModel?: string | null;
}

export interface TaggerTag {
  name: string;
  category: TagCategory;
  confidence: number;
}

/** An L2-normalised embedding vector. */
export interface Embedding {
  model: string;
  /** Base64 of the vector as little-endian float16 values. */
  vector: string;
}

export interface TaggerResult {
  model: string;
  rating: Record<Rating, number>;
  tags: TaggerTag[];
  /** Present when the tagger has an embedding model. */
  embedding?: Embedding | null;
}

export interface TextEmbeddingRequest {
  text: string;
}

/** Longest text accepted by /v1/embed-text. */
export const MAX_EMBED_TEXT_LENGTH = 500;
