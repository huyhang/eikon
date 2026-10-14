import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api/client';
import { HttpApiClient } from './api/httpClient';
import { AppProviders, AppRoutes } from './App';
import { LockSignal } from './context/AuthLock';
import { LocalStorageStore } from './services/keyValueStore';
import './styles/global.css';

// Composition root: concrete implementations are chosen here and injected everywhere else.
const lockSignal = new LockSignal();
const dependencies = {
  api: new HttpApiClient({ onUnauthorized: lockSignal.fire }),
  store: new LocalStorageStore(window.localStorage),
  now: () => Date.now(),
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
