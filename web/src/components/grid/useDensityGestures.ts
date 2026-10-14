import { useEffect, type RefObject } from 'react';
import { densityStepForPinch } from '../../core/gestures';

const WHEEL_STEP = 60;

/** Pinch (touch) and ctrl/⌘+wheel (trackpad pinch) on the grid change its density. */
export function useDensityGestures(
  ref: RefObject<HTMLElement | null>,
  onStep: (delta: 1 | -1) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let wheelAccumulator = 0;
    let pinchBase = 0;

    const distance = (touches: TouchList) =>
      Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      wheelAccumulator += e.deltaY;
      if (Math.abs(wheelAccumulator) >= WHEEL_STEP) {
        onStep(wheelAccumulator < 0 ? 1 : -1);
        wheelAccumulator = 0;
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchBase = distance(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchBase === 0) return;
      e.preventDefault();
      const step = densityStepForPinch(distance(e.touches) / pinchBase);
      if (step !== 0) {
        onStep(step);
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
  }, [ref, onStep]);
}
