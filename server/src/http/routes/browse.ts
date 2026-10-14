import type { FastifyInstance } from 'fastify';
import {
  encodeTile,
  parseImageQuery,
  type GroupDetailResponse,
  type GroupKind,
  type GroupListResponse,
  type GroupSort,
  type HomeResponse,
  type ImageDetail,
  type ImageListResponse,
} from '@eikon/shared';
import type { Repositories } from '../../db/repositories';
import { toTile } from '../../db/rows';
import type { AppDeps } from '../deps';
import { notFound, parseId, type Query } from '../params';

const GROUP_KINDS: GroupKind[] = ['illustrator', 'collection'];
const GROUP_SORTS: GroupSort[] = ['name', 'count', 'recent'];

function pick<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return allowed.find((a) => a === value);
}

export function imageDetail(repos: Repositories, id: number): ImageDetail | undefined {
  const image = repos.images.get(id);
  if (!image) return undefined;
  return {
    ...toTile(image),
    format: image.format,
    animated: image.animated === 1,
    sizeBytes: image.size_bytes,
    addedAt: image.added_at,
    files: repos.files.refsOf(id),
    tags: repos.tags.forImage(id, repos.settings.get()),
    favorite: repos.favorites.has(id),
    tagStatus: image.tag_status,
  };
}

export function registerBrowseRoutes(app: FastifyInstance, { repos }: AppDeps): void {
  app.get<{ Querystring: Query }>('/api/home', async (request): Promise<HomeResponse> => {
    const { maxRating } = parseImageQuery(request.query);
    const thresholds = repos.settings.get();
    return {
      recent: repos.images.list({ sort: 'newest', limit: 24, maxRating }, thresholds).tiles,
      illustrators: repos.groups.list({ kind: 'illustrator', sort: 'recent', limit: 12, maxRating }),
      collections: repos.groups.list({ kind: 'collection', sort: 'recent', limit: 12, maxRating }),
      rediscover: repos.images.list(
        { sort: 'random', seed: Math.floor(Math.random() * 1e9), limit: 12, maxRating },
        thresholds,
      ).tiles,
      totals: {
        images: repos.images.count(maxRating),
        illustrators: repos.groups.count('illustrator', maxRating),
        collections: repos.groups.count('collection', maxRating),
      },
    };
  });

  app.get<{ Querystring: Query }>('/api/groups', async (request): Promise<GroupListResponse> => {
    const { maxRating } = parseImageQuery(request.query);
    return {
      groups: repos.groups.list({
        kind: pick(request.query.kind, GROUP_KINDS),
        sort: pick(request.query.sort, GROUP_SORTS) ?? 'name',
        maxRating,
      }),
    };
  });

  app.get<{ Params: { id: string }; Querystring: Query }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const { maxRating } = parseImageQuery(request.query);
    const group = id === undefined ? undefined : repos.groups.get(id, maxRating);
    if (!group) return notFound(reply);
    const body: GroupDetailResponse = {
      group,
      topTags: repos.tags.topInGroup(group.id, 12, repos.settings.get(), maxRating),
    };
    return body;
  });

  app.get<{ Querystring: Query }>('/api/images', async (request): Promise<ImageListResponse> => {
    const { total, tiles } = repos.images.list(parseImageQuery(request.query), repos.settings.get());
    return { total, tiles: tiles.map(encodeTile) };
  });

  app.get<{ Params: { id: string } }>('/api/images/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const detail = id === undefined ? undefined : imageDetail(repos, id);
    return detail ?? notFound(reply);
  });
}
