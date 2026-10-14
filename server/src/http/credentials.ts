import type { FastifyRequest } from 'fastify';
import type { Credentials } from '../auth/authService';
import { tailscaleIdentity, type TailscaleTrust } from '../auth/tailscaleIdentity';

export const SESSION_COOKIE = 'eikon_session';
const credentialsKey = Symbol('credentials');

type WithCredentials = FastifyRequest & { [credentialsKey]?: Credentials };

/** Reads the session cookie and (only from a trusted proxy) the tailnet identity of a request, once. */
export function resolveCredentials(request: FastifyRequest, trust: TailscaleTrust): Credentials {
  const holder = request as WithCredentials;
  holder[credentialsKey] ??= {
    token: request.cookies[SESSION_COOKIE],
    identity: tailscaleIdentity(request.headers, request.raw.socket.remoteAddress, trust),
  };
  return holder[credentialsKey];
}

/** Credentials resolved by the app's onRequest hook. */
export function credentialsOf(request: FastifyRequest): Credentials {
  return (
    (request as WithCredentials)[credentialsKey] ?? { token: request.cookies[SESSION_COOKIE], identity: null }
  );
}
