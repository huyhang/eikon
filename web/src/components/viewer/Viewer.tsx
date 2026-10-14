import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { thumbUrl, type ImageTile } from '@eikon/shared';
import { useImageDetail, useToggleFavorite } from '../../api/hooks';
import type { SwipeOutcome } from '../../core/gestures';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useMediaQuery, WIDE_VIEWER_QUERY } from '../../hooks/useMediaQuery';
import { InfoPanel, INFO_PANEL_WIDTH } from './InfoPanel';
import { shareOrDownload } from './share';
import { useViewerGestures } from './useViewerGestures';
import { useViewerMotion } from './useViewerMotion';
import { NavArrows, Toolbar, TopBar } from './ViewerChrome';
import { ViewerImage } from './ViewerImage';
import { viewerKeyAction, type ViewerKeyAction, type ViewerKeyState } from './viewerKeys';
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
}

const SLIDE_GAP = 24;

function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Routes key presses (outside text fields) through viewerKeyAction to the handlers. */
function useViewerKeyboard(
  state: ViewerKeyState,
  handlers: Record<Exclude<ViewerKeyAction, null>, () => void>,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const action = viewerKeyAction(e.key, state);
      if (action) handlers[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, handlers]);
}

/** Preloads the neighbouring large thumbnails so swipes feel instant. */
function usePreloadNeighbours(tiles: ImageTile[], index: number) {
  useEffect(() => {
    for (const neighbour of [tiles[index - 1], tiles[index + 1]]) {
      if (neighbour) new Image().src = thumbUrl(neighbour.id, 'lg');
    }
  }, [index, tiles]);
}

export function Viewer({
  tiles,
  initialIndex,
  contextKey,
  onIndexChange,
  onClose,
  onSearch,
  onAddToSearch,
}: ViewerProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const wide = useMediaQuery(WIDE_VIEWER_QUERY);
  const viewport = useViewportSize();
  const [index, setIndex] = useState(initialIndex);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const stage = {
    width: viewport.width - (wide && infoOpen ? INFO_PANEL_WIDTH : 0),
    height: viewport.height,
  };
  const padding = wide ? 28 : 0;
  const tile = tiles[index];
  const detail = useImageDetail(tile?.id ?? null).data;
  const favorite = useToggleFavorite(tile?.id ?? -1);
  const motionApi = useViewerMotion({ tile, contextKey, stage, padding, reduceMotion });
  const { trackX, flipX, flipY, flipScale, backdrop, springBack } = motionApi;

  useBodyScrollLock(true);
  usePreloadNeighbours(tiles, index);
  useEffect(() => setIndex(initialIndex), [initialIndex]);
  useLayoutEffect(() => trackX.set(0), [index, trackX]);

  const requestClose = useCallback(async () => {
    if (closing.current || !tile) return;
    closing.current = true;
    setInfoOpen(false);
    await motionApi.animateClose(zoomed);
    onClose();
  }, [tile, zoomed, motionApi, onClose]);

  const go = useCallback(
    (direction: 1 | -1) => {
      const next = index + direction;
      if (next < 0 || next >= tiles.length) return springBack();
      setEditing(false);
      void motionApi.slide(direction, stage.width + SLIDE_GAP).then(() => {
        setIndex(next);
        onIndexChange(next);
      });
    },
    [index, tiles.length, stage.width, motionApi, springBack, onIndexChange],
  );

  const toggleFavorite = useCallback(() => {
    if (detail) favorite.mutate(!detail.favorite);
  }, [detail, favorite]);

  const openEditor = useCallback(() => {
    setInfoOpen(true);
    setEditing(true);
  }, []);

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
    },
  );

  if (!tile) return null;

  return (
    <div
      className={clsx(styles.viewer, !chrome && styles.immersive)}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <motion.div className={styles.backdrop} style={{ opacity: backdrop }} />

      <div ref={stageRef} className={styles.stage} style={{ width: stage.width }}>
        {[-1, 0, 1].map((offset) => {
          const slideTile = tiles[index + offset];
          if (!slideTile) return null;
          const image = (
            <ViewerImage
              tile={slideTile}
              stage={stage}
              padding={padding}
              active={offset === 0}
              animated={offset === 0 && detail?.id === slideTile.id && detail.animated}
              onZoomChange={offset === 0 ? setZoomed : undefined}
            />
          );
          return (
            <Slide key={slideTile.id} trackX={trackX} offset={offset} distance={stage.width + SLIDE_GAP}>
              {offset === 0 ? (
                <motion.div className={styles.flip} style={{ x: flipX, y: flipY, scale: flipScale }}>
                  {image}
                </motion.div>
              ) : (
                image
              )}
            </Slide>
          );
        })}

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
        />
        <Toolbar
          opacity={backdrop}
          ready={Boolean(detail)}
          favorite={Boolean(detail?.favorite)}
          infoOpen={infoOpen}
          editing={editing}
          onShare={() =>
            detail && void shareOrDownload(detail, { navigator, fetch: window.fetch.bind(window), document })
          }
          onToggleFavorite={toggleFavorite}
          onToggleInfo={() => setInfoOpen((o) => !o)}
          onEdit={openEditor}
        />
      </div>

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
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Slide({
  trackX,
  offset,
  distance,
  children,
}: {
  trackX: MotionValue<number>;
  offset: number;
  distance: number;
  children: ReactNode;
}) {
  const x = useTransform(trackX, (v) => v + offset * distance);
  return (
    <motion.div className={styles.slide} style={{ x }} aria-hidden={offset !== 0}>
      {children}
    </motion.div>
  );
}
