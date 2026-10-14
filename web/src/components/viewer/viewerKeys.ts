export type ViewerKeyAction =
  | 'stopEditing'
  | 'closeInfo'
  | 'close'
  | 'next'
  | 'prev'
  | 'toggleInfo'
  | 'toggleFavorite'
  | 'edit'
  | 'play'
  | null;

export interface ViewerKeyState {
  editing: boolean;
  infoOpen: boolean;
  /** On wide screens the info panel sits beside the image, so Esc closes the viewer instead. */
  wide: boolean;
}

/** The parts of a KeyboardEvent the viewer looks at. */
export interface ViewerKeyPress {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * Maps a key press to what the viewer should do. Esc peels back one layer at a time.
 * Presses with ⌘, Ctrl or Alt belong to the browser (⌘F is find, not favourite).
 */
export function viewerKeyAction(press: ViewerKeyPress, state: ViewerKeyState): ViewerKeyAction {
  if (press.metaKey || press.ctrlKey || press.altKey) return null;
  switch (press.key) {
    case 'Escape':
      if (state.editing) return 'stopEditing';
      if (state.infoOpen && !state.wide) return 'closeInfo';
      return 'close';
    case 'ArrowRight':
      return 'next';
    case 'ArrowLeft':
      return 'prev';
    case 'i':
      return 'toggleInfo';
    case 'f':
      return 'toggleFavorite';
    case 'e':
      return 'edit';
    case 'p':
      return 'play';
    default:
      return null;
  }
}
