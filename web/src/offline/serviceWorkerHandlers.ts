import {
  API_CACHE,
  API_CACHE_LIMIT,
  INDEX_KEY,
  OFFLINE_CACHE,
  otherThumbSizes,
  routeFor,
  SHELL_CACHE_PREFIX,
} from './policy';

type Fetch = (input: Request | string, init?: RequestInit) => Promise<Response>;

export interface ServiceWorkerDeps {
  caches: CacheStorage;
  fetch: Fetch;
  origin: string;
  /** This build's files: hashed assets, icons, the manifest. */
  precache: readonly string[];
  /** Changes with every build, so a new build gets a fresh shell cache. */
  version: string;
  /** How long to wait for the network before answering from a saved copy. */
  timeoutMs?: number;
}

const OFFLINE_ANSWER = JSON.stringify({ error: "You're offline and this hasn't been saved on this device." });

/**
 * The service worker's behaviour, separate from its event wiring so it can be tested:
 * pages and API calls go to the network first and fall back to saved copies; the app shell and
 * saved thumbnails come from the cache first.
 */
export function createServiceWorkerHandlers({
  caches,
  fetch,
  origin,
  precache,
  version,
  timeoutMs = 5000,
}: ServiceWorkerDeps) {
  const shellName = SHELL_CACHE_PREFIX + version;

  async function install(): Promise<void> {
    const cache = await caches.open(shellName);
    await cache.addAll([...precache]);
    const index = await fetch('/', { cache: 'no-cache' });
    if (index.ok) await cache.put(INDEX_KEY, index);
  }

  async function activate(): Promise<void> {
    for (const name of await caches.keys())
      if (name.startsWith(SHELL_CACHE_PREFIX) && name !== shellName) await caches.delete(name);
  }

  /** The network's answer unless it fails or is slow and a saved copy exists. */
  async function networkFirst(network: Promise<Response>, saved: () => Promise<Response | undefined>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<'slow'>((resolve) => (timer = setTimeout(() => resolve('slow'), timeoutMs)));
    const first = await Promise.race([network.catch(() => 'failed' as const), slow]);
    clearTimeout(timer);
    if (first !== 'slow' && first !== 'failed') return first;
    const copy = await saved();
    if (copy) return copy;
    if (first === 'slow') return network;
    return null;
  }

  async function page(request: Request): Promise<Response> {
    const cache = await caches.open(shellName);
    const network = fetch(request).then(async (response) => {
      if (response.ok) await cache.put(INDEX_KEY, response.clone());
      return response;
    });
    return (await networkFirst(network, () => cache.match(INDEX_KEY))) ?? Response.error();
  }

  async function shell(request: Request): Promise<Response> {
    const cache = await caches.open(shellName);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }

  /** Keeps a saved favorite fresh, and remembers recent answers within the limit. */
  async function remember(request: Request, response: Response): Promise<void> {
    const offline = await caches.open(OFFLINE_CACHE);
    if (await offline.match(request)) await offline.put(request, response.clone());
    const recent = await caches.open(API_CACHE);
    await recent.delete(request); // re-adding moves it to the end, so the oldest are trimmed first
    await recent.put(request, response);
    const keys = await recent.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - API_CACHE_LIMIT))) await recent.delete(old);
  }

  async function api(request: Request): Promise<Response> {
    const network = fetch(request).then(async (response) => {
      const json = response.headers.get('content-type')?.includes('application/json');
      if (response.ok && json) await remember(request, response.clone());
      return response;
    });
    const saved = async () =>
      (await (await caches.open(OFFLINE_CACHE)).match(request)) ??
      (await (await caches.open(API_CACHE)).match(request));
    return (
      (await networkFirst(network, saved)) ??
      new Response(OFFLINE_ANSWER, { status: 503, headers: { 'content-type': 'application/json' } })
    );
  }

  /**
   * Saved thumbnails first. Offline, the grid may ask for a size that wasn't saved (it picks by drawn
   * size); any saved size of the same image beats a broken one.
   */
  async function thumb(request: Request): Promise<Response> {
    const offline = await caches.open(OFFLINE_CACHE);
    const saved = await offline.match(request);
    if (saved) return saved;
    try {
      return await fetch(request);
    } catch (error) {
      for (const url of otherThumbSizes(request.url)) {
        const copy = await offline.match(url);
        if (copy) return copy;
      }
      throw error;
    }
  }

  /** The answer to a fetch event, or null to let the browser handle it as usual. */
  function respond(request: Request): Promise<Response> | null {
    switch (routeFor(request, origin)) {
      case 'page':
        return page(request);
      case 'shell':
        return shell(request);
      case 'api':
        return api(request);
      case 'thumb':
        return thumb(request);
      default:
        return null;
    }
  }

  return { install, activate, respond };
}
