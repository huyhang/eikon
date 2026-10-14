import { useCallback, useLayoutEffect } from 'react';
import { animate, useMotionValue } from 'motion/react';
import type { ImageTile } from '@eikon/shared';
import { flipToTarget, type Rect } from '../../core/geometry';
import { findTileElement } from '../grid/tileKey';
import { boxFor } from './ViewerImage';

export const SPRING = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } as const;

export interface Stage {
  width: number;
  height: number;
}

/** Where the tile sits in its grid right now, if it is on screen. */
export function visibleTileRect(contextKey: string, id: number): Rect | null {
  const el = findTileElement(contextKey, id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  return onScreen ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
}

interface MotionOptions {
  tile: ImageTile | undefined;
  contextKey: string;
  stage: Stage;
  padding: number;
  reduceMotion: boolean;
}

/**
 * Motion values for the viewer: the horizontal slide track, the open/close "flip" from the grid
 * thumbnail, and the backdrop. All animation lives here so the component stays declarative.
 */
export function useViewerMotion({ tile, contextKey, stage, padding, reduceMotion }: MotionOptions) {
  const trackX = useMotionValue(0);
  const flipX = useMotionValue(0);
  const flipY = useMotionValue(0);
  const flipScale = useMotionValue(1);
  const backdrop = useMotionValue(0);

  const flipTo = useCallback(
    (target: Rect) => {
      if (!tile) return { x: 0, y: 0, scale: 1 };
      return flipToTarget(target, boxFor(tile, stage, padding), { x: 0, y: 0, ...stage });
    },
    [tile, stage, padding],
  );

  // Expand from the grid thumbnail, once, on mount.
  useLayoutEffect(() => {
    if (!tile) return;
    const target = reduceMotion ? null : visibleTileRect(contextKey, tile.id);
    if (target) {
      const t = flipTo(target);
      flipX.set(t.x);
      flipY.set(t.y);
      flipScale.set(t.scale);
      void animate(flipX, 0, SPRING);
      void animate(flipY, 0, SPRING);
      void animate(flipScale, 1, SPRING);
    } else {
      flipScale.set(0.94);
      void animate(flipScale, 1, { duration: 0.25 });
    }
    void animate(backdrop, 1, { duration: 0.28 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const springBack = useCallback(() => {
    void animate(trackX, 0, SPRING);
    void animate(flipY, 0, SPRING);
    void animate(flipScale, 1, SPRING);
    void animate(backdrop, 1, { duration: 0.2 });
  }, [trackX, flipY, flipScale, backdrop]);

  /** Shrinks back into the grid thumbnail (or fades out when it isn't visible). */
  const animateClose = useCallback(
    async (zoomed: boolean) => {
      const target = zoomed || reduceMotion || !tile ? null : visibleTileRect(contextKey, tile.id);
      if (target) {
        const t = flipTo(target);
        await Promise.all([
          animate(flipX, t.x, SPRING),
          animate(flipY, t.y, SPRING),
          animate(flipScale, t.scale, SPRING),
          animate(backdrop, 0, { duration: 0.3 }),
        ]);
      } else {
        await Promise.all([
          animate(flipScale, 0.9, { duration: 0.2 }),
          animate(backdrop, 0, { duration: 0.2 }),
        ]);
      }
    },
    [tile, contextKey, reduceMotion, flipTo, flipX, flipY, flipScale, backdrop],
  );

  /** Slides the track one page left or right. */
  const slide = useCallback(
    (direction: 1 | -1, distance: number) =>
      animate(trackX, -direction * distance, { ...SPRING, stiffness: 360 }),
    [trackX],
  );

  /** Live feedback while a finger is down: rubber-band at the ends, shrink-and-fade when pulling down. */
  const applyDrag = useCallback(
    (axis: 'x' | 'y', offset: number, atEdge: boolean) => {
      if (axis === 'x') {
        trackX.set(atEdge ? offset * 0.3 : offset);
      } else if (offset > 0) {
        flipY.set(offset);
        flipScale.set(1 - Math.min(0.3, offset / 1400));
        backdrop.set(1 - Math.min(0.85, offset / 380));
      } else {
        flipY.set(offset * 0.25);
      }
    },
    [trackX, flipY, flipScale, backdrop],
  );

  return { trackX, flipX, flipY, flipScale, backdrop, springBack, animateClose, slide, applyDrag };
}
