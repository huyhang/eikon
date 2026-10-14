import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Rating } from '@eikon/shared';
import { maxRatingFor, type SafeModePrefs } from '../core/safeMode';
import type { SearchState } from '../core/searchState';
import { loadPrefs, pushRecentSearch, savePrefs, type Prefs, type ThemePref } from '../services/prefs';
import { useDependencies } from './Dependencies';

interface PrefsContextValue extends Prefs {
  maxRating: Rating | undefined;
  setTheme(theme: ThemePref): void;
  setSafeMode(patch: Partial<SafeModePrefs>): void;
  setDensity(density: number): void;
  addRecentSearch(search: SearchState): void;
  clearRecentSearches(): void;
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

  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);

  const value = useMemo<PrefsContextValue>(
    () => ({
      ...prefs,
      maxRating: maxRatingFor(prefs.safeMode),
      setTheme: (theme) => update({ theme }),
      setSafeMode: (patch) => setPrefs((p) => ({ ...p, safeMode: { ...p.safeMode, ...patch } })),
      setDensity: (density) => update({ density }),
      addRecentSearch: (search) =>
        setPrefs((p) => ({ ...p, recentSearches: pushRecentSearch(p.recentSearches, search) })),
      clearRecentSearches: () => update({ recentSearches: [] }),
    }),
    [prefs, update],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return value;
}

export const useMaxRating = (): Rating | undefined => usePrefs().maxRating;
