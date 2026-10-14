import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { imagesPath } from '../api/httpClient';
import { withSafeMode } from '../api/hooks';
import { EMPTY_SEARCH, favoritesImageQuery } from '../core/searchState';
import { SyncRunner, type OfflineState } from '../offline/syncRunner';
import { useDependencies } from './Dependencies';
import { usePrefs } from './Prefs';

/** After an edit, wait this long for more before refreshing the offline copy. */
export const EDIT_SYNC_DELAY_MS = 5000;

interface OfflineContextValue {
  supported: boolean;
  enabled: boolean;
  state: OfflineState;
  setEnabled(on: boolean): void;
  syncNow(): void;
  /** Switches offline saving off and waits until everything saved is gone (before signing out). */
  forget(): Promise<void>;
  runner: SyncRunner;
  listUrl: string;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/** Offline saving state and actions; when to sync is up to useOfflineAutoSync(). */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { offline } = useDependencies();
  const { offlineFavorites, setOfflineFavorites, maxRating } = usePrefs();
  const [state, setState] = useState<OfflineState>({ phase: 'off' });
  const [runner] = useState(() => new SyncRunner(offline, setState));
  const enabled = offline.supported && offlineFavorites;
  const listUrl = imagesPath(withSafeMode(favoritesImageQuery(EMPTY_SEARCH), maxRating));

  const value = useMemo<OfflineContextValue>(
    () => ({
      supported: offline.supported,
      enabled,
      state: enabled ? state : { phase: 'off' },
      setEnabled: setOfflineFavorites,
      syncNow: () => runner.request(listUrl),
      forget: async () => {
        setOfflineFavorites(false);
        await runner.stop();
        await offline.disable();
      },
      runner,
      listUrl,
    }),
    [offline, enabled, state, setOfflineFavorites, runner, listUrl],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/**
 * Keeps the offline copy current while signed in (mounted inside the auth gate): syncs at start-up,
 * when the connection comes back, when safe mode changes the list, and shortly after edits. With
 * offline saving off, it makes sure nothing is left on the device.
 */
export function useOfflineAutoSync(): void {
  const { offline } = useDependencies();
  const { enabled, runner, listUrl } = useOffline();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    runner.request(listUrl);
    const onOnline = () => runner.request(listUrl);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, listUrl, runner]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      clearTimeout(timer);
      timer = setTimeout(() => runner.request(listUrl), EDIT_SYNC_DELAY_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, listUrl, queryClient, runner]);

  useEffect(() => {
    if (offline.supported && !enabled) void runner.stop().then(() => offline.disable());
  }, [offline, enabled, runner]);
}

export function useOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline must be used inside <OfflineProvider>');
  return value;
}
