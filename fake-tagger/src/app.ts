import Fastify, { type FastifyInstance } from 'fastify';
import {
  MAX_EMBED_TEXT_LENGTH,
  type Embedding,
  type TaggerHealth,
  type TaggerResult,
  type TaggerTag,
} from '@eikon/shared';
import { FAKE_EMBED_MODEL, fakeImageEmbedding, fakeTextEmbedding } from './fakeEmbedding';
import { FAKE_MODEL, fakeTagResult, type Random } from './fakeTagging';

export interface FakeTaggerOptions {
  /** Simulated inference time per image. */
  latencyMs: number;
  /** Fraction (0..1) of requests answered with a 400, to exercise retries. */
  failureRate: number;
  token: string | undefined;
  random: Random;
  sleep: (ms: number) => Promise<void>;
  /** Extra analysis (e.g. dominant colour) mixed into the fake tags. */
  analyze: (bytes: Buffer) => Promise<TaggerTag[]>;
  maxBodyBytes: number;
  /** Whether to produce (fake) CLIP-style embeddings. */
  embeddings: boolean;
}

/**
 * Same protocol as the real gpubox tagger, plus /admin/offline and /admin/online
 * to simulate the GPU box going away.
 */
export function createFakeTaggerApp(options: FakeTaggerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: options.maxBodyBytes });
  let online = true;

  app.addContentTypeParser(/^image\//, { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.addHook('onRequest', async (request, reply) => {
    const protectedRoute = request.url.startsWith('/v1/');
    if (protectedRoute && options.token && request.headers.authorization !== `Bearer ${options.token}`) {
      return reply.code(401).send({ error: 'invalid token' });
    }
    if (!online && !request.url.startsWith('/admin/')) {
      return reply.code(503).send({ error: 'simulated outage' });
    }
  });

  app.get('/health', async (): Promise<TaggerHealth> => ({
    status: 'ok',
    model: FAKE_MODEL,
    device: 'fake-cpu',
    embedModel: options.embeddings ? FAKE_EMBED_MODEL : null,
  }));

  /** Fake inference: latency, occasional failures, then tags derived from the bytes. */
  const analyzeImage = async (body: unknown): Promise<TaggerResult | { error: string }> => {
    if (!Buffer.isBuffer(body) || body.length === 0) return { error: 'expected image bytes' };
    await options.sleep(options.latencyMs);
    if (options.random() < options.failureRate) return { error: 'simulated decode failure' };
    const extra = await options.analyze(body).catch(() => []);
    return fakeTagResult(body, extra);
  };

  app.post('/v1/tag', async (request, reply) => {
    const result = await analyzeImage(request.body);
    if ('error' in result) return reply.code(400).send(result);
    return { ...result, embedding: options.embeddings ? fakeImageEmbedding(result.tags) : null };
  });

  app.post('/v1/embed-image', async (request, reply) => {
    if (!options.embeddings) return reply.code(404).send({ error: 'embeddings are disabled' });
    const result = await analyzeImage(request.body);
    if ('error' in result) return reply.code(400).send(result);
    const embedding: Embedding = fakeImageEmbedding(result.tags);
    return embedding;
  });

  app.post<{ Body: { text?: unknown } }>('/v1/embed-text', async (request, reply) => {
    if (!options.embeddings) return reply.code(404).send({ error: 'embeddings are disabled' });
    const text = request.body?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_EMBED_TEXT_LENGTH)
      return reply.code(400).send({ error: `text must be 1–${MAX_EMBED_TEXT_LENGTH} characters` });
    const embedding: Embedding = fakeTextEmbedding(text);
    return embedding;
  });

  app.post('/admin/offline', async () => {
    online = false;
    return { online };
  });

  app.post('/admin/online', async () => {
    online = true;
    return { online };
  });

  return app;
}
