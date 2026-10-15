// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { absolute, FAKE_ORIGIN, FakeCacheStorage } from '../test/fakeCaches';
import { API_CACHE, API_CACHE_LIMIT, INDEX_KEY, OFFLINE_CACHE, SHELL_CACHE_PREFIX } from './policy';
import { createServiceWorkerHandlers } from './serviceWorkerHandlers';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** A server that answers from a table, and can be unplugged or made to hang. */
function fakeNetwork(table: Record<string, () => Response> = {}) {
  const network = {
    mode: 'online' as 'online' | 'offline' | 'hanging',
    release: () => {},
    fetch: vi.fn(async (input: Request | string): Promise<Response> => {
      if (network.mode === 'offline') throw new TypeError('Failed to fetch');
      const path = new URL(typeof input === 'string' ? input : input.url, FAKE_ORIGIN).pathname;
      const answer = table[path]?.() ?? new Response('not found', { status: 404 });
      if (network.mode === 'hanging')
        return new Promise((resolve) => (network.release = () => resolve(answer)));
      return answer;
    }),
  };
  return network;
}

function setup(table: Record<string, () => Response> = {}) {
  const network = fakeNetwork({
    '/': () => new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }),
    '/assets/index-1.js': () => new Response('js'),
    '/icon.svg': () => new Response('<svg/>'),
    ...table,
  });
  const caches = new FakeCacheStorage(network.fetch);
  const handlers = createServiceWorkerHandlers({
    caches,
    fetch: network.fetch,
    origin: FAKE_ORIGIN,
    precache: ['/assets/index-1.js', '/icon.svg'],
    version: 'v2',
    timeoutMs: 1000,
  });
  const get = (path: string, mode: RequestMode = 'cors') => {
    const request = new Request(absolute(path));
    Object.defineProperty(request, 'mode', { value: mode === 'navigate' ? 'navigate' : mode });
    return handlers.respond(request);
  };
  return { network, caches, handlers, get };
}

describe('service worker lifecycle', () => {
  it('install saves the build and the index page; activate drops older builds only', async () => {
    const { caches, handlers } = setup();
    await caches.open(`${SHELL_CACHE_PREFIX}v1`);
    await caches.open(OFFLINE_CACHE);
    await handlers.install();
    expect((await caches.open(`${SHELL_CACHE_PREFIX}v2`)).paths()).toEqual([
      '/assets/index-1.js',
      '/icon.svg',
      INDEX_KEY,
    ]);
    await handlers.activate();
    expect(await caches.keys()).toEqual([OFFLINE_CACHE, `${SHELL_CACHE_PREFIX}v2`]);
  });
});

