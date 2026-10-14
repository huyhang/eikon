import Fastify, { type FastifyInstance } from 'fastify';
import type { TaggerHealth, TaggerResult, TaggerTag } from '@eikon/shared';
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
  }));

  app.post('/v1/tag', async (request, reply) => {
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0)
      return reply.code(400).send({ error: 'expected image bytes' });
    await options.sleep(options.latencyMs);
    if (options.random() < options.failureRate)
      return reply.code(400).send({ error: 'simulated decode failure' });
    const extra = await options.analyze(body).catch(() => []);
    const result: TaggerResult = fakeTagResult(body, extra);
    return result;
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
