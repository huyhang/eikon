import type { FastifyInstance } from 'fastify';
import { THUMB_SIZES, type ThumbSize } from '@eikon/shared';
import type { AppDeps } from '../deps';
import { notFound, parseId } from '../params';

/** Media is addressed by immutable image id, so browsers may cache it forever. */
export const IMMUTABLE = 'private, max-age=31536000, immutable';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function mimeTypeFor(path: string): string {
  return MIME_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export function registerMediaRoutes(app: FastifyInstance, { repos, thumbnails, library }: AppDeps): void {
  app.get<{ Params: { id: string; size: string } }>('/media/thumb/:id/:size', async (request, reply) => {
    const id = parseId(request.params.id);
    const size = THUMB_SIZES.find((s) => s === request.params.size) as ThumbSize | undefined;
    const hash = id === undefined ? undefined : repos.images.hashOf(id);
    if (!hash || !size) return notFound(reply);
    const thumbnail = await thumbnails.read(hash, size).catch(() => undefined);
    if (!thumbnail) return notFound(reply);
    return reply.header('cache-control', IMMUTABLE).type('image/webp').send(thumbnail);
  });

  app.get<{ Params: { id: string } }>('/media/original/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const path = id === undefined ? undefined : repos.files.firstPathOf(id);
    if (!path) return notFound(reply);
    const stream = await library.open(path).catch(() => undefined);
    if (!stream) return notFound(reply);
    return reply.header('cache-control', IMMUTABLE).type(mimeTypeFor(path)).send(stream);
  });
}
