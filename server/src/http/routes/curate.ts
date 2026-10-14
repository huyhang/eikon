import type { FastifyInstance } from 'fastify';
import { parseTagInput, type AddTagRequest } from '@eikon/shared';
import type { AppDeps } from '../deps';
import { badRequest, notFound, parseId } from '../params';
import { imageDetail } from './browse';

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
}
