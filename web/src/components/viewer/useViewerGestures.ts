import { useEffect, useRef, type RefObject } from 'react';
import { lockAxis, resolveSwipe, type SwipeAxis, type SwipeOutcome } from '../../core/gestures';

export interface ViewerGestureCallbacks {
  /** Live drag offsets while a one-finger swipe is in progress. */
  onDrag(axis: 'x' | 'y', offset: number): void;
  onRelease(outcome: SwipeOutcome, axis: SwipeAxis): void;
  onTap(): void;
  hasPrev: boolean;
  hasNext: boolean;
}

const TAP_SLOP = 8;
const TAP_MAX_MS = 280;
const DOUBLE_TAP_MS = 280;

interface Track {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  axis: SwipeAxis;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocity: number;
}

/**
 * One-finger swipe / tap recogniser for the viewer stage. Gives way as soon as a second
 * finger lands (pinch belongs to the zoom layer) and is disabled while zoomed in.
 */
export function useViewerGestures(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  callbacks: ViewerGestureCallbacks,
) {
  const latest = useRef(callbacks);
  latest.current = callbacks;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Set<number>();
    let track: Track | null = null;
    let tapTimer: number | undefined;
    let lastTapAt = 0;

    const cancel = () => {
      if (track?.axis) latest.current.onRelease('none', track.axis);
      track = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, a, input, [data-no-swipe]')) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) return cancel();
      const now = performance.now();
      track = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: now,
        axis: null,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTime: now,
        velocity: 0,
      };
    };

    const onMove = (e: PointerEvent) => {
      if (!track || e.pointerId !== track.id || !enabled) return;
      const dx = e.clientX - track.startX;
      const dy = e.clientY - track.startY;
      track.axis ??= lockAxis(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - track.lastTime);
      track.velocity = track.axis === 'x' ? (e.clientX - track.lastX) / dt : (e.clientY - track.lastY) / dt;
      track.lastX = e.clientX;
      track.lastY = e.clientY;
      track.lastTime = now;
      if (track.axis) latest.current.onDrag(track.axis, track.axis === 'x' ? dx : dy);
    };

    const handleTap = () => {
      const now = performance.now();
      if (now - lastTapAt < DOUBLE_TAP_MS) {
        window.clearTimeout(tapTimer);
        lastTapAt = 0;
        return; // double tap: the zoom layer handles it
      }
      lastTapAt = now;
      tapTimer = window.setTimeout(() => latest.current.onTap(), DOUBLE_TAP_MS);
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!track || e.pointerId !== track.id) return;
      const dx = e.clientX - track.startX;
      const dy = e.clientY - track.startY;
      const isTap = Math.hypot(dx, dy) < TAP_SLOP && performance.now() - track.startTime < TAP_MAX_MS;
      if (isTap) handleTap();
      else if (enabled && track.axis) {
        const { hasPrev, hasNext } = latest.current;
        const outcome = resolveSwipe({
          axis: track.axis,
          dx,
          dy,
          velocity: track.velocity,
          viewportWidth: el.clientWidth,
          viewportHeight: el.clientHeight,
          hasPrev,
          hasNext,
        });
        latest.current.onRelease(outcome, track.axis);
      }
      track = null;
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      cancel();
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.clearTimeout(tapTimer);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [ref, enabled]);
}
