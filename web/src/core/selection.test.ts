import { describe, expect, it } from 'vitest';
import {
  NO_SELECTION,
  rangeBetween,
  selectionReducer,
  tileClickAction,
  type SelectionState,
} from './selection';

const sel = (partial: Partial<SelectionState>): SelectionState => ({ ...NO_SELECTION, ...partial });
const order = [10, 11, 12, 13, 14];

describe('rangeBetween', () => {
  it.each([
    { from: 11, to: 13, expected: [11, 12, 13] },
    { from: 13, to: 11, expected: [11, 12, 13] },
    { from: 12, to: 12, expected: [12] },
    { from: 99, to: 12, expected: [12] },
  ])('$from → $to', ({ from, to, expected }) => {
    expect(rangeBetween(order, from, to)).toEqual(expected);
  });
});

describe('selectionReducer', () => {
  it.each<{
    name: string;
    from: SelectionState;
    action: Parameters<typeof selectionReducer>[1];
    to: SelectionState;
  }>([
    {
      name: 'start enters selection mode',
      from: NO_SELECTION,
      action: { type: 'start' },
      to: sel({ active: true }),
    },
    {
      name: 'toggle selects',
      from: NO_SELECTION,
      action: { type: 'toggle', contextKey: 'g', id: 11 },
      to: sel({ active: true, contextKey: 'g', ids: [11], anchor: 11 }),
    },
    {
      name: 'toggle again deselects',
      from: sel({ active: true, contextKey: 'g', ids: [11], anchor: 11 }),
      action: { type: 'toggle', contextKey: 'g', id: 11 },
      to: sel({ active: true, contextKey: 'g', ids: [], anchor: 11 }),
    },
    {
      name: 'another grid starts over',
      from: sel({ active: true, contextKey: 'g', ids: [11], anchor: 11 }),
      action: { type: 'toggle', contextKey: 'other', id: 5 },
      to: sel({ active: true, contextKey: 'other', ids: [5], anchor: 5 }),
    },
    {
      name: 'shift-click adds a range from the anchor',
      from: sel({ active: true, contextKey: 'g', ids: [11], anchor: 11 }),
      action: { type: 'range', contextKey: 'g', id: 13, order },
      to: sel({ active: true, contextKey: 'g', ids: [11, 12, 13], anchor: 13 }),
    },
    {
      name: 'a range without an anchor just toggles',
      from: sel({ active: true, contextKey: 'g' }),
      action: { type: 'range', contextKey: 'g', id: 12, order },
      to: sel({ active: true, contextKey: 'g', ids: [12], anchor: 12 }),
    },
    { name: 'clear', from: sel({ active: true, ids: [1] }), action: { type: 'clear' }, to: NO_SELECTION },
  ])('$name', ({ from, action, to }) => {
    expect(selectionReducer(from, action)).toEqual(to);
  });
});

describe('tileClickAction', () => {
  const plain = { metaKey: false, ctrlKey: false, shiftKey: false };
  it.each([
    { name: 'plain click opens', state: NO_SELECTION, mods: plain, expected: 'open' },
    {
      name: '⌘-click starts selecting',
      state: NO_SELECTION,
      mods: { ...plain, metaKey: true },
      expected: 'toggle',
    },
    {
      name: 'Ctrl-click starts selecting',
      state: NO_SELECTION,
      mods: { ...plain, ctrlKey: true },
      expected: 'toggle',
    },
    {
      name: 'click while selecting toggles',
      state: sel({ active: true, contextKey: 'g' }),
      mods: plain,
      expected: 'toggle',
    },
    {
      name: 'click in another grid opens',
      state: sel({ active: true, contextKey: 'other', ids: [1] }),
      mods: plain,
      expected: 'open',
    },
    {
      name: 'shift-click while selecting',
      state: sel({ active: true, contextKey: 'g', ids: [1] }),
      mods: { ...plain, shiftKey: true },
      expected: 'range',
    },
    {
      name: 'shift-click with nothing selected opens',
      state: NO_SELECTION,
      mods: { ...plain, shiftKey: true },
      expected: 'open',
    },
  ])('$name', ({ state, mods, expected }) => {
    expect(tileClickAction(state, 'g', mods)).toBe(expected);
  });
});
