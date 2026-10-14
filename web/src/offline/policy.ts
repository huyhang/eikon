import { EXPORT_URL } from '../api/client';

/** Cache names shared by the page and the service worker; everything Eikon stores starts with `eikon-`. */
export const CACHE_PREFIX = 'eikon-';
/** The app itself (index page, hashed assets, icons), one cache per build. */
export const SHELL_CACHE_PREFIX = `${CACHE_PREFIX}shell-`;
/** API answers the service worker remembers while you browse, so recently seen pages open offline. */
export const API_CACHE = `${CACHE_PREFIX}api-v1`;
/** What the app saves for offline use: favorites' thumbnails and details, the list, start-up answers. */
export const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v1`;
/** Remembered API answers beyond this are dropped, oldest first. */
export const API_CACHE_LIMIT = 300;
/** Every page is the same index.html; it is stored under this key. */
export const INDEX_KEY = '/index.html';

export type OfflineRoute = 'page' | 'shell' | 'api' | 'thumb' | 'network';

/** How the service worker answers a request; 'network' means it stays out of the way. */
export function routeFor(
  request: { method: string; url: string; mode: string },
  origin: string,
): OfflineRoute {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin) return 'network';
  if (request.mode === 'navigate') return 'page';
  if (url.pathname.startsWith('/api/')) return isDownload(url.pathname) ? 'network' : 'api';
  if (url.pathname.startsWith('/media/thumb/')) return 'thumb';
  if (url.pathname.startsWith('/media/')) return 'network';
  return 'shell';
}

/** Backups and the curation export are big one-off downloads; never cached. */
function isDownload(pathname: string): boolean {
  return pathname === EXPORT_URL || pathname.startsWith('/api/backups/');
}

/** Path plus query, the form cache keys are compared in. */
export function cacheKey(url: string): string {
  const parsed = new URL(url, 'http://eikon.invalid');
  return parsed.pathname + parsed.search;
}
