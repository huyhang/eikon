import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import type { OfflineService } from '../offline/offlineService';
import type { KeyValueStore } from '../services/keyValueStore';

export interface Dependencies {
  api: ApiClient;
  store: KeyValueStore;
  now: () => number;
  /** Uniform in [0, 1); injected so shuffles are testable. */
  random: () => number;
  /** Asks the user to confirm a consequential action (window.confirm in the browser). */
  confirm: (message: string) => boolean;
  /** Saving favorites for use without a connection (a service worker in production). */
  offline: OfflineService;
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

/** A fresh seed for a stable shuffle. */
export function useNewSeed(): () => number {
  const { random } = useDependencies();
  return () => Math.floor(random() * 1_000_000_000);
}
