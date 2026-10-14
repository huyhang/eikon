import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ImageTile } from '@eikon/shared';
import { useImageDetail, useToggleFavorite } from '../../api/hooks';
import { usePrefs } from '../../context/Prefs';
import { useToasts } from '../../context/Toasts';
import type { SwipeOutcome } from '../../core/gestures';
import { TOOLBAR_SPACE, viewerLayout } from '../../core/viewerLayout';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useMediaQuery, WIDE_VIEWER_QUERY } from '../../hooks/useMediaQuery';
import { Filmstrip } from './Filmstrip';
import { InfoPanel } from './InfoPanel';
import { shareMessage, shareOrDownload } from './share';
import { useViewerGestures } from './useViewerGestures';
import { useViewerMotion } from './useViewerMotion';
import { NavArrows, Toolbar, TopBar } from './ViewerChrome';
import {
  useOpenIndex,
  usePreloadNeighbours,
  useSidebarWidth,
  useSplitPage,
  useViewerKeyboard,
  useViewportSize,
} from './viewerHooks';
import { SLIDE_GAP, ViewerStage } from './ViewerStage';
import styles from './Viewer.module.css';

export interface ViewerProps {
  tiles: ImageTile[];
  initialIndex: number;
  contextKey: string;
  onIndexChange: (index: number) => void;
  /** Called once the close animation has finished. */
  onClose: () => void;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
  /** Opens "more like this" for an image; absent when similar-image search isn't available. */
  onFindSimilar?: (id: number) => void;
  /** Starts a slideshow from this index. */
  onPlay?: (index: number) => void;
}

export function Viewer({
  tiles,
  initialIndex,
  contextKey,
  onIndexChange,
  onClose,
  onSearch,
  onAddToSearch,
  onFindSimilar,
  onPlay,
}: ViewerProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const wide = useMediaQuery(WIDE_VIEWER_QUERY);
  const viewport = useViewportSize();
  const sidebar = useSidebarWidth();
  const { viewerSplit, setViewerSplit } = usePrefs();
  const [index, setIndex] = useOpenIndex(initialIndex);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const split = wide && viewerSplit;
  const filmstrip = wide && chrome && tiles.length > 1;
  const layout = viewerLayout({ viewport, wide, infoOpen, chrome, filmstrip, split, sidebar });
  const tile = tiles[index];
  const detail = useImageDetail(tile?.id ?? null).data;
  const favorite = useToggleFavorite(tile?.id ?? -1);
  const toasts = useToasts();
  const motionApi = useViewerMotion({
    tile,
    contextKey,
    stage: layout.stage,
    insets: layout.insets,
    padding: layout.padding,
    reduceMotion,
    flip: !split,
  });
  const { trackX, backdrop, springBack } = motionApi;

  useBodyScrollLock(!split);
  useSplitPage(split, layout.width);
  usePreloadNeighbours(tiles, index);

  const requestClose = useCallback(async () => {
    if (closing.current || !tile) return;
    closing.current = true;
    setInfoOpen(false);
    await motionApi.animateClose(zoomed);
    onClose();
  }, [tile, zoomed, motionApi, onClose]);

  /** Shows `next` right away (also used by filmstrip taps), re-centring the slide track. */
  const jump = useCallback(
    (next: number) => {
      // Commit the new slide before re-centring the track, in the same frame, so nothing flashes.
      flushSync(() => setIndex(next));
      trackX.set(0);
      onIndexChange(next);
    },
    [setIndex, trackX, onIndexChange],
  );

  const go = useCallback(
    (direction: 1 | -1) => {
      const next = index + direction;
      if (next < 0 || next >= tiles.length) return springBack();
      setEditing(false);
      void motionApi.slide(direction, layout.stage.width + SLIDE_GAP).then(() => jump(next));
    },
    [index, tiles.length, layout.stage.width, motionApi, springBack, jump],
  );

  const share = async () => {
    if (!detail) return;
    const outcome = await shareOrDownload(detail, { navigator, fetch: window.fetch.bind(window), document });
    const message = shareMessage(outcome, detail);
    if (message) toasts.show(message.text, message.tone);
  };

  const toggleFavorite = useCallback(() => {
    if (detail) favorite.mutate(!detail.favorite);
  }, [detail, favorite]);

  const openEditor = useCallback(() => {
    setInfoOpen(true);
    setEditing(true);
  }, []);

  const play = useCallback(() => onPlay?.(index), [onPlay, index]);

  const onRelease = (outcome: SwipeOutcome) => {
    if (outcome === 'next') go(1);
    else if (outcome === 'prev') go(-1);
    else if (outcome === 'close') void requestClose();
    else {
      if (outcome === 'info') setInfoOpen(true);
      springBack();
    }
  };

  useViewerGestures(stageRef, !zoomed, {
    onDrag: (axis, offset) => {
      const atEdge = (offset > 0 && index === 0) || (offset < 0 && index === tiles.length - 1);
      motionApi.applyDrag(axis, offset, atEdge);
    },
    onRelease,
    onTap: () => setChrome((c) => !c),
    hasPrev: index > 0,
    hasNext: index < tiles.length - 1,
  });

  useViewerKeyboard(
    { editing, infoOpen, wide },
    {
      stopEditing: () => setEditing(false),
      closeInfo: () => setInfoOpen(false),
      close: () => void requestClose(),
      next: () => go(1),
      prev: () => go(-1),
      toggleInfo: () => setInfoOpen((o) => !o),
      toggleFavorite,
      edit: openEditor,
      play,
    },
  );

  if (!tile) return null;

  return (
    <div
      className={clsx(styles.viewer, !chrome && styles.immersive, split && styles.split)}
      style={split ? { width: layout.width } : undefined}
      role="dialog"
      aria-modal={!split}
      aria-label="Image viewer"
    >
      <motion.div className={styles.backdrop} style={{ opacity: backdrop }} />

      <ViewerStage
        stageRef={stageRef}
        tiles={tiles}
        index={index}
        layout={layout}
        detail={detail}
        motion={motionApi}
        onZoomChange={setZoomed}
      >
        <NavArrows
          showPrev={wide && index > 0}
          showNext={wide && index < tiles.length - 1}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
        />
        <TopBar
          opacity={backdrop}
          position={index + 1}
          total={tiles.length}
          onClose={() => void requestClose()}
          split={split}
          onToggleSplit={wide ? () => setViewerSplit(!viewerSplit) : undefined}
        />
        {filmstrip && <Filmstrip tiles={tiles} index={index} onJump={jump} bottom={TOOLBAR_SPACE} />}
        <Toolbar
          opacity={backdrop}
          ready={Boolean(detail)}
          favorite={Boolean(detail?.favorite)}
          infoOpen={infoOpen}
          editing={editing}
          onShare={() => void share()}
          onToggleFavorite={toggleFavorite}
          onToggleInfo={() => setInfoOpen((o) => !o)}
          onEdit={openEditor}
          onFindSimilar={onFindSimilar ? () => onFindSimilar(tile.id) : undefined}
          onPlay={onPlay && tiles.length > 1 ? play : undefined}
        />
      </ViewerStage>

      <AnimatePresence>
        {infoOpen && (
          <InfoPanel
            key="info"
            detail={detail?.id === tile.id ? detail : undefined}
            wide={wide}
            editing={editing}
            onEditingChange={setEditing}
            onClose={() => {
              setInfoOpen(false);
              setEditing(false);
            }}
            onSearch={onSearch}
            onAddToSearch={onAddToSearch}
            similar={onFindSimilar !== undefined}
            sheetHeight={layout.sheetHeight}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
