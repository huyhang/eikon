import { useRef, type PointerEvent } from 'react';

const LONG_PRESS_MS = 480;

/** Pointer handlers that call `onLongPress` after a hold, or `onPress` for a normal tap/click. */
export function useLongPress(onPress: () => void, onLongPress?: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);

  const clear = () => window.clearTimeout(timer.current);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0 || !onLongPress) return;
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => {
      if (onLongPress) e.preventDefault();
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onPress();
    },
  };
}
