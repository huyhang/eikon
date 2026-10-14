import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api/client';
import { HttpApiClient } from './api/httpClient';
import { AppProviders, AppRoutes } from './App';
import { preloadChunks } from './lazyChunks';
import { LockSignal } from './context/AuthLock';
import { BrowserOfflineService } from './offline/offlineService';
import { LocalStorageStore } from './services/keyValueStore';
import './styles/global.css';

// Composition root: concrete implementations are chosen here and injected everywhere else.
const lockSignal = new LockSignal();
const dependencies = {
  api: new HttpApiClient({ onUnauthorized: lockSignal.fire }),
  store: new LocalStorageStore(window.localStorage),
  now: () => Date.now(),
  random: Math.random,
  confirm: (message: string) => window.confirm(message),
  offline: new BrowserOfflineService({
    // Service workers and Cache Storage only exist over HTTPS; the dev server has no /sw.js.
    serviceWorker: import.meta.env.PROD
      ? (navigator.serviceWorker as ServiceWorkerContainer | undefined)
      : undefined,
    caches: window.caches as CacheStorage | undefined,
    storage: navigator.storage as StorageManager | undefined,
    fetch: (url) => window.fetch(url, { credentials: 'same-origin' }),
  }),
};
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiRequestError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders dependencies={dependencies} queryClient={queryClient} lockSignal={lockSignal}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);

preloadChunks();
