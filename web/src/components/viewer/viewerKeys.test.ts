import { describe, expect, it } from 'vitest';
import { viewerKeyAction, type ViewerKeyPress, type ViewerKeyState } from './viewerKeys';

const closed: ViewerKeyState = { editing: false, infoOpen: false, wide: false };

describe('viewerKeyAction', () => {
  it.each<[string, ViewerKeyState, ReturnType<typeof viewerKeyAction>]>([
    ['Escape', { ...closed, editing: true, infoOpen: true }, 'stopEditing'],
    ['Escape', { ...closed, infoOpen: true }, 'closeInfo'],
    ['Escape', { ...closed, infoOpen: true, wide: true }, 'close'],
    ['Escape', closed, 'close'],
    ['ArrowRight', closed, 'next'],
    ['ArrowLeft', closed, 'prev'],
    ['i', closed, 'toggleInfo'],
    ['f', closed, 'toggleFavorite'],
    ['e', closed, 'edit'],
    ['x', closed, null],
  ])('%s with %j → %s', (key, state, expected) => {
    expect(viewerKeyAction({ key }, state)).toBe(expected);
  });

  it.each<[string, ViewerKeyPress]>([
    ['⌘F (find)', { key: 'f', metaKey: true }],
    ['Ctrl+F (find)', { key: 'f', ctrlKey: true }],
    ['⌘← (back)', { key: 'ArrowLeft', metaKey: true }],
    ['Alt+E', { key: 'e', altKey: true }],
    ['Ctrl+I', { key: 'i', ctrlKey: true }],
  ])('leaves %s to the browser', (_, press) => {
    expect(viewerKeyAction(press, closed)).toBeNull();
  });
});
