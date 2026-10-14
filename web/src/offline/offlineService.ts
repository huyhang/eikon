import { syncFavorites, type SyncProgress, type SyncResult } from './favoritesSync';

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  signal?: AbortSignal;
}
import { CACHE_PREFIX } from './policy';

/** Saving favorites on this device for use without a connection. */
export interface OfflineService {
  /** False over plain HTTP (service workers need HTTPS), in old browsers, and in the dev server. */
  readonly supported: boolean;
  /** Installs the service worker and asks the browser not to evict what's saved. */
  enable(): Promise<void>;
  /** Removes the service worker and everything saved. */
  disable(): Promise<void>;
  sync(listUrl: string, options?: SyncOptions): Promise<SyncResult>;
  /** Bytes this site uses on the device, when the browser says. */
  usage(): Promise<number | null>;
}

export interface BrowserOfflineEnv {
  serviceWorker: ServiceWorkerContainer | undefined;
  caches: CacheStorage | undefined;
  storage: StorageManager | undefined;
  fetch: (input: string) => Promise<Response>;
}

export class BrowserOfflineService implements OfflineService {
  constructor(private readonly env: BrowserOfflineEnv) {}

  get supported(): boolean {
    return this.env.serviceWorker !== undefined && this.env.caches !== undefined;
  }

  async enable(): Promise<void> {
    await this.env.serviceWorker?.register('/sw.js');
    await this.env.storage?.persist?.().catch(() => false);
  }

  async disable(): Promise<void> {
    const registrations = (await this.env.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const caches = this.env.caches;
    if (!caches) return;
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    await Promise.all(names.map((name) => caches.delete(name)));
  }

  sync(listUrl: string, options: SyncOptions = {}): Promise<SyncResult> {
    if (!this.env.caches) return Promise.reject(new Error('Offline storage is not available.'));
    return syncFavorites({ caches: this.env.caches, fetch: this.env.fetch, listUrl, ...options });
  }

  async usage(): Promise<number | null> {
    return (await this.env.storage?.estimate?.())?.usage ?? null;
  }
}

/** For browsers (and tests) where nothing can be saved. */
export const NO_OFFLINE: OfflineService = {
  supported: false,
  enable: async () => {},
  disable: async () => {},
  sync: () => Promise.reject(new Error('Offline storage is not available.')),
  usage: async () => null,
};
