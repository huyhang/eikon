import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Rating } from '@eikon/shared';
import { maxRatingFor, type SafeModePrefs } from '../core/safeMode';
import type { SearchState } from '../core/searchState';
import { loadPrefs, pushRecentSearch, savePrefs, type Prefs, type ThemePref } from '../services/prefs';
import { useDependencies } from './Dependencies';

interface PrefsActions {
  setTheme(theme: ThemePref): void;
  setSafeMode(patch: Partial<SafeModePrefs>): void;
  setDensity(density: number): void;
  addRecentSearch(search: SearchState): void;
  clearRecentSearches(): void;
}

interface PrefsContextValue extends Prefs, PrefsActions {
  maxRating: Rating | undefined;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  const dark =
    theme === 'dark' || (theme === 'system' && !window.matchMedia?.('(prefers-color-scheme: light)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7');
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { store } = useDependencies();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(store));

  useEffect(() => savePrefs(store, prefs), [store, prefs]);

  useEffect(() => {
    applyTheme(prefs.theme);
    if (prefs.theme !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [prefs.theme]);

  // Actions never change identity, so effects that depend on them don't re-run on every prefs change.
  const actions = useMemo<PrefsActions>(() => {
    const update = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
    return {
      setTheme: (theme) => update({ theme }),
      setSafeMode: (patch) => setPrefs((p) => ({ ...p, safeMode: { ...p.safeMode, ...patch } })),
      setDensity: (density) => update({ density }),
      addRecentSearch: (search) =>
        setPrefs((p) => {
          const recentSearches = pushRecentSearch(p.recentSearches, search);
          return recentSearches === p.recentSearches ? p : { ...p, recentSearches };
        }),
      clearRecentSearches: () => update({ recentSearches: [] }),
    };
  }, []);

  const value = useMemo<PrefsContextValue>(
    () => ({ ...prefs, ...actions, maxRating: maxRatingFor(prefs.safeMode) }),
    [prefs, actions],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return value;
}

export const useMaxRating = (): Rating | undefined => usePrefs().maxRating;
