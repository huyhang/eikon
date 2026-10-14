import { describe, expect, it, vi } from 'vitest';
import {
  errorForStatus,
  joinUrl,
  HttpTaggerClient,
  TaggerRejectedError,
  TaggerUnavailableError,
} from '../src/tagging/taggerClient';

describe('errorForStatus', () => {
  it.each([
    [400, TaggerRejectedError],
    [413, TaggerRejectedError],
    [500, TaggerRejectedError],
    [401, TaggerUnavailableError],
    [404, TaggerUnavailableError],
    [429, TaggerUnavailableError],
    [502, TaggerUnavailableError],
    [503, TaggerUnavailableError],
  ])('%i → %o', (status, type) => {
    expect(errorForStatus(status, 'x')).toBeInstanceOf(type);
  });
});

describe('joinUrl', () => {
  it.each([
    ['http://gpubox:7860', '/health', 'http://gpubox:7860/health'],
    ['http://gpubox:7860/', '/v1/tag', 'http://gpubox:7860/v1/tag'],
    ['https://nas.example/tagger', '/v1/tag', 'https://nas.example/tagger/v1/tag'],
    ['https://nas.example/tagger//', '/health', 'https://nas.example/tagger/health'],
  ])('%s + %s → %s', (base, path, expected) => {
    expect(joinUrl(base, path)).toBe(expected);
  });
});

describe('HttpTaggerClient', () => {
  const result = {
    model: 'wd',
    rating: { general: 1, sensitive: 0, questionable: 0, explicit: 0 },
    tags: [],
  };

  it('posts raw bytes with content type and bearer token', async () => {
    const fetchImpl = vi.fn(async () => Response.json(result));
    const client = new HttpTaggerClient('http://gpubox:7860', 'secret', 1000, fetchImpl);
    await expect(client.tag(Buffer.from('img'), 'image/webp')).resolves.toEqual(result);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://gpubox:7860/v1/tag');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'image/webp', authorization: 'Bearer secret' });
  });

  it('omits the authorization header without a token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: 'ok', model: 'wd', device: 'cuda' }));
    await new HttpTaggerClient('http://gpubox:7860', undefined, 1000, fetchImpl).health();
    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).not.toHaveProperty('authorization');
  });

  it.each([
    ['network failure', async () => Promise.reject(new Error('ECONNREFUSED')), TaggerUnavailableError],
    ['service down', async () => new Response('down', { status: 503 }), TaggerUnavailableError],
    ['bad image', async () => new Response('cannot decode', { status: 400 }), TaggerRejectedError],
  ])('%s', async (_, impl, type) => {
    const client = new HttpTaggerClient('http://gpubox:7860', undefined, 1000, vi.fn(impl) as typeof fetch);
    await expect(client.tag(Buffer.from('x'), 'image/webp')).rejects.toBeInstanceOf(type);
  });
});
