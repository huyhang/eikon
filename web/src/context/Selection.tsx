import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { NO_SELECTION, selectionReducer, type SelectionAction, type SelectionState } from '../core/selection';

interface SelectionValue {
  state: SelectionState;
  dispatch: (action: SelectionAction) => void;
}

const SelectionContext = createContext<SelectionValue | null>(null);

/** Multi-select across the app's grids, with Esc to leave selection mode. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(selectionReducer, NO_SELECTION);
  useEffect(() => {
    if (!state.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) dispatch({ type: 'clear' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.active]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionValue {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('useSelection must be used inside <SelectionProvider>');
  return value;
}
