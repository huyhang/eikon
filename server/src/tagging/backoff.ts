/** Exponential backoff: base · 2^(attempt-1), capped. attempt starts at 1. */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
