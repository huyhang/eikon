import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './client';
import { HttpApiClient, withParams } from './httpClient';

function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn(
    async () =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

describe('withParams', () => {
  it.each([
    { path: '/a', params: {}, expected: '/a' },
    { path: '/a', params: { x: 1, y: undefined }, expected: '/a?x=1' },
    {
      path: '/a',
      params: new URLSearchParams([
        ['t', 'a'],
        ['t', 'b'],
      ]),
      expected: '/a?t=a&t=b',
    },
  ])('$expected', ({ path, params, expected }) => {
    expect(withParams(path, params)).toBe(expected);
  });
});

describe('HttpApiClient', () => {
  it('decodes compact image tuples', async () => {
    const fetch = fakeFetch(200, { total: 1, tiles: [[5, 100, 200, 'AAA', 1]] });
    const client = new HttpApiClient({ fetch });
    await expect(client.images({ tags: ['a'], maxRating: 'general' })).resolves.toEqual({
      total: 1,
      tiles: [{ id: 5, width: 100, height: 200, placeholder: 'AAA', rating: 'sensitive' }],
    });
    expect(fetch).toHaveBeenCalledWith('/api/images?tag=a&maxRating=general', expect.anything());
  });

  it.each([
    { name: 'protected endpoint', call: (c: HttpApiClient) => c.home(), notifies: true },
    { name: 'auth endpoint', call: (c: HttpApiClient) => c.authStatus(), notifies: false },
  ])('401 on $name notifies=$notifies', async ({ call, notifies }) => {
    const onUnauthorized = vi.fn();
    const client = new HttpApiClient({ fetch: fakeFetch(401, { error: 'unauthorized' }), onUnauthorized });
    await expect(call(client)).rejects.toBeInstanceOf(ApiRequestError);
    expect(onUnauthorized).toHaveBeenCalledTimes(notifies ? 1 : 0);
  });

  it.each([
    { status: 204, body: undefined, expected: { ok: true } },
    { status: 401, body: { error: 'Wrong passcode' }, expected: { ok: false, error: 'Wrong passcode' } },
    {
      status: 429,
      body: { error: 'Too many attempts', retryAfterSeconds: 30 },
      expected: { ok: false, error: 'Too many attempts', retryAfterSeconds: 30 },
    },
  ])('login → $status', async ({ status, body, expected }) => {
    const client = new HttpApiClient({ fetch: fakeFetch(status, body) });
    await expect(client.login({ passcode: '1234', remember: true })).resolves.toEqual(expected);
  });

  it('sends JSON bodies for mutations', async () => {
    const fetch = fakeFetch(200, {});
    await new HttpApiClient({ fetch }).addTag(3, 'character:miku');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/images/3/tags');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ tag: 'character:miku' }));
  });
});
