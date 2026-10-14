import type { FastifyInstance } from 'fastify';
import {
  isRating,
  normalizeTagName,
  parseImageQuery,
  parseTagInput,
  type AddTagRequest,
  type BulkEditRequest,
  type BulkEditResponse,
  type ReviewResponse,
  type SetRatingRequest,
} from '@eikon/shared';
import type { Repositories } from '../../db/repositories';
import type { AppDeps } from '../deps';
import { badRequest, notFound, parseId, parseLimit, type Query } from '../params';
import { imageDetail } from './browse';

export const MAX_BULK_IDS = 5000;

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');

/** Validates a bulk edit; returns an error message when it is malformed or does nothing. */
export function parseBulkEdit(body: unknown): BulkEditRequest | string {
  if (typeof body !== 'object' || body === null) return 'expected a JSON object';
  const raw = body as Record<string, unknown>;
  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BULK_IDS)
    return `ids must list 1–${MAX_BULK_IDS} images`;
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) return 'ids must be positive integers';
  if (raw.addTags !== undefined && !isStringList(raw.addTags)) return 'addTags must be a list of tags';
  if (raw.removeTags !== undefined && !isStringList(raw.removeTags))
    return 'removeTags must be a list of tags';
  if (raw.favorite !== undefined && typeof raw.favorite !== 'boolean')
    return 'favorite must be true or false';
  const edit: BulkEditRequest = { ids: [...new Set(ids as number[])] };
  if (raw.addTags) edit.addTags = (raw.addTags as string[]).filter((t) => t.trim());
  if (raw.removeTags) edit.removeTags = (raw.removeTags as string[]).map(normalizeTagName).filter(Boolean);
  if (raw.favorite !== undefined) edit.favorite = raw.favorite as boolean;
  const doesSomething = edit.addTags?.length || edit.removeTags?.length || edit.favorite !== undefined;
  return doesSomething ? edit : 'nothing to change';
}

function applyBulkEdit(repos: Repositories, edit: BulkEditRequest, now: number): number {
  const ids = repos.curation.existing(edit.ids);
  const additions = (edit.addTags ?? []).flatMap((t) => parseTagInput(t) ?? []);
  repos.db.transaction(() => {
    for (const id of ids) {
      additions.forEach((tag) => repos.tags.addManual(id, tag.name, tag.category));
      edit.removeTags?.forEach((name) => repos.tags.remove(id, name));
      if (edit.favorite === true) repos.favorites.add(id, now);
      if (edit.favorite === false) repos.favorites.remove(id);
    }
  });
  return ids.length;
}

export function registerCurateRoutes(app: FastifyInstance, { repos, clock }: AppDeps): void {
  const exists = (id: number | undefined): id is number =>
    id !== undefined && repos.images.get(id) !== undefined;

  app.put<{ Params: { id: string } }>('/api/images/:id/favorite', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!exists(id)) return notFound(reply);
    repos.favorites.add(id, clock.now());
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/images/:id/favorite', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!exists(id)) return notFound(reply);
    repos.favorites.remove(id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: Partial<AddTagRequest> }>(
    '/api/images/:id/tags',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!exists(id)) return notFound(reply);
      const parsed = parseTagInput(String(request.body?.tag ?? ''));
      if (!parsed) return badRequest(reply, 'tag is required');
      repos.tags.addManual(id, parsed.name, parsed.category);
      return imageDetail(repos, id);
    },
  );

  app.delete<{ Params: { id: string; name: string } }>(
    '/api/images/:id/tags/:name',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!exists(id)) return notFound(reply);
      repos.tags.remove(id, request.params.name);
      return imageDetail(repos, id);
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<SetRatingRequest> }>(
    '/api/images/:id/rating',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!exists(id)) return notFound(reply);
      const rating = request.body?.rating;
      if (rating !== null && !isRating(rating)) return badRequest(reply, 'rating must be a rating or null');
      repos.curation.setRatingOverride(id, rating);
      return imageDetail(repos, id);
    },
  );

  app.post<{ Params: { id: string } }>('/api/images/:id/reviewed', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!exists(id)) return notFound(reply);
    repos.curation.markReviewed(id, clock.now());
    return reply.code(204).send();
  });

  app.post('/api/images/bulk', async (request, reply) => {
    const edit = parseBulkEdit(request.body);
    if (typeof edit === 'string') return badRequest(reply, edit);
    const body: BulkEditResponse = { updated: applyBulkEdit(repos, edit, clock.now()) };
    return body;
  });

  app.get<{ Querystring: Query }>('/api/review', async (request): Promise<ReviewResponse> => {
    const { maxRating } = parseImageQuery(request.query);
    const { total, ids } = repos.curation.reviewQueue(parseLimit(request.query.limit, 20, 100), maxRating);
    return { total, images: ids.flatMap((id) => imageDetail(repos, id) ?? []) };
  });

  app.post('/api/review/mark-all', async () => ({ marked: repos.curation.markAllReviewed(clock.now()) }));
}
