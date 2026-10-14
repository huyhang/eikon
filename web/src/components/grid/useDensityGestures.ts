import { useEffect, useEffectEvent, type RefObject } from 'react';
import { densityStepForPinch } from '../../core/gestures';

const WHEEL_STEP = 60;

/**
 * Pinch (touch) and ctrl/⌘+wheel (trackpad pinch) on the grid change its density. Without an
 * `onStep` handler nothing is intercepted, so the browser's own zoom keeps working.
 */
export function useDensityGestures(
  ref: RefObject<HTMLElement | null>,
  onStep: ((delta: 1 | -1) => void) | undefined,
): void {
  const enabled = onStep !== undefined;
  // An effect event keeps the listeners attached for the whole gesture even though the handler
  // changes after every step; re-subscribing mid-pinch used to reset the pinch and stop it at one step.
  const step = useEffectEvent((delta: 1 | -1) => onStep?.(delta));

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let wheelAccumulator = 0;
    let pinchBase = 0;

    const distance = (touches: TouchList) =>
      Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      wheelAccumulator += e.deltaY;
      if (Math.abs(wheelAccumulator) >= WHEEL_STEP) {
        step(wheelAccumulator < 0 ? 1 : -1);
        wheelAccumulator = 0;
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchBase = distance(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchBase === 0) return;
      e.preventDefault();
      const delta = densityStepForPinch(distance(e.touches) / pinchBase);
      if (delta !== 0) {
        step(delta);
        pinchBase = distance(e.touches);
      }
    };
    const onTouchEnd = () => {
      pinchBase = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, enabled]);
}
