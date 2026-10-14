import { useEffect, useState } from 'react';
import { thumbUrl, type ImageTile } from '@eikon/shared';
import { SIDEBAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { viewerKeyAction, type ViewerKeyAction, type ViewerKeyState } from './viewerKeys';

export function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Width of the app's sidebar (--sidebar-width) while it shows; 0 on phones. */
export function useSidebarWidth(): number {
  const shown = useMediaQuery(SIDEBAR_QUERY);
  if (!shown) return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 0;
}

/** Routes key presses (outside text fields) through viewerKeyAction to the handlers. */
export function useViewerKeyboard(
  state: ViewerKeyState,
  handlers: Record<Exclude<ViewerKeyAction, null>, () => void>,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const action = viewerKeyAction(e, state);
      if (action) handlers[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, handlers]);
}

/** Preloads the neighbouring large thumbnails so swipes feel instant. */
export function usePreloadNeighbours(tiles: ImageTile[], index: number) {
  useEffect(() => {
    for (const neighbour of [tiles[index - 1], tiles[index + 1]]) {
      if (neighbour) new Image().src = thumbUrl(neighbour.id, 'lg');
    }
  }, [index, tiles]);
}

/** The shown image's index; a deep link, Back, or a tap in the grid (split view) can point it elsewhere. */
export function useOpenIndex(initialIndex: number): [number, (index: number) => void] {
  const [index, setIndex] = useState(initialIndex);
  const [openedAt, setOpenedAt] = useState(initialIndex);
  if (initialIndex !== openedAt) {
    setOpenedAt(initialIndex);
    setIndex(initialIndex);
  }
  return [index, setIndex];
}

/** While split view is on, the page beside the viewer gets narrower (see global.css). */
export function useSplitPage(split: boolean, widthPx: number) {
  useEffect(() => {
    if (!split) return;
    const root = document.documentElement;
    root.dataset.viewerSplit = 'true';
    root.style.setProperty('--viewer-split-width', `${widthPx}px`);
    return () => {
      delete root.dataset.viewerSplit;
      root.style.removeProperty('--viewer-split-width');
    };
  }, [split, widthPx]);
}