describe('respond', () => {
  it.each([
    ['a change', 'POST', '/api/images/5/tags'],
    ['an original', 'GET', '/media/original/5'],
    ['the export', 'GET', '/api/export'],
  ])('leaves %s to the browser', (_, method, path) => {
    const { handlers } = setup();
    expect(handlers.respond(new Request(absolute(path), { method }))).toBeNull();
  });

  it('pages come from the network and fall back to the saved index offline', async () => {
    const { network, get } = setup({ '/favorites': () => new Response('<html>app</html>') });
    expect(await (await get('/favorites', 'navigate'))!.text()).toBe('<html>app</html>');
    network.mode = 'offline';
    expect(await (await get('/illustrators/3', 'navigate'))!.text()).toBe('<html>app</html>');
  });

  it('a page offline with nothing saved is a network error', async () => {
    const { network, get } = setup();
    network.mode = 'offline';
    expect((await get('/favorites', 'navigate'))!.type).toBe('error');
  });

  it('the shell is served from the cache once saved', async () => {
    const { network, get } = setup();
    expect(await (await get('/assets/index-1.js'))!.text()).toBe('js');
    network.mode = 'offline';
    expect(await (await get('/assets/index-1.js'))!.text()).toBe('js');
  });

  describe('API', () => {
    const table = {
      '/api/status': () => json({ ok: 'fresh' }),
      '/api/images/5': () => json({ id: 5, tags: ['fresh'] }),
      '/api/export': () => json({}),
    };

    it('remembers answers and uses them when offline', async () => {
      const { network, get } = setup(table);
      expect(await (await get('/api/status'))!.json()).toEqual({ ok: 'fresh' });
      network.mode = 'offline';
      expect(await (await get('/api/status'))!.json()).toEqual({ ok: 'fresh' });
    });

    it('offline with nothing saved answers 503 so the app can say so', async () => {
      const { network, get } = setup(table);
      network.mode = 'offline';
      const response = (await get('/api/status'))!;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: expect.stringContaining('offline') });
    });

    it('keeps a saved favorite fresh when it is fetched online', async () => {
      const { network, caches, get } = setup(table);
      await (await caches.open(OFFLINE_CACHE)).put('/api/images/5', json({ id: 5, tags: ['stale'] }));
      await get('/api/images/5');
      network.mode = 'offline';
      expect(await (await get('/api/images/5'))!.json()).toEqual({ id: 5, tags: ['fresh'] });
      expect(await (await caches.open(OFFLINE_CACHE)).match('/api/images/5').then((r) => r!.json())).toEqual({
        id: 5,
        tags: ['fresh'],
      });
    });

    it('does not remember errors or anything that is not JSON', async () => {
      const { caches, get } = setup({
        ...table,
        '/api/missing': () => new Response('nope', { status: 404 }),
        '/api/text': () => new Response('plain'),
      });
      await get('/api/missing');
      await get('/api/text');
      expect((await caches.open(API_CACHE)).paths()).toEqual([]);
    });

    it(`keeps only the ${API_CACHE_LIMIT} most recent answers`, async () => {
      const { caches, network, handlers } = setup();
      network.fetch.mockImplementation(async () => json({}));
      for (let i = 0; i <= API_CACHE_LIMIT; i++)
        await handlers.respond(new Request(absolute(`/api/images/${i}`)));
      const paths = (await caches.open(API_CACHE)).paths();
      expect(paths).toHaveLength(API_CACHE_LIMIT);
      expect(paths[0]).toBe('/api/images/1');
    });

    describe('slow network', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('answers from the saved copy after the timeout', async () => {
        const { network, caches, get } = setup(table);
        await (await caches.open(API_CACHE)).put('/api/status', json({ ok: 'saved' }));
        network.mode = 'hanging';
        const answer = get('/api/status')!;
        await vi.advanceTimersByTimeAsync(1000);
        expect(await (await answer).json()).toEqual({ ok: 'saved' });
      });

      it('keeps waiting when there is no saved copy', async () => {
        const { network, get } = setup(table);
        network.mode = 'hanging';
        const answer = get('/api/status')!;
        await vi.advanceTimersByTimeAsync(1000);
        network.release();
        expect(await (await answer).json()).toEqual({ ok: 'fresh' });
      });
    });
  });

  it('thumbnails come from the offline save first, then the network', async () => {
    const { network, caches, get } = setup({ '/media/thumb/9/sm': () => new Response('network') });
    await (await caches.open(OFFLINE_CACHE)).put('/media/thumb/5/sm', new Response('saved'));
    network.mode = 'offline';
    expect(await (await get('/media/thumb/5/sm'))!.text()).toBe('saved');
    network.mode = 'online';
    expect(await (await get('/media/thumb/9/sm'))!.text()).toBe('network');
  });

  it('offline, a thumbnail size that was not saved is answered with a saved size of the same image', async () => {
    const { network, caches, get } = setup();
    const offline = await caches.open(OFFLINE_CACHE);
    await offline.put('/media/thumb/5/sm?v=2', new Response('small'));
    await offline.put('/media/thumb/5/lg?v=2', new Response('large'));
    await offline.put('/media/thumb/6/sm?v=2', new Response('small'));
    network.mode = 'offline';
    expect(await (await get('/media/thumb/5/md?v=2'))!.text()).toBe('large');
    expect(await (await get('/media/thumb/6/md?v=2'))!.text()).toBe('small');
    await expect(get('/media/thumb/7/md?v=2')).rejects.toThrow('Failed to fetch');
  });
});
