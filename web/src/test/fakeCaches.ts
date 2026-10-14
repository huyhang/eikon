type Fetch = (input: Request | string, init?: RequestInit) => Promise<Response>;

const ORIGIN = 'https://eikon.test';

function keyOf(input: RequestInfo | URL): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(url, ORIGIN).href;
}

/** In-memory Cache: keyed by absolute URL, in insertion order, handing out clones. */
export class FakeCache implements Cache {
  readonly entries = new Map<string, Response>();

  constructor(private readonly fetchImpl: Fetch) {}

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(keyOf(input))?.clone();
  }

  async matchAll(): Promise<readonly Response[]> {
    return [...this.entries.values()].map((r) => r.clone());
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(keyOf(input), response.clone());
  }

  async add(input: RequestInfo | URL): Promise<void> {
    await this.addAll([input]);
  }

  async addAll(inputs: Iterable<RequestInfo | URL>): Promise<void> {
    for (const input of inputs) {
      const response = await this.fetchImpl(keyOf(input));
      if (!response.ok) throw new TypeError(`addAll: ${keyOf(input)} answered ${response.status}`);
      this.entries.set(keyOf(input), response);
    }
  }

  async delete(input: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(keyOf(input));
  }

  async keys(): Promise<readonly Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  /** Paths (with query) of what's stored, for assertions. */
  paths(): string[] {
    return [...this.entries.keys()].map((url) => url.slice(ORIGIN.length));
  }
}

export class FakeCacheStorage implements CacheStorage {
  readonly caches = new Map<string, FakeCache>();

  constructor(private readonly fetchImpl: Fetch = () => Promise.reject(new TypeError('offline'))) {}

  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (!cache) this.caches.set(name, (cache = new FakeCache(this.fetchImpl)));
    return cache;
  }

  async has(name: string): Promise<boolean> {
    return this.caches.has(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(input);
      if (hit) return hit;
    }
    return undefined;
  }
}

export const FAKE_ORIGIN = ORIGIN;
export const absolute = (path: string) => new URL(path, ORIGIN).href;
