import type { FastifyReply } from 'fastify';

/** Parses a positive integer route/query value, or undefined. */
export function parseId(value: unknown): number | undefined {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Parses an optional "limit" query value, clamped to [1, max]. */
export function parseLimit(value: unknown, fallback: number, max: number): number {
  const n = parseId(value);
  return n === undefined ? fallback : Math.min(n, max);
}

export function notFound(reply: FastifyReply, what = 'not found') {
  return reply.code(404).send({ error: what });
}

export function badRequest(reply: FastifyReply, error: string) {
  return reply.code(400).send({ error });
}

export type Query = Record<string, string | string[] | undefined>;
