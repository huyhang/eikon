import type { FastifyInstance } from 'fastify';
import type { AuthStatus, LoginErrorResponse, LoginRequest, MosaicResponse } from '@eikon/shared';
import type { AppDeps } from '../deps';

export const SESSION_COOKIE = 'eikon_session';
/** Browsers cap cookie lifetimes around 400 days. */
const REMEMBER_SECONDS = 400 * 24 * 60 * 60;

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/api/auth/status', async (request): Promise<AuthStatus> =>
    deps.auth.status(request.cookies[SESSION_COOKIE]),
  );

  app.post<{ Body: Partial<LoginRequest> }>('/api/auth/login', async (request, reply) => {
    const outcome = deps.auth.login(String(request.body?.passcode ?? ''));
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
      ...(request.body?.remember ? { maxAge: REMEMBER_SECONDS } : {}),
    });
    return reply.code(204).send();
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/mosaic', async (): Promise<MosaicResponse> => ({
    placeholders: deps.repos.images.randomPlaceholders(48),
  }));
}
