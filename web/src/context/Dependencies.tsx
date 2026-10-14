import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import type { KeyValueStore } from '../services/keyValueStore';

export interface Dependencies {
  api: ApiClient;
  store: KeyValueStore;
  now: () => number;
}

const DependenciesContext = createContext<Dependencies | null>(null);

export function DependenciesProvider({ value, children }: { value: Dependencies; children: ReactNode }) {
  return <DependenciesContext.Provider value={value}>{children}</DependenciesContext.Provider>;
}

export function useDependencies(): Dependencies {
  const deps = useContext(DependenciesContext);
  if (!deps) throw new Error('useDependencies must be used inside <DependenciesProvider>');
  return deps;
}

export const useApi = (): ApiClient => useDependencies().api;
