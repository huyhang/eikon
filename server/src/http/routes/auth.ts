import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthStatus, LoginErrorResponse, LoginRequest, MosaicResponse } from '@eikon/shared';
import type { AppDeps } from '../deps';
import { credentialsOf, SESSION_COOKIE } from '../credentials';

export { SESSION_COOKIE };

function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/api/auth/status', async (request): Promise<AuthStatus> =>
    deps.auth.status(credentialsOf(request)),
  );

  app.post<{ Body: Partial<LoginRequest> }>('/api/auth/login', async (request, reply) => {
    const remember = Boolean(request.body?.remember);
    const outcome = deps.auth.login(String(request.body?.passcode ?? ''), remember);
    if (!outcome.ok) {
      const locked = outcome.retryAfterSeconds > 0;
      const body: LoginErrorResponse = locked
        ? { error: 'Too many attempts', retryAfterSeconds: outcome.retryAfterSeconds }
        : { error: 'Wrong passcode' };
      return reply.code(locked ? 429 : 401).send(body);
    }
    reply.setCookie(SESSION_COOKIE, outcome.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.cookieSecure,
      ...(remember ? { maxAge: Math.floor(outcome.ttlMs / 1000) } : {}),
    });
    return reply.code(204).send();
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSession(reply);
    return reply.code(204).send();
  });

  app.post('/api/auth/sign-out-everywhere', async (request, reply) => {
    if (!deps.auth.isAuthenticated(credentialsOf(request)))
      return reply.code(401).send({ error: 'unauthorized' });
    deps.auth.signOutEverywhere();
    clearSession(reply);
    return reply.code(204).send();
  });

  app.get('/api/auth/mosaic', async (): Promise<MosaicResponse> => ({
    placeholders: deps.repos.images.randomPlaceholders(48),
  }));
}
