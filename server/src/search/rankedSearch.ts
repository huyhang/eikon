import type { ImageQuery, ImageTile } from '@eikon/shared';
import type { ImageRepository, ListOptions } from '../db/imageRepository';
import type { ScoredId } from '../similarity/vectorIndex';
import { NoEmbeddingModelError, type SimilarityService } from '../similarity/similarityService';
import { TaggerUnavailableError } from '../tagging/taggerClient';

export const RANKED_LIMIT = 300;
export const MAX_RANKED_LIMIT = 1000;

export interface RankedSearchDeps {
  images: Pick<ImageRepository, 'get' | 'idsMatching' | 'tilesByIds'>;
  similarity: Pick<SimilarityService, 'similarTo' | 'describe'>;
}

/** A ranked search that can't be answered, with the HTTP status that explains why. */
export class RankedSearchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The parts of a query that restrict which images may appear (no ordering, no ranking). */
export function filtersOf(query: ImageQuery): ImageQuery {
  const { group, tags, exclude, favorites, maxRating } = query;
  return Object.fromEntries(
    Object.entries({ group, tags, exclude, favorites, maxRating }).filter(([, v]) => v !== undefined),
  ) as ImageQuery;
}

/** Images ranked by similarity to `query.like` or by match to `query.text`, best first. */
export async function rankedImages(
  query: ImageQuery,
  options: ListOptions,
  deps: RankedSearchDeps,
): Promise<ImageTile[]> {
  const limit = Math.min(query.limit ?? RANKED_LIMIT, MAX_RANKED_LIMIT);
  const filters = filtersOf(query);
  const allowed = Object.keys(filters).length ? deps.images.idsMatching(filters, options) : null;
  const accept = allowed ? (id: number) => allowed.has(id) : () => true;
  const ranked =
    query.like !== undefined
      ? similar(query.like, limit, accept, deps)
      : await described(query.text ?? '', limit, accept, deps);
  return deps.images.tilesByIds(
    ranked.map((r) => r.id),
    options,
  );
}

function similar(
  id: number,
  limit: number,
  accept: (id: number) => boolean,
  deps: RankedSearchDeps,
): ScoredId[] {
  if (!deps.images.get(id)) throw new RankedSearchError(404, 'That image no longer exists.');
  const ranked = deps.similarity.similarTo(id, limit, accept);
  if (!ranked) throw new RankedSearchError(409, 'This image hasn’t been analyzed for similar images yet.');
  return ranked;
}

async function described(
  text: string,
  limit: number,
  accept: (id: number) => boolean,
  deps: RankedSearchDeps,
): Promise<ScoredId[]> {
  try {
    return await deps.similarity.describe(text, limit, accept);
  } catch (error) {
    if (error instanceof NoEmbeddingModelError || error instanceof TaggerUnavailableError) {
      throw new RankedSearchError(
        503,
        'Describe search needs gpubox with an embedding model, and it is offline or has embeddings turned off.',
      );
    }
    throw error;
  }
}
