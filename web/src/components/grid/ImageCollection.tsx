import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ImageTile } from '@eikon/shared';
import { usePrefs } from '../../context/Prefs';
import { useSelection } from '../../context/Selection';
import { tileClickAction } from '../../core/selection';
import type { PressModifiers } from '../../hooks/useLongPress';
import { useCapabilities } from '../../hooks/useCapabilities';
import { clampDensity, defaultDensity } from '../../core/gestures';
import { EMPTY_SEARCH, searchFromParams, searchReducer, searchToParams } from '../../core/searchState';
import { Viewer } from '../viewer/Viewer';
import { ImageStrip } from './ImageStrip';
import { JustifiedGrid, type JustifiedGridHandle } from './JustifiedGrid';
import { useViewerState } from './useViewerState';
import styles from './ImageCollection.module.css';

interface ImageCollectionProps {
  tiles: ImageTile[];
  /** Distinguishes several grids on one page in the URL (`ctx`). */
  contextKey: string;
  /** The primary collection answers deep links that carry no context. */
  primary?: boolean;
  maxRows?: number;
  /** Group the collection belongs to, so long-pressed tags search within it. */
  groupId?: number;
  /** 'strip' renders a large horizontal carousel instead of a grid. */
  variant?: 'grid' | 'strip';
}

/** A justified grid plus the full-screen viewer that browses within it. */
export function ImageCollection({
  tiles,
  contextKey,
  primary = false,
  maxRows,
  groupId,
  variant = 'grid',
}: ImageCollectionProps) {
  const gridRef = useRef<JustifiedGridHandle>(null);
  const { density, setDensity } = usePrefs();
  const level = density ?? defaultDensity(window.innerWidth);
  const viewer = useViewerState(contextKey, primary);
  const navigate = useNavigate();
  const location = useLocation();
  const capabilities = useCapabilities();

  const openIndex = viewer.openId === null ? -1 : tiles.findIndex((t) => t.id === viewer.openId);

  const onOpen = useCallback((index: number) => viewer.open(tiles[index]!.id), [viewer, tiles]);
  const selection = useSelection();
  const selectable = variant === 'grid' && maxRows === undefined;
  const selecting =
    selectable && selection.state.active && (selection.state.contextKey ?? contextKey) === contextKey;
  const selectedIds = useMemo(
    () => (selecting ? new Set(selection.state.ids) : undefined),
    [selecting, selection.state.ids],
  );
  const { dispatch: select, state: selectionState } = selection;
  const onPress = useCallback(
    (index: number, modifiers: PressModifiers) => {
      const id = tiles[index]!.id;
      const action = selectable ? tileClickAction(selectionState, contextKey, modifiers) : 'open';
      if (action === 'open') onOpen(index);
      else if (action === 'toggle') select({ type: 'toggle', contextKey, id });
      else select({ type: 'range', contextKey, id, order: tiles.map((t) => t.id) });
    },
    [tiles, selectable, selectionState, contextKey, onOpen, select],
  );
  const onLongPress = useCallback(
    (index: number) => select({ type: 'toggle', contextKey, id: tiles[index]!.id }),
    [select, contextKey, tiles],
  );
  const onDensityStep = useCallback(
    (delta: 1 | -1) => setDensity(clampDensity(level + delta)),
    [level, setDensity],
  );

  const onIndexChange = (index: number) => {
    gridRef.current?.revealItem(index);
    viewer.show(tiles[index]!.id);
  };

  const onSearch = (tag: string) =>
    navigate(`/search?${searchToParams(searchReducer(EMPTY_SEARCH, { type: 'add', tag }))}`);

  const onFindSimilar = (id: number) => navigate(`/search?${searchToParams({ ...EMPTY_SEARCH, like: id })}`);

  const onAddToSearch = (tag: string) => {
    const current =
      location.pathname === '/search' ? searchFromParams(new URLSearchParams(location.search)) : EMPTY_SEARCH;
    let next = searchReducer(current, { type: 'add', tag });
    if (location.pathname !== '/search' && groupId !== undefined)
      next = searchReducer(next, { type: 'setGroup', group: groupId });
    navigate(`/search?${searchToParams(next)}`, { replace: location.pathname === '/search' });
  };

  return (
    <div className={variant === 'grid' ? styles.grid : undefined}>
      {variant === 'strip' ? (
        <ImageStrip ref={gridRef} tiles={tiles} contextKey={contextKey} onOpen={onOpen} />
      ) : (
        <JustifiedGrid
          ref={gridRef}
          tiles={tiles}
          contextKey={contextKey}
          density={maxRows === undefined ? level : Math.max(0, level - 1)}
          onPress={onPress}
          onLongPress={selectable ? onLongPress : undefined}
          selectedIds={selectedIds}
          onDensityStep={maxRows === undefined ? onDensityStep : undefined}
          maxRows={maxRows}
        />
      )}
      {openIndex >= 0 && (
        <Viewer
          tiles={tiles}
          initialIndex={openIndex}
          contextKey={contextKey}
          onIndexChange={onIndexChange}
          onClose={viewer.close}
          onSearch={onSearch}
          onAddToSearch={onAddToSearch}
          onFindSimilar={capabilities.similar ? onFindSimilar : undefined}
        />
      )}
    </div>
  );
}
