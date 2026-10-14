import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import { AppProviders } from '../App';
import { LockSignal } from '../context/AuthLock';
import { MemoryStore } from '../services/keyValueStore';
import { createFakeApi } from './fakeApi';

interface RenderOptions {
  api?: ApiClient;
  route?: string;
  now?: () => number;
  random?: () => number;
  confirm?: (message: string) => boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    api = createFakeApi(),
    route = '/',
    now = () => Date.now(),
    random = () => 0.5,
    confirm = () => true,
  }: RenderOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const lockSignal = new LockSignal();
  const result = render(
    <AppProviders
      dependencies={{ api, store: new MemoryStore(), now, random, confirm }}
      queryClient={queryClient}
      lockSignal={lockSignal}
    >
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AppProviders>,
  );
  return { ...result, api, queryClient, lockSignal };
}
