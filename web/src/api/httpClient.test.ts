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
    const fetch = fakeFetch(200, { total: 1, tiles: [[5, 100, 200, 'AAA', 1, 2]] });
    const client = new HttpApiClient({ fetch });
    await expect(client.images({ tags: ['a'], maxRating: 'general' })).resolves.toEqual({
      total: 1,
      tiles: [{ id: 5, width: 100, height: 200, placeholder: 'AAA', rating: 'sensitive', thumbVersion: 2 }],
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

describe('HttpApiClient: curation and tag manager endpoints', () => {
  it.each<{
    name: string;
    call: (c: HttpApiClient) => Promise<unknown>;
    url: string;
    method: string;
    body?: unknown;
  }>([
    {
      name: 'similar images',
      call: (c) => c.images({ like: 7, limit: 12 }),
      url: '/api/images?limit=12&like=7',
      method: 'GET',
    },
    {
      name: 'describe search',
      call: (c) => c.images({ text: 'red sky' }),
      url: '/api/images?q=red+sky',
      method: 'GET',
    },
    {
      name: 'rating override',
      call: (c) => c.setRating(4, 'general'),
      url: '/api/images/4/rating',
      method: 'PUT',
      body: { rating: 'general' },
    },
    {
      name: 'rating reset',
      call: (c) => c.setRating(4, null),
      url: '/api/images/4/rating',
      method: 'PUT',
      body: { rating: null },
    },
    { name: 'mark reviewed', call: (c) => c.markReviewed(4), url: '/api/images/4/reviewed', method: 'POST' },
    {
      name: 'review queue',
      call: (c) => c.reviewQueue(20, 'general'),
      url: '/api/review?limit=20&maxRating=general',
      method: 'GET',
    },
    {
      name: 'bulk edit',
      call: (c) => c.bulkEdit({ ids: [1, 2], favorite: true }),
      url: '/api/images/bulk',
      method: 'POST',
      body: { ids: [1, 2], favorite: true },
    },
    {
      name: 'manage tags',
      call: (c) => c.manageTags('', 60, 0),
      url: '/api/tags/manage?limit=60&offset=0',
      method: 'GET',
    },
    {
      name: 'tag with slash',
      call: (c) => c.tagInfo('ranma_1/2'),
      url: '/api/tags/manage/ranma_1%2F2',
      method: 'GET',
    },
    {
      name: 'rename tag',
      call: (c) => c.updateTag('cat', { name: 'kitty' }),
      url: '/api/tags/manage/cat',
      method: 'PATCH',
      body: { name: 'kitty' },
    },
    {
      name: 'add alias',
      call: (c) => c.addAlias('cat', 'neko'),
      url: '/api/tags/manage/cat/aliases',
      method: 'POST',
      body: { alias: 'neko' },
    },
    {
      name: 'remove implication',
      call: (c) => c.removeImplication('cat', 'animal'),
      url: '/api/tags/manage/cat/implications/animal',
      method: 'DELETE',
    },
    { name: 'create backup', call: (c) => c.createBackup(), url: '/api/backups', method: 'POST' },
    {
      name: 'sign out everywhere',
      call: (c) => c.signOutEverywhere(),
      url: '/api/auth/sign-out-everywhere',
      method: 'POST',
    },
  ])('$name → $method $url', async ({ call, url, method, body }) => {
    const fetch = fakeFetch(200, { clusters: [], backups: [], marked: 0, updated: 2, total: 0, tiles: [] });
    await call(new HttpApiClient({ fetch }));
    const [calledUrl, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect(init.method ?? 'GET').toBe(method);
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });

  it.each([
    {
      name: 'duplicates',
      call: (c: HttpApiClient) => c.duplicates(),
      body: { clusters: ['x'] },
      expected: ['x'],
    },
    { name: 'backups', call: (c: HttpApiClient) => c.backups(), body: { backups: ['b'] }, expected: ['b'] },
    {
      name: 'mark all reviewed',
      call: (c: HttpApiClient) => c.markAllReviewed(),
      body: { marked: 5 },
      expected: 5,
    },
    {
      name: 'bulk edit',
      call: (c: HttpApiClient) => c.bulkEdit({ ids: [1], favorite: true }),
      body: { updated: 1 },
      expected: 1,
    },
  ])('unwraps $name', async ({ call, body, expected }) => {
    await expect(call(new HttpApiClient({ fetch: fakeFetch(200, body) }))).resolves.toEqual(expected);
  });
});
