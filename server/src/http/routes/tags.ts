import type { FastifyInstance } from 'fastify';
import {
  normalizeTagName,
  parseImageQuery,
  type CreateSavedSearchRequest,
  type SavedQuery,
  type SavedSearchListResponse,
  type TagListResponse,
} from '@eikon/shared';
import type { AppDeps } from '../deps';
import { badRequest, notFound, parseId, parseLimit, type Query } from '../params';

const tagNames = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((t): t is string => typeof t === 'string')
        .map(normalizeTagName)
        .filter(Boolean)
    : [];

/** Validates a saved query from the client; returns null if malformed. */
export function sanitizeSavedQuery(input: unknown): SavedQuery | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const query: SavedQuery = { tags: tagNames(raw.tags), exclude: tagNames(raw.exclude) };
  if (typeof raw.group === 'number' && Number.isInteger(raw.group) && raw.group > 0) query.group = raw.group;
  return query.tags.length || query.exclude.length || query.group ? query : null;
}

export function registerTagRoutes(app: FastifyInstance, { repos, clock }: AppDeps): void {
  app.get<{ Querystring: Query }>('/api/tags/suggest', async (request): Promise<TagListResponse> => {
    const q = normalizeTagName(String(request.query.q ?? ''));
    const { maxRating } = parseImageQuery(request.query);
    return {
      tags: repos.tags.suggest(q, parseLimit(request.query.limit, 10, 50), repos.settings.get(), maxRating),
    };
  });

  app.get<{ Querystring: Query }>('/api/tags/related', async (request): Promise<TagListResponse> => {
    const query = parseImageQuery(request.query);
    return { tags: repos.tags.related(query, parseLimit(request.query.limit, 15, 50), repos.settings.get()) };
  });

  app.get<{ Querystring: Query }>('/api/tags/top', async (request): Promise<TagListResponse> => {
    const { maxRating } = parseImageQuery(request.query);
    return {
      tags: repos.tags.top(parseLimit(request.query.limit, 60, 200), repos.settings.get(), maxRating),
    };
  });

  app.get('/api/saved-searches', async (): Promise<SavedSearchListResponse> => ({
    searches: repos.savedSearches.list(),
  }));

  app.post<{ Body: Partial<CreateSavedSearchRequest> }>('/api/saved-searches', async (request, reply) => {
    const name = String(request.body?.name ?? '').trim();
    const query = sanitizeSavedQuery(request.body?.query);
    if (!name || !query) return badRequest(reply, 'name and a non-empty query are required');
    return repos.savedSearches.create(name.slice(0, 100), query, clock.now());
  });

  app.delete<{ Params: { id: string } }>('/api/saved-searches/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === undefined || !repos.savedSearches.delete(id)) return notFound(reply);
    return reply.code(204).send();
  });
}
