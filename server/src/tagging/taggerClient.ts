import type { TaggerHealth, TaggerResult } from '@eikon/shared';

/** The tagger can't be reached or refuses us as a whole — retry later, don't blame the image. */
export class TaggerUnavailableError extends Error {}

/** The tagger processed the request but rejected this particular image. */
export class TaggerRejectedError extends Error {}

export interface TaggerClient {
  health(): Promise<TaggerHealth>;
  tag(image: Buffer, contentType: string): Promise<TaggerResult>;
}

const UNAVAILABLE_STATUSES = new Set([401, 403, 404, 408, 429, 502, 503, 504]);

/** Maps an HTTP status to the error that tells the worker whether to count an attempt. */
export function errorForStatus(status: number, body: string): Error {
  const message = `tagger responded ${status}${body ? `: ${body.slice(0, 200)}` : ''}`;
  return UNAVAILABLE_STATUSES.has(status)
    ? new TaggerUnavailableError(message)
    : new TaggerRejectedError(message);
}

export type Fetch = typeof fetch;

export class HttpTaggerClient implements TaggerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  health(): Promise<TaggerHealth> {
    return this.request<TaggerHealth>('/health', { method: 'GET' });
  }

  tag(image: Buffer, contentType: string): Promise<TaggerResult> {
    return this.request<TaggerResult>('/v1/tag', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: new Uint8Array(image),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...this.authHeader() },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new TaggerUnavailableError(
        `tagger unreachable: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (!response.ok) throw errorForStatus(response.status, await response.text().catch(() => ''));
    return (await response.json()) as T;
  }

  private authHeader(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }
}
