import type { Rating } from './rating';
import type { TagCategory } from './tags';

/**
 * Wire protocol between Eikon and a tagger service (real or fake).
 *
 *   GET  /health  -> TaggerHealth
 *   POST /v1/tag  -> TaggerResult   (body: raw image bytes, Content-Type: image/*)
 *
 * When the tagger is configured with a token, requests must carry
 * `Authorization: Bearer <token>`.
 */
export interface TaggerHealth {
  status: 'ok';
  model: string;
  device: string;
}

export interface TaggerTag {
  name: string;
  category: TagCategory;
  confidence: number;
}

export interface TaggerResult {
  model: string;
  rating: Record<Rating, number>;
  tags: TaggerTag[];
}
