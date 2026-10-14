import { existsSync } from 'node:fs';
import path from 'node:path';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppDeps } from './deps';
import { registerAuthRoutes, SESSION_COOKIE } from './routes/auth';
import { registerBrowseRoutes } from './routes/browse';
import { registerCurateRoutes } from './routes/curate';
import { registerMediaRoutes } from './routes/media';
import { registerSystemRoutes } from './routes/system';
import { registerTagRoutes } from './routes/tags';

/** API and media need a session; the app shell and /api/auth do not. */
export function requiresSession(url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  return (
    (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) || pathname.startsWith('/media/')
  );
}

export async function buildApp(deps: AppDeps, options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: true, ...options });
  await app.register(cookie);
  await app.register(compress, { threshold: 1024 });

  app.addHook('onRequest', async (request, reply) => {
    if (requiresSession(request.url) && !deps.auth.isAuthenticated(request.cookies[SESSION_COOKIE])) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  registerAuthRoutes(app, deps);
  registerBrowseRoutes(app, deps);
  registerCurateRoutes(app, deps);
  registerTagRoutes(app, deps);
  registerSystemRoutes(app, deps);
  registerMediaRoutes(app, deps);
  await registerWebApp(app, deps.webDistDir);
  return app;
}

/** Serves the built web app with SPA fallback; hashed assets are cached forever, index.html never. */
async function registerWebApp(app: FastifyInstance, webDistDir: string | undefined): Promise<void> {
  const hasWeb = webDistDir !== undefined && existsSync(path.join(webDistDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      wildcard: false,
      setHeaders: (reply, filePath) => {
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  app.setNotFoundHandler((request, reply) => {
    const isPage =
      request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/media/');
    if (hasWeb && isPage) return reply.header('cache-control', 'no-cache').sendFile('index.html');
    return reply.code(404).send({ error: 'not found' });
  });
}
