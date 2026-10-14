import { createFakeTaggerApp } from './app';
import { colorTagsFor } from './colorTags';

const env = process.env;
const port = Number(env.FAKE_TAGGER_PORT ?? 7860);
const host = env.FAKE_TAGGER_HOST ?? '127.0.0.1';

const app = createFakeTaggerApp({
  latencyMs: Number(env.FAKE_TAGGER_LATENCY_MS ?? 250),
  failureRate: Number(env.FAKE_TAGGER_FAILURE_RATE ?? 0.02),
  token: env.FAKE_TAGGER_TOKEN || undefined,
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  analyze: colorTagsFor,
  maxBodyBytes: 50 * 1024 * 1024,
  embeddings: env.FAKE_TAGGER_EMBEDDINGS !== 'off',
});

await app.listen({ host, port });
console.log(
  `fake tagger listening on http://${host}:${port}  (simulate an outage: curl -X POST http://${host}:${port}/admin/offline)`,
);
