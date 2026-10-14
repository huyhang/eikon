// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FakeCacheStorage } from '../test/fakeCaches';
import { BOOT_URLS, imageUrls, syncFavorites } from './favoritesSync';
import { OFFLINE_CACHE } from './policy';

const LIST = '/api/images?favorites=1&sort=newest';
const tile = (id: number) => [id, 100, 100, '', 'general'];

function setup(favorites: number[], broken: string[] = []) {
  const server = { favorites };
  const fetch = vi.fn(async (url: string) => {
    if (broken.includes(url)) return new Response('boom', { status: 500 });
    if (url === LIST)
      return Response.json({ total: server.favorites.length, tiles: server.favorites.map(tile) });
    return new Response(url);
  });
  const caches = new FakeCacheStorage();
  const sync = (onProgress?: (p: { done: number; total: number }) => void) =>
    syncFavorites({ caches, fetch, listUrl: LIST, onProgress });
  const saved = async () => (await caches.open(OFFLINE_CACHE)).paths().toSorted();
  return { server, fetch, sync, saved };
}

describe('syncFavorites', () => {
  it('saves the list, the start-up answers, and each favorite’s thumbnails and details', async () => {
    const { sync, saved } = setup([1, 2]);
    expect(await sync()).toEqual({ favorites: 2, saved: 2, failed: 0 });
    expect(await saved()).toEqual([LIST, ...BOOT_URLS, ...imageUrls(1), ...imageUrls(2)].toSorted());
  });

  it('fetches only what is missing next time, and drops images no longer favorited', async () => {
    const { server, fetch, sync, saved } = setup([1, 2]);
    await sync();
    server.favorites = [2, 3];
    fetch.mockClear();
    await sync();
    expect(fetch.mock.calls.map(([url]) => url).toSorted()).toEqual(
      [LIST, ...BOOT_URLS, ...imageUrls(3)].toSorted(),
    );
    expect(await saved()).toEqual([LIST, ...BOOT_URLS, ...imageUrls(2), ...imageUrls(3)].toSorted());
  });

  it.each([
    { label: 'a server error', broken: ['/media/thumb/2/lg'] },
    { label: 'a lost connection', broken: [] as string[], offline: '/api/images/2' },
  ])('counts a favorite that failed with $label', async ({ broken, offline }) => {
    const { fetch, sync, saved } = setup([1, 2], broken);
    if (offline) {
      const online = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (url) =>
        url === offline ? Promise.reject(new TypeError()) : online(url),
      );
    }
    expect(await sync()).toEqual({ favorites: 2, saved: 1, failed: 1 });
    expect(await saved()).toEqual(expect.arrayContaining(imageUrls(1)));
  });

  it('reports progress up to the total', async () => {
    const { sync } = setup([1, 2]);
    const progress: { done: number; total: number }[] = [];
    await sync((p) => progress.push(p));
    const total = BOOT_URLS.length + 2 * imageUrls(1).length;
    expect(progress[0]).toEqual({ done: 0, total });
    expect(progress.at(-1)).toEqual({ done: total, total });
  });

  it('fails without touching the save when the list cannot be loaded', async () => {
    const { sync, saved } = setup([1], [LIST]);
    await expect(sync()).rejects.toThrow("Couldn't load your favorites (500).");
    expect(await saved()).toEqual([]);
  });
});
