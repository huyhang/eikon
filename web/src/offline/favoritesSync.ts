import { thumbUrl, type ImageListResponse } from '@eikon/shared';
import { cacheKey, OFFLINE_CACHE } from './policy';

export interface SyncProgress {
  done: number;
  total: number;
}

export interface SyncResult {
  favorites: number;
  /** Favorites whose thumbnails and details are all on this device. */
  saved: number;
  failed: number;
}

/** What the app asks for before it can show anything; refreshed on every sync so it starts offline. */
export const BOOT_URLS = ['/api/auth/status', '/api/status', '/api/saved-searches'];

/** What viewing one favorite needs: grid and viewer thumbnails, and its details. */
export function imageUrls(id: number): string[] {
  return [thumbUrl(id, 'sm'), thumbUrl(id, 'lg'), `/api/images/${id}`];
}

interface SyncDeps {
  caches: Pick<CacheStorage, 'open'>;
  fetch: (input: string) => Promise<Response>;
  /** The favorites list exactly as the Favorites page asks for it. */
  listUrl: string;
  onProgress?: (progress: SyncProgress) => void;
  /** Stops saving more (offline saving was switched off). */
  signal?: AbortSignal;
  concurrency?: number;
}

/**
 * Brings the offline copy in line with the favorites: saves what's missing (thumbnails never change,
 * so they're fetched once), refreshes the list and start-up answers, and drops images no longer
 * favorited.
 */
export async function syncFavorites({
  caches,
  fetch,
  listUrl,
  onProgress,
  signal,
  concurrency = 4,
}: SyncDeps): Promise<SyncResult> {
  const cache = await caches.open(OFFLINE_CACHE);
  const list = await fetch(listUrl);
  if (!list.ok) throw new Error(`Couldn't load your favorites (${list.status}).`);
  const ids = ((await list.clone().json()) as ImageListResponse).tiles.map(([id]) => id);
  await cache.put(listUrl, list);

  const owner = new Map(ids.flatMap((id) => imageUrls(id).map((url) => [url, id] as const)));
  const keep = new Set([listUrl, ...BOOT_URLS, ...owner.keys()]);
  const saved = new Set<string>();
  for (const request of await cache.keys()) {
    const key = cacheKey(request.url);
    if (keep.has(key)) saved.add(key);
    else await cache.delete(request);
  }

  const queue = [...BOOT_URLS, ...[...owner.keys()].filter((url) => !saved.has(url))];
  const failed = new Set<number>();
  const total = queue.length;
  let done = 0;
  onProgress?.({ done, total });
  const save = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
      return response.ok;
    } catch {
      return false; // offline again, or the device is out of space
    }
  };
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      if (signal?.aborted) return;
      const id = owner.get(url);
      if (!(await save(url)) && id !== undefined) failed.add(id);
      onProgress?.({ done: ++done, total });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { favorites: ids.length, saved: ids.length - failed.size, failed: failed.size };
}
