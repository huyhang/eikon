import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  searchFromParams,
  searchReducer,
  searchToParams,
  type SearchAction,
  type SearchState,
} from '../core/searchState';

/** Search criteria live in the URL so Back/Forward and sharing work. */
export function useSearchUrlState(): [SearchState, (action: SearchAction) => void] {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => searchFromParams(params), [params]);

  const dispatch = useCallback(
    (action: SearchAction) => {
      // Changing criteria rebuilds the params from scratch, which also closes any open viewer.
      setParams((current) => searchToParams(searchReducer(searchFromParams(current), action)), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [setParams],
  );

  return [state, dispatch];
}
