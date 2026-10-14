export type ViewerKeyAction =
  'stopEditing' | 'closeInfo' | 'close' | 'next' | 'prev' | 'toggleInfo' | 'toggleFavorite' | 'edit' | null;

export interface ViewerKeyState {
  editing: boolean;
  infoOpen: boolean;
  /** On wide screens the info panel sits beside the image, so Esc closes the viewer instead. */
  wide: boolean;
}

/** Maps a key press to what the viewer should do. Esc peels back one layer at a time. */
export function viewerKeyAction(key: string, state: ViewerKeyState): ViewerKeyAction {
  switch (key) {
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
    default:
      return null;
  }
}
