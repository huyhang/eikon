import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  isTagCategory,
  normalizeTagName,
  type AddAliasRequest,
  type AddImplicationRequest,
  type TagInfo,
  type TagInfoListResponse,
  type UpdateTagRequest,
} from '@eikon/shared';
import { TagAdminError } from '../../db/tagAdminRepository';
import type { AppDeps } from '../deps';
import { badRequest, notFound, parseLimit, type Query } from '../params';

type Params = { name: string };

/** Runs a tag edit, turning TagAdminErrors into their HTTP status. */
async function edit(reply: FastifyReply, work: () => TagInfo | undefined): Promise<unknown> {
  try {
    return work() ?? notFound(reply);
  } catch (error) {
    if (error instanceof TagAdminError) return reply.code(error.status).send({ error: error.message });
    throw error;
  }
}

export function registerTagAdminRoutes(app: FastifyInstance, { repos }: AppDeps): void {
  const { tagAdmin } = repos;
  const info = (name: string) => tagAdmin.info(name, repos.settings.get());

  app.get<{ Querystring: Query }>('/api/tags/manage', async (request): Promise<TagInfoListResponse> => {
    const query = typeof request.query.q === 'string' ? normalizeTagName(request.query.q) : '';
    const offset = Number(request.query.offset);
    return tagAdmin.list(
      {
        query,
        limit: parseLimit(request.query.limit, 50, 200),
        offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
      },
      repos.settings.get(),
    );
  });

  app.get<{ Params: Params }>(
    '/api/tags/manage/:name',
    async (request, reply) => info(request.params.name) ?? notFound(reply),
  );

  app.patch<{ Params: Params; Body: Partial<UpdateTagRequest> }>(
    '/api/tags/manage/:name',
    async (request, reply) => {
      const { name, category } = request.body ?? {};
      const newName = name === undefined ? undefined : normalizeTagName(String(name));
      if (newName === '') return badRequest(reply, 'name cannot be empty');
      if (category !== undefined && !isTagCategory(category)) return badRequest(reply, 'unknown category');
      return edit(reply, () => {
        let current = request.params.name;
        if (category) tagAdmin.setCategory(current, category);
        if (newName) current = tagAdmin.rename(current, newName);
        return info(current);
      });
    },
  );

  app.post<{ Params: Params; Body: Partial<AddAliasRequest> }>(
    '/api/tags/manage/:name/aliases',
    async (request, reply) => {
      const alias = normalizeTagName(String(request.body?.alias ?? ''));
      if (!alias) return badRequest(reply, 'alias is required');
      return edit(reply, () => {
        tagAdmin.addAlias(request.params.name, alias);
        return info(request.params.name);
      });
    },
  );

  app.delete<{ Params: Params & { alias: string } }>(
    '/api/tags/manage/:name/aliases/:alias',
    async (request, reply) =>
      edit(reply, () => {
        tagAdmin.removeAlias(request.params.name, request.params.alias);
        return info(request.params.name);
      }),
  );

  app.post<{ Params: Params; Body: Partial<AddImplicationRequest> }>(
    '/api/tags/manage/:name/implications',
    async (request, reply) => {
      const implies = normalizeTagName(String(request.body?.implies ?? ''));
      if (!implies) return badRequest(reply, 'implies is required');
      return edit(reply, () => {
        tagAdmin.addImplication(request.params.name, implies);
        return info(request.params.name);
      });
    },
  );

  app.delete<{ Params: Params & { implied: string } }>(
    '/api/tags/manage/:name/implications/:implied',
    async (request, reply) =>
      edit(reply, () => {
        tagAdmin.removeImplication(request.params.name, request.params.implied);
        return info(request.params.name);
      }),
  );
}
