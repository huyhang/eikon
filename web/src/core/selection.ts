/** Multi-selection within one grid; selecting in another grid starts over. */
export interface SelectionState {
  /** Selection mode is on even with nothing selected yet (after tapping Select). */
  active: boolean;
  contextKey: string | null;
  ids: readonly number[];
  /** Last toggled id, for Shift-click ranges. */
  anchor: number | null;
}

export type SelectionAction =
  | { type: 'start' }
  | { type: 'toggle'; contextKey: string; id: number }
  | { type: 'range'; contextKey: string; id: number; order: readonly number[] }
  | { type: 'clear' };

export const NO_SELECTION: SelectionState = { active: false, contextKey: null, ids: [], anchor: null };

/** Ids from `from` to `to` (inclusive, either direction) in grid order. */
export function rangeBetween(order: readonly number[], from: number, to: number): number[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

function inContext(state: SelectionState, contextKey: string): SelectionState {
  return state.contextKey === contextKey ? state : { ...NO_SELECTION, active: true, contextKey };
}

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'start':
      return { ...state, active: true };
    case 'toggle': {
      const base = inContext(state, action.contextKey);
      const ids = base.ids.includes(action.id)
        ? base.ids.filter((id) => id !== action.id)
        : [...base.ids, action.id];
      return { ...base, active: true, ids, anchor: action.id };
    }
    case 'range': {
      const base = inContext(state, action.contextKey);
      if (base.anchor === null)
        return selectionReducer(base, { type: 'toggle', contextKey: action.contextKey, id: action.id });
      const added = rangeBetween(action.order, base.anchor, action.id);
      return { ...base, active: true, ids: [...new Set([...base.ids, ...added])], anchor: action.id };
    }
    case 'clear':
      return NO_SELECTION;
  }
}

/** What a click on a tile does: open it, or change the selection. */
export function tileClickAction(
  state: SelectionState,
  contextKey: string,
  modifiers: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
): 'open' | 'toggle' | 'range' {
  const selecting = state.active && (state.contextKey === null || state.contextKey === contextKey);
  if (modifiers.shiftKey && (selecting || state.ids.length > 0)) return 'range';
  if (modifiers.metaKey || modifiers.ctrlKey || selecting) return 'toggle';
  return 'open';
}
