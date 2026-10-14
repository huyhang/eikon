// The service worker: built on its own into /sw.js (see vite.config.ts); behaviour lives in
// offline/serviceWorkerHandlers.ts.
import { createServiceWorkerHandlers } from '../offline/serviceWorkerHandlers';

/** Filled in at build time with this build's files and a version derived from them. */
declare const EIKON_PRECACHE: string[];
declare const EIKON_SHELL_VERSION: string;

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface ServiceWorkerScope {
  readonly location: Location;
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  fetch: typeof fetch;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}

const scope = globalThis as unknown as ServiceWorkerScope;
const handlers = createServiceWorkerHandlers({
  caches: scope.caches,
  fetch: (input, init) => scope.fetch(input, init),
  origin: scope.location.origin,
  precache: EIKON_PRECACHE,
  version: EIKON_SHELL_VERSION,
});

scope.addEventListener('install', (event) => {
  event.waitUntil(handlers.install().then(() => scope.skipWaiting()));
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(handlers.activate().then(() => scope.clients.claim()));
});

scope.addEventListener('fetch', (event) => {
  const response = handlers.respond(event.request);
  if (response) event.respondWith(response);
});
